// SPDX-License-Identifier: AGPL-3.0-or-later
use super::snapshot::{revision, validate_revision, MediaRecord, Snapshot};
use super::{
    atomic_json, fail, packet, read_json, sync_directory, Request, Result, Summary, MAX_PACKET,
};
use anki::media::MediaManager;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

// Matches the bounded-file nature of upstream media sync. Packet IO itself streams.
const MAX_FILE: u64 = 100 * 1024 * 1024;
#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct State {
    clock: u64,
    entries: BTreeMap<String, MediaRecord>,
    #[serde(default)]
    confirmed: BTreeSet<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Wanted {
    files: BTreeMap<String, MediaRecord>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Commit {
    entries: BTreeMap<String, MediaRecord>,
    changes: BTreeSet<String>,
    clock: u64,
    #[serde(default)]
    confirmed: BTreeSet<String>,
}

pub(super) fn validate(name: &str, record: &MediaRecord) -> Result<()> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty()
        || name.len() > 120
        || !unicode_normalization::is_nfc(name)
        || name == "."
        || name == ".."
        || name.chars().any(|c| {
            c.is_control()
                || c == '\u{a0}'
                || unic_ucd_category::GeneralCategory::of(c)
                    == unic_ucd_category::GeneralCategory::Unassigned
                || "<>:\"/\\|?*[]^".contains(c)
        })
        || name.ends_with([' ', '.'])
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&stem.as_str())
        || record.bytes > MAX_FILE
        || (record.version.hash.is_empty() && record.bytes != 0)
    {
        return Err(fail("device_collection_invalid"));
    }
    validate_revision(&record.version)
}

fn digest(path: &Path) -> Result<String> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_FILE {
        return Err(fail("device_collection_too_large"));
    }
    let mut reader = BufReader::new(File::open(path)?);
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn state(root: &Path) -> Result<State> {
    let path = root.join(".device-collection/media-state.json");
    let state: State = if path.exists() {
        read_json(&path)?
    } else {
        State::default()
    };
    if state.entries.len() > 100_000 || state.clock > 9_007_199_254_740_990 {
        return Err(fail("device_collection_invalid"));
    }
    for (name, value) in &state.entries {
        validate(name, value)?;
    }
    if state.confirmed.len() > state.entries.len()
        || state
            .confirmed
            .iter()
            .any(|name| !state.entries.contains_key(name))
    {
        return Err(fail("device_collection_invalid"));
    }
    Ok(state)
}

pub(super) fn capture(root: &Path, own: &str) -> Result<BTreeMap<String, MediaRecord>> {
    let mut state = state(root)?;
    let folder = root.join("collection.media");
    fs::create_dir_all(&folder)?;
    let mut found = BTreeSet::new();
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        // Never follow external paths through symlinks or include subdirectories/trash.
        if !entry.file_type()?.is_file() {
            continue;
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| fail("device_collection_invalid"))?;
        if ["thumbs.db", ".ds_store"].contains(&name.to_lowercase().as_str()) {
            continue;
        }
        let bytes = entry.metadata()?.len();
        let hash = digest(&entry.path())?;
        let version = if let Some(old) = state
            .entries
            .get(&name)
            .filter(|old| old.version.hash == hash)
        {
            old.version.clone()
        } else {
            revision(&mut state.clock, own, hash)?
        };
        let record = MediaRecord { bytes, version };
        validate(&name, &record)?;
        state.entries.insert(name.clone(), record);
        found.insert(name);
    }
    let mut unconfirmed = Vec::new();
    for (name, value) in &mut state.entries {
        if !found.contains(name) && !value.version.hash.is_empty() {
            if state.confirmed.contains(name) {
                value.version = revision(&mut state.clock, own, String::new())?;
                value.bytes = 0;
            } else {
                // Merely exporting/scanning a file does not establish a successful media baseline.
                unconfirmed.push(name.clone());
            }
        }
    }
    for name in unconfirmed {
        state.entries.remove(&name);
    }
    if state.entries.len() > 100_000 {
        return Err(fail("device_collection_too_large"));
    }
    atomic_json(&root.join(".device-collection/media-state.json"), &state)?;
    Ok(state.entries)
}

fn selected(
    local: &BTreeMap<String, MediaRecord>,
    remote: &BTreeMap<String, MediaRecord>,
) -> BTreeMap<String, MediaRecord> {
    let mut entries = local.clone();
    for (name, incoming) in remote {
        if local
            .get(name)
            .is_none_or(|old| incoming.version > old.version)
        {
            entries.insert(name.clone(), incoming.clone());
        }
    }
    entries
}

fn cached(root: &Path, record: &MediaRecord) -> bool {
    !record.version.hash.is_empty()
        && digest(
            &root
                .join(".device-collection/blobs")
                .join(&record.version.hash),
        )
        .is_ok_and(|hash| hash == record.version.hash)
}

