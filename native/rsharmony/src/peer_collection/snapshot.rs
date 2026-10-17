// SPDX-License-Identifier: AGPL-3.0-or-later
use super::{
    atomic_json, fail, packet, read_json, sync_directory, valid_id, Request, Result, Summary,
    MAX_METADATA,
};
use anki::collection::Collection;
use anki::sync::collection::changes::{server_apply_changes, ApplyChangesRequest};
use anki::sync::collection::chunks::{server_apply_chunk, server_chunk, ApplyChunkRequest};
use anki::sync::collection::graves::Graves;
use anki::sync::collection::start::{server_start, ServerSyncState, StartRequest};
use anki::types::Usn;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::Path;

const MAX_OBJECTS: usize = 250_000;
const MAX_CLOCK: u64 = 9_007_199_254_740_990;

#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(deny_unknown_fields)]
pub(super) struct Revision {
    pub clock: u64,
    pub origin: String,
    pub hash: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub(super) struct Object {
    pub version: Revision,
    pub time: i64,
    pub value: Value,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub(super) struct MediaRecord {
    pub version: Revision,
    pub bytes: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Ledger {
    pub created: i64,
    #[serde(default)]
    pub epoch: String,
    pub clock: u64,
    pub objects: BTreeMap<String, Revision>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct CommitJournal {
    before_modified: i64,
    after_modified: i64,
    ledger: Ledger,
    media: super::media::Commit,
}

/// The collection modification stamp witnesses the SQLite transaction without changing Core's schema.
pub(super) fn recover(root: &Path, modified: i64) -> Result<()> {
    let path = root.join(".device-collection/collection-commit.json");
    if !path.exists() {
        return Ok(());
    }
    let journal: CommitJournal =
        read_json(&path).map_err(|_| fail("device_collection_recovery"))?;
    if modified != journal.after_modified {
        if modified != journal.before_modified {
            return Err(fail("device_collection_recovery"));
        }
        // SQLite rolled back before committing; staged blobs have not touched live media.
        fs::remove_file(&path)?;
        sync_directory(
            path.parent()
                .ok_or_else(|| fail("device_collection_recovery"))?,
        )?;
        return Ok(());
    }
    if journal.ledger.clock > MAX_CLOCK
        || journal.ledger.objects.len() > MAX_OBJECTS
        || (!journal.ledger.epoch.is_empty() && !valid_id(&journal.ledger.epoch))
    {
        return Err(fail("device_collection_recovery"));
    }
    for revision in journal.ledger.objects.values() {
        validate_revision(revision)?;
    }
    atomic_json(
        &root.join(".device-collection/collection-state.json"),
        &journal.ledger,
    )
    .map_err(|_| fail("device_collection_recovery"))?;
    super::media::commit(root, journal.media).map_err(|_| fail("device_collection_recovery"))?;
    fs::remove_file(&path)?;
    sync_directory(
        path.parent()
            .ok_or_else(|| fail("device_collection_recovery"))?,
    )?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub(super) struct Snapshot {
    pub version: u32,
    pub created: i64,
    pub schema: i64,
    pub epoch: String,
    pub objects: BTreeMap<String, Object>,
    pub tags: Vec<String>,
    pub media: BTreeMap<String, MediaRecord>,
}

pub(super) fn hash(value: &Value) -> Result<String> {
    // serde_json maps are ordered; cloud-only USNs are normalized before hashing.
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}

pub(super) fn revision(clock: &mut u64, own: &str, hash: String) -> Result<Revision> {
    if *clock >= MAX_CLOCK {
        return Err(fail("device_collection_too_large"));
    }
    *clock += 1;
    Ok(Revision {
        clock: *clock,
        origin: own.into(),
        hash,
    })
}

pub(super) fn validate_revision(value: &Revision) -> Result<()> {
    if value.clock == 0
        || value.clock > MAX_CLOCK
        || !valid_id(&value.origin)
        || (!value.hash.is_empty()
            && (value.hash.len() != 64 || !value.hash.bytes().all(|b| b.is_ascii_hexdigit())))
    {
        return Err(fail("device_collection_invalid"));
    }
    Ok(())
}

fn key(table: &str, value: &Value) -> Result<String> {
    let id = value
        .get(0)
        .or_else(|| value.get("id"))
        .and_then(Value::as_i64)
        .ok_or_else(|| fail("device_collection_invalid"))?;
    if id <= 0 {
        return Err(fail("device_collection_invalid"));
    }
    Ok(format!("{table}:{id}"))
}

fn normalize(table: &str, value: &mut Value) {
    match table {
        "cards" => value[5] = json!(0),
        "notes" => value[4] = json!(0),
        "revlog" => value[2] = json!(0),
        _ => {
            value["usn"] = json!(0);
        }
    }
}

fn object_time(table: &str, value: &Value) -> i64 {
    match table {
        "cards" => value[4].as_i64().unwrap_or(0),
        "notes" => value[3].as_i64().unwrap_or(0),
        "revlog" => value[0].as_i64().unwrap_or(0),
        _ => value
            .get("mod")
            .or_else(|| value.get("mtime"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
    }
}

fn add(snapshot: &mut Snapshot, table: &str, mut value: Value) -> Result<()> {
    normalize(table, &mut value);
    let name = key(table, &value)?;
    let time = object_time(table, &value);
    if snapshot
        .objects
        .insert(
            name,
            Object {
                version: Revision::default(),
                time,
                value,
            },
        )
        .is_some()
    {
        return Err(fail("device_collection_invalid"));
    }
    if snapshot.objects.len() > MAX_OBJECTS {
        return Err(fail("device_collection_too_large"));
    }
    Ok(())
}

/// Public Core sync serializers export all rows; their temporary bookkeeping is rolled back.
fn read_core(col: &mut Collection) -> Result<Snapshot> {
    let (created, schema): (i64, i64) =
        col.storage
            .db()
            .query_row("select crt,scm from col", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;
    let mut state = ServerSyncState::new("jidecards-snapshot");
    let graves = server_start(
        StartRequest {
            client_usn: Usn(i32::MIN),
            local_is_newer: false,
            deprecated_client_graves: None,
        },
        col,
        &mut state,
    )?;
    let result = (|| -> Result<Snapshot> {
        let changes = serde_json::to_value(server_apply_changes(
            ApplyChangesRequest {
                changes: Default::default(),
            },
            col,
            &mut state,
        )?)?;
        let mut output = Snapshot {
            version: 2,
            created,
            schema,
            epoch: String::new(),
            objects: BTreeMap::new(),
            tags: serde_json::from_value(changes["tags"].clone())?,
            media: BTreeMap::new(),
        };
        for (table, values) in [
            ("notetypes", &changes["models"]),
            ("decks", &changes["decks"][0]),
            ("deck_config", &changes["decks"][1]),
        ] {
            for value in values
                .as_array()
                .ok_or_else(|| fail("device_collection_invalid"))?
            {
                add(&mut output, table, value.clone())?;
            }
        }
        let time: i64 = col.storage.db().query_row(
            "select coalesce(max(mtime_secs),0) from config",
            [],
            |r| r.get(0),
        )?;
        output.objects.insert(
            "config:0".into(),
            Object {
                version: Revision::default(),
                time,
                value: changes["conf"].clone(),
            },
        );
        loop {
            let chunk = server_chunk(col, &mut state)?;
            let done = chunk.done;
            let chunk = serde_json::to_value(chunk)?;
            for table in ["cards", "notes", "revlog"] {
                if let Some(values) = chunk[table].as_array() {
                    for value in values {
                        add(&mut output, table, value.clone())?;
                    }
                }
            }
            if done {
                break;
            }
        }
        let graves = serde_json::to_value(graves)?;
        for table in ["cards", "notes", "decks"] {
            for id in graves[table]
                .as_array()
                .ok_or_else(|| fail("device_collection_invalid"))?
            {
                let name = format!(
                    "{table}:{}",
                    id.as_i64()
                        .ok_or_else(|| fail("device_collection_invalid"))?
                );
                output.objects.entry(name).or_insert(Object {
                    version: Revision::default(),
                    time: 0,
                    value: Value::Null,
                });
            }
        }
        Ok(output)
    })();
    col.storage
        .db()
        .execute_batch("rollback to rust; release rust")?;
    result
}

fn load_ledger(root: &Path, created: i64) -> Result<Ledger> {
    let path = root.join(".device-collection/collection-state.json");
    if !path.exists() {
        return Ok(Ledger {
            created,
            ..Default::default()
        });
    }
    let state: Ledger = read_json(&path)?;
    if state.clock > MAX_CLOCK
        || state.objects.len() > MAX_OBJECTS
        || (!state.epoch.is_empty() && !valid_id(&state.epoch))
    {
        return Err(fail("device_collection_invalid"));
    }
    if state.created != created {
        return Ok(Ledger {
            created,
            clock: state.clock,
            ..Default::default()
        });
    }
    for entry in state.objects.values() {
        validate_revision(entry)?;
    }
    Ok(state)
}

fn attach_revisions(
    snapshot: &mut Snapshot,
    ledger: &mut Ledger,
    own: &str,
    preferred: Option<&BTreeMap<String, Object>>,
) -> Result<()> {
    if preferred.is_none()
        && snapshot.objects.iter().any(|(name, object)| {
            !object.value.is_null()
                && ledger
                    .objects
                    .get(name)
                    .is_some_and(|old| old.hash.is_empty())
        })
    {
        // Restoring deleted identities must not silently replay a stale peer's graves.
        // A new extension lineage requires the same explicit direction choice as a Core schema change.
        let stamp = revision(&mut ledger.clock, own, String::new())?;
        ledger.epoch = hash(&serde_json::to_value(stamp)?)?[..32].into();
        ledger.objects.clear();
    }
    snapshot.epoch = ledger.epoch.clone();
    // Retain deletion records even after a cloud full upload clears Core graves.
    for (name, version) in &ledger.objects {
        if !snapshot.objects.contains_key(name) && !name.starts_with("revlog:") {
            snapshot.objects.insert(
                name.clone(),
                Object {
                    version: version.clone(),
                    time: 0,
                    value: Value::Null,
                },
            );
        }
    }
    for (name, object) in &mut snapshot.objects {
        let digest = if object.value.is_null() {
            String::new()
        } else {
            hash(&object.value)?
        };
        let remote = preferred
            .and_then(|values| values.get(name))
            .map(|value| &value.version);
        let old = ledger.objects.get(name);
        object.version = if let Some(version) = remote.filter(|v| v.hash == digest) {
            version.clone()
        } else if let Some(version) = old.filter(|v| v.hash == digest) {
            version.clone()
        } else {
            revision(&mut ledger.clock, own, digest)?
        };
        ledger.clock = ledger.clock.max(object.version.clock);
        ledger.objects.insert(name.clone(), object.version.clone());
    }
    if ledger.objects.len() > MAX_OBJECTS {
        return Err(fail("device_collection_too_large"));
    }
    Ok(())
}

pub(super) fn read_snapshot(path: &Path) -> Result<Snapshot> {
    let snapshot: Snapshot = read_json(path)?;
    if snapshot.version != 2
        || snapshot.created <= 0
        || snapshot.schema <= 0
        || (!snapshot.epoch.is_empty() && !valid_id(&snapshot.epoch))
        || snapshot.objects.len() > MAX_OBJECTS
        || snapshot.media.len() > 100_000
        || snapshot.tags.len() > 100_000
    {
        return Err(fail("device_collection_invalid"));
    }
    for required in ["config:0", "decks:1"] {
        if snapshot
            .objects
            .get(required)
            .is_none_or(|object| object.value.is_null())
        {
            return Err(fail("device_collection_invalid"));
        }
    }
    for (name, object) in &snapshot.objects {
        validate_revision(&object.version)?;
        let (table, id) = name
            .split_once(':')
            .ok_or_else(|| fail("device_collection_invalid"))?;
        if ![
            "cards",
            "notes",
            "revlog",
            "notetypes",
            "decks",
            "deck_config",
            "config",
        ]
        .contains(&table)
            || !id.parse::<i64>().is_ok_and(|value| value.to_string() == id)
            || (table == "config" && id != "0")
            || (table != "config" && id.parse::<i64>().is_ok_and(|id| id <= 0))
            || (object.value.is_null() != object.version.hash.is_empty())
        {
            return Err(fail("device_collection_invalid"));
        }
        if !object.value.is_null() {
            let valid_shape = match table {
                "cards" => object
                    .value
                    .as_array()
                    .is_some_and(|values| values.len() == 18),
                "notes" => object
                    .value
                    .as_array()
                    .is_some_and(|values| values.len() == 11),
                "revlog" => object
                    .value
                    .as_array()
                    .is_some_and(|values| values.len() == 9),
                _ => object.value.is_object(),
            };
            if !valid_shape
                || (table != "config" && object.time != object_time(table, &object.value))
            {
                return Err(fail("device_collection_invalid"));
            }
        }
        if !object.value.is_null()
            && (hash(&object.value)? != object.version.hash
                || (table != "config" && key(table, &object.value)? != *name))
        {
            return Err(fail("device_collection_invalid"));
        }
    }
    for (name, value) in &snapshot.media {
        super::media::validate(name, value)?;
    }
    Ok(snapshot)
}

pub(super) fn export(
    col: &mut Collection,
    root: &Path,
    request: &Request,
    path: &Path,
) -> Result<Summary> {
    let mut snapshot = read_core(col)?;
    let mut ledger = load_ledger(root, snapshot.created)?;
    attach_revisions(&mut snapshot, &mut ledger, &request.own, None)?;
    snapshot.media = super::media::capture(root, &request.own)?;
    let mut writer = BufWriter::new(
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?,
    );
    let result = (|| -> Result<Summary> {
        serde_json::to_writer(&mut writer, &snapshot)?;
        writer.flush()?;
        writer.get_ref().sync_all()?;
        let bytes = writer.get_ref().metadata()?.len();
        if bytes > MAX_METADATA {
            return Err(fail("device_collection_too_large"));
        }
        atomic_json(
            &root.join(".device-collection/collection-state.json"),
            &ledger,
        )?;
        Ok(Summary {
            bytes,
            ..Default::default()
        })
    })();
    if result.is_err() {
        drop(writer);
        let _ = fs::remove_file(path);
    }
    result
}

fn latest_reviews(snapshot: &Snapshot) -> BTreeMap<i64, i64> {
    let mut latest = BTreeMap::<i64, i64>::new();
    for (name, object) in &snapshot.objects {
        if name.starts_with("revlog:") && !object.value.is_null() {
            if let (Some(id), Some(cid)) = (object.value[0].as_i64(), object.value[1].as_i64()) {
                latest
                    .entry(cid)
                    .and_modify(|old| *old = (*old).max(id))
                    .or_insert(id);
            }
        }
    }
    latest
}

fn reconcile(
    local: &Snapshot,
    incoming: &Snapshot,
    authoritative: bool,
) -> Result<BTreeMap<String, Object>> {
    let mut output = local.objects.clone();
    let left_reviews = latest_reviews(local);
    let right_reviews = latest_reviews(incoming);
    for (name, remote) in &incoming.objects {
        let take = if let Some(old) = local.objects.get(name) {
            if name.starts_with("revlog:") && !old.value.is_null() && old.value != remote.value {
                return Err(fail("device_collection_record_conflict"));
            }
            if name.starts_with("notes:")
                && !old.value.is_null()
                && !remote.value.is_null()
                && old.value[1] != remote.value[1]
            {
                return Err(fail("device_collection_record_conflict"));
            }
            if name.starts_with("cards:")
                && !old.value.is_null()
                && !remote.value.is_null()
                && (old.value[1] != remote.value[1] || old.value[3] != remote.value[3])
            {
                return Err(fail("device_collection_record_conflict"));
            }
            if authoritative {
                true
            } else if old.value.is_null() || remote.value.is_null() {
                // Normal Anki synchronization applies graves before changes: stale edits cannot restore deleted identities.
                remote.value.is_null()
            } else {
                let card = name.starts_with("cards:");
                let id = remote.value[0].as_i64().unwrap_or(0);
                let left_review = if card {
                    left_reviews.get(&id).copied().unwrap_or(0)
                } else {
                    0
                };
                let right_review = if card {
                    right_reviews.get(&id).copied().unwrap_or(0)
                } else {
                    0
                };
                // Later manual edits (suspend/reschedule/flag) take precedence; review IDs resolve same-second answers.
                (remote.time, right_review, &remote.version) > (old.time, left_review, &old.version)
            }
        } else {
            true
        };
        if take {
            output.insert(name.clone(), remote.clone());
        }
    }
    Ok(output)
}

fn reconcile_references(
    objects: &mut BTreeMap<String, Object>,
    ledger: &mut Ledger,
    own: &str,
) -> Result<()> {
    let mut edits = Vec::new();
    for (name, object) in objects
        .iter()
        .filter(|(name, object)| name.starts_with("cards:") && !object.value.is_null())
    {
        let note = format!("notes:{}", object.value[1]);
        let deck = format!("decks:{}", object.value[2]);
        if objects
            .get(&note)
            .is_some_and(|parent| parent.value.is_null())
        {
            edits.push((
                name.clone(),
                Object {
                    value: Value::Null,
                    time: 0,
                    version: revision(&mut ledger.clock, own, String::new())?,
                },
            ));
            continue;
        }
        if let Some(original) = object.value[15].as_i64().filter(|id| *id > 0) {
            if objects
                .get(&format!("decks:{original}"))
                .is_none_or(|parent| parent.value.is_null())
                || objects
                    .get(&deck)
                    .is_none_or(|parent| parent.value.is_null())
            {
                // Returning a filtered card also restores queue/due: only Core may perform that operation.
                return Err(fail("device_collection_filtered"));
            }
        }
        if objects
            .get(&deck)
            .is_some_and(|parent| parent.value.is_null())
        {
            // Preserve cards created/moved into a concurrently removed deck by returning them to Default.
            if objects
                .get("decks:1")
                .is_none_or(|default| default.value.is_null())
            {
                return Err(fail("device_collection_invalid"));
            }
            let mut moved = object.clone();
            moved.value[2] = json!(1);
            moved.version = revision(&mut ledger.clock, own, hash(&moved.value)?)?;
            edits.push((name.clone(), moved));
        }
    }
    objects.extend(edits);
    Ok(())
}

fn pending_value(table: &str, object: &Object, old: Option<&Object>) -> Value {
    let mut value = object.value.clone();
    let time = old
        .filter(|old| !old.value.is_null())
        .map(|old| old.time)
        .unwrap_or(-1);
    let advance = object.time <= time && old.is_some_and(|old| old.value != value);
    match table {
        "cards" => {
            value[5] = json!(-1);
            if advance {
                value[4] = json!(time.saturating_add(1));
            }
        }
        "notes" => {
            value[4] = json!(-1);
            if advance {
                value[3] = json!(time.saturating_add(1));
            }
        }
        "revlog" => {
            value[2] = json!(-1);
        }
        _ => {
            value["usn"] = json!(-1);
            if advance {
                value["mod"] = json!(time.saturating_add(1));
            }
        }
    }
    value
}

pub(super) fn apply(col: &mut Collection, root: &Path, request: &Request) -> Result<Summary> {
    if !["merge", "final", "replace", "media"].contains(&request.mode.as_str()) {
        return Err(fail("device_collection_invalid"));
    }
    let incoming = read_snapshot(&packet(root, &request.token)?)?;
    let mut local = read_core(col)?;
    let replace = request.mode == "replace";
    if request.mode == "media" {
        let media = super::media::prepare(
            root,
            &incoming,
            &packet(root, &request.payload)?,
            &request.own,
        )?;
        let (updated_media, deleted_media) = super::media::commit(root, media)?;
        return Ok(Summary {
            updated_media,
            deleted_media,
            ..Default::default()
        });
    }
    let mut ledger = load_ledger(root, local.created)?;
    attach_revisions(&mut local, &mut ledger, &request.own, None)?;
    if !replace
        && (local.created != incoming.created
            || local.schema != incoming.schema
            || local.epoch != incoming.epoch)
    {
        return Err(fail("device_collection_full_required"));
    }
    ledger.clock = ledger.clock.max(
        incoming
            .objects
            .values()
            .map(|value| value.version.clock)
            .max()
            .unwrap_or(0),
    );
    let mut desired = if replace {
        incoming.objects.clone()
    } else {
        reconcile(&local, &incoming, request.mode == "final")?
    };
    reconcile_references(&mut desired, &mut ledger, &request.own)?;
    // All received media is checked and staged before any collection write.
    let media = super::media::prepare(
        root,
        &incoming,
        &packet(root, &request.payload)?,
        &request.own,
    )?;
    if replace {
        // Also create a standard archive visible in the existing local-backup restore UI.
        let visible_backups = root.join("backups");
        fs::create_dir_all(&visible_backups)?;
        let backup_task = col
            .maybe_backup(visible_backups, true)?
            .ok_or_else(|| fail("device_collection_failed"))?;
        backup_task
            .join()
            .map_err(|_| fail("device_collection_failed"))??;
        let backups = root.join(".device-collection/backups");
        fs::create_dir_all(&backups)?;
        let backup = backups.join(format!("{}.anki2", request.token));
        if !backup.exists() {
            col.storage.db().backup("main", &backup, None)?;
        }
    }
    let before_modified: i64 = col
        .storage
        .db()
        .query_row("select mod from col", [], |r| r.get(0))?;
    col.storage.db().execute_batch("begin immediate")?;
    let result = (|| -> Result<Summary> {
        if replace {
            for table in [
                "fields",
                "templates",
                "cards",
                "notes",
                "revlog",
                "notetypes",
                "decks",
                "deck_config",
                "config",
                "tags",
                "graves",
            ] {
                col.storage
                    .db()
                    .execute(&format!("delete from {table}"), [])?;
            }
            col.storage.db().execute(
                "update col set crt=?,scm=?,ls=0",
                rusqlite::params![incoming.created, incoming.schema],
            )?;
            ledger = Ledger {
                created: incoming.created,
                epoch: incoming.epoch.clone(),
                clock: ledger.clock,
                objects: BTreeMap::new(),
            };
        }
        let mut state = ServerSyncState::new("jidecards-peer-apply");
        server_start(
            StartRequest {
                client_usn: Usn(i32::MAX),
                local_is_newer: true,
                deprecated_client_graves: None,
            },
            col,
            &mut state,
        )?;
        let mut changes = json!({"models":[],"decks":[[],[]],"tags":[]});
        let mut graves = json!({"cards":[],"notes":[],"decks":[]});
        let mut chunks = BTreeMap::<&str, Vec<Value>>::new();
        let mut summary = Summary::default();
        let tags: BTreeSet<String> = if replace {
            incoming.tags.iter().cloned().collect()
        } else {
            local
                .tags
                .iter()
                .chain(incoming.tags.iter())
                .cloned()
                .collect()
        };
        changes["tags"] = serde_json::to_value(tags)?;
        for (name, object) in &desired {
            let (table, id) = name
                .split_once(':')
                .ok_or_else(|| fail("device_collection_invalid"))?;
            let old = if replace {
                None
            } else {
                local.objects.get(name)
            };
            if old.is_some_and(|old| old.value == object.value) {
                continue;
            }
            if object.value.is_null() {
                if !["cards", "notes", "decks"].contains(&table) {
                    if !replace {
                        return Err(fail("device_collection_full_required"));
                    }
                    continue;
                }
                graves[table]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(id.parse::<i64>()?));
            } else {
                let value = if table == "config" {
                    object.value.clone()
                } else {
                    pending_value(table, object, old)
                };
                match table {
                    "notetypes" => changes["models"].as_array_mut().unwrap().push(value),
                    "decks" => changes["decks"][0].as_array_mut().unwrap().push(value),
                    "deck_config" => changes["decks"][1].as_array_mut().unwrap().push(value),
                    "config" => {
                        changes["conf"] = value;
                    }
                    "cards" | "notes" | "revlog" => {
                        chunks.entry(table).or_default().push(value);
                    }
                    _ => return Err(fail("device_collection_invalid")),
                }
            }
            if table == "revlog" && old.is_none() {
                summary.added_reviews += 1;
            } else {
                summary.updated_objects += 1;
            }
        }
        col.apply_graves(serde_json::from_value::<Graves>(graves)?, Usn(-1))?;
        server_apply_changes(
            serde_json::from_value(json!({"changes":changes}))?,
            col,
            &mut state,
        )?;
        for table in ["revlog", "notes", "cards"] {
            for values in chunks.remove(table).unwrap_or_default().chunks(250) {
                let mut chunk = json!({"done":true});
                chunk[table] = json!(values);
                server_apply_chunk(
                    serde_json::from_value::<ApplyChunkRequest>(json!({"chunk":chunk}))?,
                    col,
                    &mut state,
                )?;
            }
        }
        // Core remains responsible for record parsing, note preparation and scheduling state storage.
        let invalid: bool = col.storage.db().query_row(
            "select exists(select 1 from cards c left join notes n on n.id=c.nid left join decks d on d.id=c.did where n.id is null or d.id is null) or exists(select 1 from notes n left join notetypes t on t.id=n.mid where t.id is null)", [], |r| r.get(0))?;
        if invalid {
            return Err(fail("device_collection_invalid"));
        }
        if summary.updated_objects + summary.added_reviews > 0 || replace {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_millis() as i64;
            col.storage
                .db()
                .execute("update col set mod=max(mod+1,?)", [now])?;
        }
        col.storage.db().execute_batch("release rust")?;
        let mut after = read_core(col)?;
        attach_revisions(&mut after, &mut ledger, &request.own, Some(&desired))?;
        let after_modified: i64 = col
            .storage
            .db()
            .query_row("select mod from col", [], |r| r.get(0))?;
        let (updated, deleted) = super::media::counts(&media);
        // Persist revisions and verified media intent before SQLite commit, including its exact witness.
        atomic_json(
            &root.join(".device-collection/collection-commit.json"),
            &CommitJournal {
                before_modified,
                after_modified,
                ledger,
                media,
            },
        )?;
        col.storage.db().execute_batch("commit")?;
        recover(root, after_modified)?;
        summary.updated_media = updated;
        summary.deleted_media = deleted;
        Ok(summary)
    })();
    if result.is_err() && !col.storage.db().is_autocommit() {
        col.storage.db().execute_batch("rollback")?;
    }
    result
}