pub(super) fn plan(root: &Path, request: &Request) -> Result<Summary> {
    let incoming = super::snapshot::read_snapshot(&packet(root, &request.token)?)?;
    let local = super::snapshot::read_snapshot(&packet(root, &request.local)?)?;
    if request.mode == "merge"
        && (local.created != incoming.created
            || local.schema != incoming.schema
            || local.epoch != incoming.epoch)
    {
        return Err(fail("device_collection_full_required"));
    }
    let entries = selected(&local.media, &incoming.media);
    let mut files = BTreeMap::new();
    for (name, winner) in entries {
        let local_hash = local
            .media
            .get(&name)
            .map(|value| value.version.hash.as_str())
            .unwrap_or("");
        if !winner.version.hash.is_empty()
            && winner.version.hash != local_hash
            && !cached(root, &winner)
        {
            files.insert(name, winner);
        }
    }
    let path = packet(root, &request.out)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)?;
    serde_json::to_writer(&mut file, &Wanted { files })?;
    file.sync_all()?;
    Ok(Summary {
        bytes: file.metadata()?.len(),
        ..Default::default()
    })
}

pub(super) fn pack(root: &Path, request: &Request) -> Result<Summary> {
    let wanted: Wanted = read_json(&packet(root, &request.token)?)?;
    let source = super::snapshot::read_snapshot(&packet(root, &request.local)?)?;
    if wanted.files.len() > 100_000 {
        return Err(fail("device_collection_invalid"));
    }
    let output = packet(root, &request.out)?;
    let mut writer = BufWriter::new(
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)?,
    );
    let result = (|| -> Result<Summary> {
        writer.write_all(&(wanted.files.len() as u64).to_be_bytes())?;
        let mut total = 8_u64;
        for (name, record) in wanted.files {
            validate(&name, &record)?;
            if record.version.hash.is_empty()
                || source
                    .media
                    .get(&name)
                    .is_none_or(|v| v.version != record.version || v.bytes != record.bytes)
            {
                return Err(fail("device_collection_invalid"));
            }
            let path = root.join("collection.media").join(&name);
            if digest(&path)? != record.version.hash || fs::metadata(&path)?.len() != record.bytes {
                return Err(fail("device_collection_invalid"));
            }
            let header = serde_json::to_vec(&(name, record))?;
            total = total
                .checked_add(4 + header.len() as u64 + fs::metadata(&path)?.len())
                .ok_or_else(|| fail("device_collection_too_large"))?;
            if total > MAX_PACKET || header.len() > 4096 {
                return Err(fail("device_collection_too_large"));
            }
            writer.write_all(&(header.len() as u32).to_be_bytes())?;
            writer.write_all(&header)?;
            std::io::copy(&mut File::open(path)?, &mut writer)?;
        }
        writer.flush()?;
        writer.get_ref().sync_all()?;
        Ok(Summary {
            bytes: writer.get_ref().metadata()?.len(),
            ..Default::default()
        })
    })();
    if result.is_err() {
        drop(writer);
        let _ = fs::remove_file(output);
    }
    result
}

pub(super) fn prepare(
    root: &Path,
    incoming: &Snapshot,
    payload: &Path,
    own: &str,
) -> Result<Commit> {
    let local = capture(root, own)?;
    let entries = selected(&local, &incoming.media);
    let folder = root.join(".device-collection/blobs");
    fs::create_dir_all(&folder)?;
    if fs::metadata(payload)?.len() > MAX_PACKET {
        return Err(fail("device_collection_too_large"));
    }
    let mut reader = BufReader::new(File::open(payload)?);
    let mut count = [0_u8; 8];
    reader.read_exact(&mut count)?;
    let count = u64::from_be_bytes(count);
    if count > 100_000 {
        return Err(fail("device_collection_invalid"));
    }
    let mut received = BTreeSet::new();
    for _ in 0..count {
        let mut length = [0_u8; 4];
        reader.read_exact(&mut length)?;
        let length = u32::from_be_bytes(length) as usize;
        if length > 4096 {
            return Err(fail("device_collection_invalid"));
        }
        let mut header = vec![0; length];
        reader.read_exact(&mut header)?;
        let (name, record): (String, MediaRecord) = serde_json::from_slice(&header)?;
        validate(&name, &record)?;
        if record.version.hash.is_empty()
            || !received.insert(name.clone())
            || entries
                .get(&name)
                .is_none_or(|v| v.version != record.version || v.bytes != record.bytes)
            || incoming
                .media
                .get(&name)
                .is_none_or(|v| v.version != record.version)
        {
            return Err(fail("device_collection_invalid"));
        }
        let partial = folder.join(format!("{}.part", record.version.hash));
        let mut file = File::create(&partial)?;
        if std::io::copy(&mut (&mut reader).take(record.bytes), &mut file)? != record.bytes {
            return Err(fail("device_collection_invalid"));
        }
        file.sync_all()?;
        drop(file);
        if digest(&partial)? != record.version.hash {
            return Err(fail("device_collection_invalid"));
        }
        fs::rename(partial, folder.join(&record.version.hash))?;
    }
    if reader.read(&mut [0_u8; 1])? != 0 {
        return Err(fail("device_collection_invalid"));
    }
    let mut changes = BTreeSet::new();
    let saved = state(root)?;
    let mut clock = saved.clock;
    let mut confirmed = saved.confirmed;
    for (name, winner) in &entries {
        clock = clock.max(winner.version.clock);
        if incoming.media.get(name).is_some_and(|remote| {
            !remote.version.hash.is_empty() && remote.version.hash == winner.version.hash
        }) {
            confirmed.insert(name.clone());
        }
        let old_hash = local
            .get(name)
            .map(|v| v.version.hash.as_str())
            .unwrap_or("");
        if winner.version.hash != old_hash {
            if !winner.version.hash.is_empty() && !cached(root, winner) {
                return Err(fail("device_collection_invalid"));
            }
            changes.insert(name.clone());
        }
    }
    Ok(Commit {
        entries,
        changes,
        clock,
        confirmed,
    })
}

pub(super) fn commit(root: &Path, pending: Commit) -> Result<(u64, u64)> {
    let (updated, deleted) = counts(&pending);
    atomic_json(&root.join(".device-collection/media-commit.json"), &pending)?;
    recover(root)?;
    Ok((updated, deleted))
}

pub(super) fn counts(pending: &Commit) -> (u64, u64) {
    let updated = pending
        .changes
        .iter()
        .filter(|name| !pending.entries[*name].version.hash.is_empty())
        .count() as u64;
    let deleted = pending.changes.len() as u64 - updated;
    (updated, deleted)
}

/// The final authenticated acknowledgement proves that the other endpoint committed this snapshot.
pub(super) fn confirm(root: &Path, snapshot: &Snapshot) -> Result<Summary> {
    let mut saved = state(root)?;
    for (name, record) in &snapshot.media {
        if !record.version.hash.is_empty()
            && saved
                .entries
                .get(name)
                .is_some_and(|current| current.version == record.version)
        {
            saved.confirmed.insert(name.clone());
        }
    }
    atomic_json(&root.join(".device-collection/media-state.json"), &saved)?;
    Ok(Summary::default())
}

/// Replay after interruption before allowing either media sync or another peer transfer.
pub(super) fn recover(root: &Path) -> Result<()> {
    let path = root.join(".device-collection/media-commit.json");
    if !path.exists() {
        return Ok(());
    }
    let pending: Commit = read_json(&path)?;
    if pending.entries.len() > 100_000
        || pending.changes.len() > pending.entries.len()
        || pending
            .confirmed
            .iter()
            .any(|name| !pending.entries.contains_key(name))
    {
        return Err(fail("device_collection_recovery"));
    }
    for (name, record) in &pending.entries {
        validate(name, record)?;
    }
    let manager = MediaManager::new(root.join("collection.media"), root.join("collection.mdb"))?;
    manager.register_changes(&mut |_| true)?;
    for name in &pending.changes {
        let record = pending
            .entries
            .get(name)
            .ok_or_else(|| fail("device_collection_recovery"))?;
        if record.version.hash.is_empty() {
            manager.remove_files(&[name])?;
        } else {
            let cached = root
                .join(".device-collection/blobs")
                .join(&record.version.hash);
            if digest(&cached)? != record.version.hash {
                return Err(fail("device_collection_recovery"));
            }
            let target = root.join("collection.media").join(name);
            if target.exists() && digest(&target)? != record.version.hash {
                let backup_dir = root.join(".device-collection/media-backups");
                fs::create_dir_all(&backup_dir)?;
                let backup = backup_dir.join(digest(&target)?);
                if !backup.exists() {
                    fs::copy(&target, backup)?;
                }
            }
            let temporary = root.join(".device-collection").join("media-receiving");
            fs::copy(&cached, &temporary)?;
            OpenOptions::new()
                .write(true)
                .open(&temporary)?
                .sync_all()?;
            fs::rename(&temporary, &target)?;
            // add_file sees identical bytes in place and records the original name as pending cloud upload.
            if manager.add_file(name, &fs::read(&target)?)?.as_ref() != name {
                return Err(fail("device_collection_recovery"));
            }
        }
    }
    atomic_json(
        &root.join(".device-collection/media-state.json"),
        &State {
            clock: pending.clock,
            entries: pending.entries,
            confirmed: pending.confirmed,
        },
    )?;
    fs::remove_file(&path)?;
    sync_directory(
        path.parent()
            .ok_or_else(|| fail("device_collection_recovery"))?,
    )?;
    Ok(())
}
