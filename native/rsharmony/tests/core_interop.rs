// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

#[test]
fn package_roundtrip_preserves_flags_and_exact_marks_only_with_scheduling() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    src.storage
        .db()
        .execute_batch(
            "UPDATE cards SET flags=7; UPDATE notes SET tags=' marked marked::child topic ';",
        )
        .unwrap();
    let labels = json!({"1":"待修改","7":"重点","future":{"nested":[true,7]}});
    src.set_config_json("flagLabels", &labels, false).unwrap();
    for (legacy, scheduling) in [(false, false), (false, true), (true, false), (true, true)] {
        let package = root.join(format!("markings-{legacy}-{scheduling}.apkg"));
        export(&mut src, &package, legacy, scheduling, true);
        let target = root.join(format!("target-{legacy}-{scheduling}"));
        let native = Native::new();
        native.open(&target);
        native.import(&package, options(true)).unwrap();
        native.close();
        assert_eq!(
            rows(&target, "SELECT DISTINCT flags FROM cards"),
            json!([[if scheduling { 7 } else { 0 }]])
        );
        assert_eq!(
            rows(
                &target,
                "SELECT count(*) FROM notes WHERE tags LIKE '% marked %'"
            ),
            json!([[if scheduling { 7 } else { 0 }]])
        );
        assert_eq!(
            rows(
                &target,
                "SELECT count(*) FROM notes WHERE tags LIKE '% marked::child %'"
            ),
            json!([[7]])
        );
        assert_eq!(
            rows(
                &target,
                "SELECT count(*) FROM config WHERE key='flagLabels'"
            ),
            json!([[0]]),
            "APKG does not replace global collection configuration"
        );
    }
    for legacy in [false, true] {
        let package = root.join(format!("markings-{legacy}.colpkg"));
        src.export_colpkg(&package, false, legacy).unwrap();
        src = open(&source);
        let target = root.join(format!("collection-{legacy}"));
        fs::create_dir_all(&target).unwrap();
        Native::new().restore(&target, &package).unwrap();
        assert_eq!(
            rows(&target, "SELECT DISTINCT flags FROM cards"),
            json!([[7]])
        );
        assert_eq!(
            rows(
                &target,
                "SELECT count(*) FROM notes WHERE tags LIKE '% marked %'"
            ),
            json!([[7]])
        );
        assert_eq!(
            rows(&target, "SELECT val FROM config WHERE key='flagLabels'"),
            json!([[labels.clone()]])
        );
    }
    src.close(None).unwrap();
}

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use anki::collection::{Collection, CollectionBuilder};
use anki::config::BoolKey;
use anki::deckconfig::{DeckConfig, UpdateDeckConfigsRequest};
use anki::import_export::package::{ExportAnkiPackageOptions, ImportAnkiPackageOptions};
use anki::notes::NoteId;
use anki::scheduler::answering::{CardAnswer, Rating};
use anki::search::SearchNode;
use anki::timestamp::TimestampMillis;
use anki_proto::backend::BackendError;
use anki_proto::collection::{CloseCollectionRequest, OpenCollectionRequest, Progress};
use anki_proto::import_export::{
    ImportAnkiPackageRequest, ImportCollectionPackageRequest, ImportResponse,
};
use jidecards_core::{
    anki_backend_call, anki_backend_close, anki_backend_open, anki_buffer_free, AnkiBuffer,
    STATUS_BACKEND_ERROR, STATUS_OK,
};
use prost::Message;
use rusqlite::{types::ValueRef, Connection, OpenFlags};
use serde_json::{json, Value};

const DECK: &str = "Interop synthetic::Core 26.05";
const UNKNOWN: &[u8] = r#"{"interopUnknown":{"nested":[true,7,"中文"],"future":null}}"#.as_bytes();

// All collections live in a fresh directory owned by this test. No profile discovery.
fn open(root: &Path) -> Collection {
    fs::create_dir_all(root.join("collection.media")).unwrap();
    CollectionBuilder::new(root.join("collection.anki2"))
        .set_media_paths(root.join("collection.media"), root.join("collection.mdb"))
        .build()
        .unwrap()
}

fn rows(root: &Path, sql: &str) -> Value {
    let db = Connection::open_with_flags(
        root.join("collection.anki2"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    let mut stmt = db.prepare(sql).unwrap();
    let count = stmt.column_count();
    let result: Vec<Vec<Value>> = stmt
        .query_map([], |row| {
            (0..count)
                .map(|i| {
                    Ok(match row.get_ref(i)? {
                        ValueRef::Null => Value::Null,
                        ValueRef::Integer(v) => json!(v),
                        ValueRef::Real(v) => json!(v),
                        ValueRef::Text(v) => {
                            let s = std::str::from_utf8(v).unwrap();
                            // Card data is JSON: key order is not a compatibility contract.
                            serde_json::from_str(s).unwrap_or_else(|_| json!(s))
                        }
                        ValueRef::Blob(v) => serde_json::from_slice(v).unwrap_or_else(|_| json!(v)),
                    })
                })
                .collect()
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    json!(result)
}

fn snapshot(col: &mut Collection, root: &Path) -> Value {
    let mut notetypes = BTreeMap::new();
    for nt in col.get_all_notetypes().unwrap() {
        if !nt.name.starts_with("Interop ") {
            continue;
        }
        let mut config = nt.config.clone();
        // APKG records import provenance; preserve every other config property.
        config.original_id = None;
        config.other = canonical_other(&config.other);
        notetypes.insert(
            nt.name.clone(),
            json!({
                "config": config.encode_to_vec(),
                "fields": nt.fields.iter().map(|f| {let mut config=f.config.clone();config.other=canonical_other(&config.other);json!([f.name, f.ord, config.encode_to_vec()])}).collect::<Vec<_>>(),
                "templates": nt.templates.iter().map(|t| {let mut config=t.config.clone();config.other=canonical_other(&config.other);json!([t.name, t.ord, config.encode_to_vec()])}).collect::<Vec<_>>()
            }),
        );
    }
    // Core holds an exclusive SQLite lock. Close through Core before inspecting
    // raw storage, then reopen the same isolated collection (no parallel reader).
    std::mem::replace(col, CollectionBuilder::default().build().unwrap())
        .close(None)
        .unwrap();
    let result = json!({
        "notes": rows(root, "SELECT n.id,n.guid,n.flds,n.tags,nt.name FROM notes n JOIN notetypes nt ON nt.id=n.mid ORDER BY n.id"),
        "cards": rows(root, "SELECT id,nid,ord,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data FROM cards ORDER BY id"),
        "revlog": rows(root, "SELECT id,cid,ease,ivl,lastIvl,factor,time,type FROM revlog ORDER BY id"),
        "notetypes": notetypes,
    });
    *col = open(root);
    let mut result = result;
    result["deckNames"] = json!(col
        .get_all_deck_names(false)
        .unwrap()
        .into_iter()
        .map(|(_, n)| n)
        .filter(|n| n.starts_with("Interop synthetic"))
        .collect::<Vec<_>>());
    result
}

fn canonical_other(bytes: &[u8]) -> Vec<u8> {
    serde_json::from_slice::<Value>(bytes)
        .map(|value| serde_json::to_vec(&value).unwrap())
        .unwrap_or_else(|_| bytes.to_vec())
}

fn assert_snapshot(actual: &Value, expected: &Value) {
    fn mismatch(actual: &Value, expected: &Value, path: String) -> Option<String> {
        if actual == expected {
            return None;
        }
        match (actual, expected) {
            (Value::Object(a), Value::Object(b)) if a.keys().eq(b.keys()) => a
                .iter()
                .find_map(|(key, value)| mismatch(value, &b[key], format!("{path}/{key}"))),
            (Value::Array(a), Value::Array(b)) if a.len() == b.len() => a
                .iter()
                .zip(b)
                .enumerate()
                .find_map(|(i, (a, b))| mismatch(a, b, format!("{path}/{i}"))),
            _ => Some(format!(
                "{path}: actual={} expected={}",
                actual.to_string().chars().take(160).collect::<String>(),
                expected.to_string().chars().take(160).collect::<String>()
            )),
        }
    }
    assert!(
        actual == expected,
        "{}",
        mismatch(actual, expected, String::new()).unwrap_or_default()
    );
}

fn seed(root: &Path) -> Collection {
    let mut col = open(root);
    let deck = col.get_or_create_normal_deck(DECK).unwrap();
    col.set_current_deck(deck.id).unwrap();
    deck_config(&mut col, deck.id);
    col.set_config_bool(BoolKey::Fsrs, true, false).unwrap();
    col.set_config_json(
        "interop_unknown_collection",
        &json!({"nested":[1,true,"中文"]}),
        false,
    )
    .unwrap();
    col.add_image_occlusion_notetype().unwrap();
    for kind in 1..=6 {
        let mut nt = col
            .get_all_notetypes()
            .unwrap()
            .into_iter()
            .find(|n| n.config.original_stock_kind == kind)
            .unwrap()
            .as_ref()
            .clone();
        nt.name = format!(
            "Interop {}",
            [
                "Basic",
                "Reversed",
                "Optional",
                "Typing",
                "Renamed deletion 中文",
                "Image Occlusion"
            ][kind as usize - 1]
        );
        nt.config.other = UNKNOWN.to_vec();
        nt.config.css.push_str("\n@import url(\"_interop.css\");");
        for f in &mut nt.fields {
            f.config.other = UNKNOWN.to_vec();
        }
        for t in &mut nt.templates {
            t.config.other = UNKNOWN.to_vec();
        }
        col.update_notetype(&mut nt, false).unwrap();
        let variants = if kind == 3 { 2 } else { 1 };
        for variant in 0..variants {
            let mut note = nt.new_note();
            note.guid = format!("interop-{kind}-{variant}");
            note.tags = vec!["interop::synthetic".into(), "中文标签".into()];
            let fields: Vec<&str> = match kind {
                3 => vec!["Optional question", "Optional answer", if variant == 0 { "" } else { "1" }],
                5 => vec!["Renamed {{c1::alpha::hint}} / {{c3::beta}} / {{c3::gamma}}", "<b>Extra 中文</b>"],
                6 => vec!["{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}} {{c6::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}", "<img src=\"interop.png\">", "Synthetic IO", "<b>Extra</b>"],
                _ => vec!["<b>HTML 中文 😀</b> \\(x^2+1\\) <img src=\"interop.png\"> [sound:interop.wav]", "Answer \\[\\frac{1}{2}\\]"],
            };
            for (i, field) in fields.into_iter().enumerate() {
                note.set_field(i, field).unwrap();
            }
            col.add_note(&mut note, deck.id).unwrap();
            let mut ords: Vec<_> = col
                .storage
                .all_cards_of_note(note.id)
                .unwrap()
                .iter()
                .map(|c| c.template_idx())
                .collect();
            ords.sort();
            let expected = match (kind, variant) {
                (2, _) | (3, 1) => vec![0, 1],
                (5, _) => vec![0, 2],
                (6, _) => vec![0, 5],
                _ => vec![0],
            };
            assert_eq!(ords, expected, "card generation for {}", nt.name);
        }
    }
    // Valid tiny PNG and PCM WAV, usable for user-operated visual/audio checks.
    fs::write(
        root.join("collection.media/interop.png"),
        include_bytes!("fixtures/interop.png"),
    )
    .unwrap();
    fs::write(
        root.join("collection.media/interop.wav"),
        include_bytes!("fixtures/interop.wav"),
    )
    .unwrap();
    fs::write(
        root.join("collection.media/_interop.css"),
        b"/* synthetic static media */",
    )
    .unwrap();
    assert_eq!(col.storage.get_all_note_ids().unwrap().len(), 7);
    assert_eq!(
        col.storage
            .get_all_note_ids()
            .unwrap()
            .iter()
            .map(|nid| col.storage.all_cards_of_note(*nid).unwrap().len())
            .sum::<usize>(),
        11
    );
    // Genuine scheduler answers; tests never synthesize revlog rows or scheduling algorithms.
    for (i, rating) in [Rating::Hard, Rating::Good, Rating::Easy]
        .into_iter()
        .enumerate()
    {
        let queued = col.get_next_card().unwrap().unwrap();
        let new_state = match rating {
            Rating::Hard => queued.states.hard,
            Rating::Good => queued.states.good,
            _ => queued.states.easy,
        };
        col.answer_card(&mut CardAnswer {
            card_id: queued.card.id(),
            current_state: queued.states.current,
            new_state,
            rating,
            answered_at: TimestampMillis::now().adding_secs(i as i64),
            milliseconds_taken: 1234,
            custom_data: Some("{\"interop\":7}".into()),
            from_queue: true,
        })
        .unwrap();
    }
    let mut buttons = Vec::new();
    for nid in col.storage.get_all_note_ids().unwrap() {
        for card in col.storage.all_cards_of_note(nid).unwrap() {
            buttons.extend(
                col.get_review_logs(card.id())
                    .unwrap()
                    .entries
                    .iter()
                    .map(|r| r.button_chosen),
            );
        }
    }
    buttons.sort();
    assert_eq!(buttons, vec![2, 3, 4]);
    col
}

fn export(col: &mut Collection, package: &Path, legacy: bool, scheduling: bool, media: bool) {
    assert_eq!(
        col.export_apkg(
            package,
            ExportAnkiPackageOptions {
                with_scheduling: scheduling,
                with_deck_configs: true,
                with_media: media,
                legacy,
            },
            SearchNode::WholeCollection,
            None
        )
        .unwrap(),
        7
    );
}

// Route package operations through the production Rust C ABI and registered progress channel.
struct Native(u32);
impl Native {
    fn new() -> Self {
        let mut handle = 0;
        let mut error = AnkiBuffer::default();
        let status = unsafe { anki_backend_open(std::ptr::null(), 0, &mut handle, &mut error) };
        let error = take(error);
        assert_eq!(status, STATUS_OK, "{}", String::from_utf8_lossy(&error));
        Self(handle)
    }
    fn call(&self, name: &str, input: &impl Message) -> Result<Vec<u8>, BackendError> {
        self.raw(name, &input.encode_to_vec())
    }
    fn raw(&self, name: &str, input: &[u8]) -> Result<Vec<u8>, BackendError> {
        let baseline: Value =
            serde_json::from_str(include_str!("../../../tools/rpc-index-baseline.json")).unwrap();
        let (service, method) = baseline["services"]
            .as_object()
            .unwrap()
            .values()
            .find_map(|service| {
                service["methods"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .find(|(_, v)| v.as_str() == Some(name))
                    .map(|(method, _)| {
                        (
                            service["id"].as_u64().unwrap() as u32,
                            method.parse::<u32>().unwrap(),
                        )
                    })
            })
            .unwrap();
        let mut output = AnkiBuffer::default();
        let mut error = AnkiBuffer::default();
        let status = unsafe {
            anki_backend_call(
                self.0,
                service,
                method,
                input.as_ptr(),
                input.len(),
                &mut output,
                &mut error,
            )
        };
        let output = take(output);
        let error = take(error);
        if status == STATUS_OK {
            Ok(output)
        } else {
            assert_eq!(status, STATUS_BACKEND_ERROR);
            Err(BackendError::decode(error.as_slice()).unwrap())
        }
    }
    fn open(&self, root: &Path) {
        fs::create_dir_all(root.join("collection.media")).unwrap();
        self.call(
            "open_collection",
            &OpenCollectionRequest {
                collection_path: root.join("collection.anki2").to_str().unwrap().into(),
                media_folder_path: root.join("collection.media").to_str().unwrap().into(),
                media_db_path: root.join("collection.mdb").to_str().unwrap().into(),
            },
        )
        .unwrap();
    }
    fn close(&self) {
        self.call("close_collection", &CloseCollectionRequest::default())
            .unwrap();
    }
    fn import(
        &self,
        path: &Path,
        options: ImportAnkiPackageOptions,
    ) -> Result<Vec<u8>, BackendError> {
        self.call(
            "import_anki_package",
            &ImportAnkiPackageRequest {
                package_path: path.to_str().unwrap().into(),
                options: Some(options),
            },
        )
    }
    fn restore(&self, root: &Path, package: &Path) -> Result<Vec<u8>, BackendError> {
        self.call(
            "import_collection_package",
            &ImportCollectionPackageRequest {
                col_path: root.join("collection.anki2").to_str().unwrap().into(),
                backup_path: package.to_str().unwrap().into(),
                media_folder: root.join("collection.media").to_str().unwrap().into(),
                media_db: root.join("collection.mdb").to_str().unwrap().into(),
            },
        )
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        assert_eq!(anki_backend_close(self.0), STATUS_OK);
    }
}
fn take(buffer: AnkiBuffer) -> Vec<u8> {
    let bytes = if buffer.len == 0 {
        vec![]
    } else {
        unsafe { std::slice::from_raw_parts(buffer.ptr, buffer.len).to_vec() }
    };
    unsafe { anki_buffer_free(buffer) };
    bytes
}

fn options(scheduling: bool) -> ImportAnkiPackageOptions {
    ImportAnkiPackageOptions {
        with_scheduling: scheduling,
        with_deck_configs: true,
        ..Default::default()
    }
}
fn media(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fs::read_dir(root.join("collection.media"))
        .unwrap()
        .map(|entry| {
            let path = entry.unwrap().path();
            (
                path.file_name().unwrap().to_str().unwrap().into(),
                fs::read(path).unwrap(),
            )
        })
        .collect()
}

#[test]
fn apkg_latest_and_legacy_roundtrip_preserve_identity_content_history_and_media() {
    for legacy in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let source = root.join("source");
        let mut src = seed(&source);
        let expected = snapshot(&mut src, &source);
        let expected_media = media(&source);
        let first = root.join("first.apkg");
        export(&mut src, &first, legacy, true, true);
        for step in 0..2 {
            let target = root.join(format!("target-{step}"));
            let native = Native::new();
            native.open(&target);
            native.import(&first, options(true)).unwrap();
            native.close();
            let mut col = open(&target);
            assert_snapshot(&snapshot(&mut col, &target), &expected);
            assert_deck_config(&mut col);
            assert_eq!(media(&target), expected_media);
            for cid in col
                .storage
                .get_all_note_ids()
                .unwrap()
                .into_iter()
                .flat_map(|nid| {
                    col.storage
                        .all_card_ids_of_note_in_template_order(nid)
                        .unwrap()
                })
                .collect::<Vec<_>>()
            {
                let card = col.storage.get_card(cid).unwrap().unwrap();
                let note = col.storage.get_note(card.note_id()).unwrap().unwrap();
                let rendered = col.render_existing_card(cid, false, false).unwrap();
                assert!(!rendered.is_empty);
                assert!(!rendered.question().is_empty());
                assert!(!rendered.answer().is_empty());
                match note.guid.as_str() {
                    "interop-1-0" => {
                        assert!(rendered.question().contains("<b>HTML 中文 😀</b>"));
                        assert!(rendered.question().contains("\\(x^2+1\\)"));
                        assert!(rendered.answer().contains("\\[\\frac{1}{2}\\]"));
                    }
                    "interop-2-0" if card.template_idx() == 1 => {
                        assert!(rendered.question().contains("Answer"))
                    }
                    "interop-4-0" => assert!(rendered.question().contains("[[type:Back]]")),
                    "interop-5-0" => {
                        assert!(rendered.question().contains("class=\"cloze\""));
                        assert!(rendered.answer().contains("alpha"));
                        assert!(rendered.answer().contains("beta"));
                    }
                    "interop-6-0" => {
                        assert!(rendered.question().contains("interop.png"));
                        assert!(rendered.question().contains("image-occlusion"));
                    }
                    _ => {}
                }
            }
            // Export again from the imported collection for the return trip.
            export(&mut col, &first, legacy, true, true);
            col.close(None).unwrap();
            native.open(&target);
            native.import(&first, options(true)).unwrap();
            native.close();
            let mut col = open(&target);
            assert_eq!(
                snapshot(&mut col, &target),
                expected,
                "duplicate import changed data"
            );
            col.close(None).unwrap();
        }
        src.close(None).unwrap();
    }
}

#[test]
fn colpkg_latest_and_legacy_return_trip_preserves_collection_config_and_ids() {
    for legacy in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let source = root.join("source");
        let mut col = seed(&source);
        let expected = snapshot(&mut col, &source);
        let expected_media = media(&source);
        let package = root.join("first.colpkg");
        col.export_colpkg(&package, true, legacy).unwrap();
        for step in 0..2 {
            let target = root.join(format!("target-{step}"));
            fs::create_dir_all(&target).unwrap();
            Native::new().restore(&target, &package).unwrap();
            let mut col = open(&target);
            assert_snapshot(&snapshot(&mut col, &target), &expected);
            assert_deck_config(&mut col);
            assert_eq!(media(&target), expected_media);
            assert!(col.get_config_bool(BoolKey::Fsrs));
            col.close(None).unwrap();
            assert_eq!(
                rows(
                    &target,
                    "SELECT val FROM config WHERE key='interop_unknown_collection'"
                ),
                json!([[{"nested":[1,true,"中文"]}]])
            );
            open(&target).export_colpkg(&package, true, legacy).unwrap();
        }
    }
}

#[test]
fn invalid_package_leaves_existing_collection_and_history_readable() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let target = root.join("target");
    let mut col = seed(&target);
    let expected = snapshot(&mut col, &target);
    let expected_media = media(&target);
    col.close(None).unwrap();
    let broken = root.join("broken.apkg");
    fs::write(&broken, b"not a ZIP archive").unwrap();
    let native = Native::new();
    native.open(&target);
    assert!(native.import(&broken, options(true)).is_err());
    native.close();
    assert!(native.restore(&target, &broken).is_err());
    let mut col = open(&target);
    assert_eq!(snapshot(&mut col, &target), expected);
    assert_eq!(media(&target), expected_media);
    col.close(None).unwrap();
}

#[test]
fn fixture_packages_are_generated_only_inside_the_runner_owned_directory() {
    let temporary = tempfile::tempdir().unwrap();
    let root = if let Ok(run_dir) = std::env::var("JIDECARDS_INTEROP_ARTIFACTS") {
        PathBuf::from(run_dir)
    } else {
        fs::write(temporary.path().join(".interop-owned"), "synthetic-only\n").unwrap();
        temporary.path().to_path_buf()
    };
    assert!(
        root.join(".interop-owned").is_file(),
        "runner ownership marker required"
    );
    assert_eq!(
        fs::read_to_string(root.join(".interop-owned")).unwrap(),
        "synthetic-only\n"
    );
    let source = root.join("synthetic-collection");
    assert!(!source.exists());
    let mut col = seed(&source);
    let expected = snapshot(&mut col, &source);
    fs::write(
        root.join("expected.json"),
        serde_json::to_vec_pretty(&expected).unwrap(),
    )
    .unwrap();
    export(
        &mut col,
        &root.join("sample-latest.apkg"),
        false,
        true,
        true,
    );
    export(&mut col, &root.join("sample-legacy.apkg"), true, true, true);
    export(
        &mut col,
        &root.join("sample-content-only.apkg"),
        false,
        false,
        false,
    );
    col.export_colpkg(root.join("sample-latest.colpkg"), true, false)
        .unwrap();
    open(&source)
        .export_colpkg(root.join("sample-legacy.colpkg"), true, true)
        .unwrap();
    open(&source).close(None).unwrap();
}

fn deck_config(col: &mut Collection, deck: anki::decks::DeckId) {
    let mut config = DeckConfig {
        name: "Interop preset".into(),
        ..Default::default()
    };
    config.inner.new_per_day = 47;
    config.inner.other = UNKNOWN.to_vec();
    col.update_deck_configs(UpdateDeckConfigsRequest {
        target_deck_id: deck,
        configs: vec![config],
        removed_config_ids: vec![],
        mode: anki_proto::deck_config::UpdateDeckConfigsMode::Normal,
        card_state_customizer: String::new(),
        limits: Default::default(),
        new_cards_ignore_review_limit: false,
        apply_all_parent_limits: false,
        fsrs: true,
        fsrs_reschedule: false,
        fsrs_health_check: false,
    })
    .unwrap();
}

fn assert_deck_config(col: &mut Collection) {
    let deck = col.get_or_create_normal_deck(DECK).unwrap().id;
    let result = col.get_deck_configs_for_update(deck).unwrap();
    let config = result
        .all_config
        .iter()
        .find_map(|entry| entry.config.as_ref().filter(|c| c.name == "Interop preset"))
        .unwrap();
    let inner = config.config.as_ref().unwrap();
    assert_eq!(inner.new_per_day, 47);
    assert_eq!(
        serde_json::from_slice::<Value>(&inner.other).unwrap(),
        serde_json::from_slice::<Value>(UNKNOWN).unwrap()
    );
}

fn edit(root: &Path, local: bool, revision: i8) {
    let mut col = open(root);
    let id = col
        .storage
        .get_all_note_ids()
        .unwrap()
        .into_iter()
        .find(|nid| col.storage.get_note(*nid).unwrap().unwrap().guid == "interop-1-0")
        .unwrap();
    let mut note = col.storage.get_note(id).unwrap().unwrap();
    note.set_field(
        0,
        if local {
            "LOCAL content"
        } else {
            "REMOTE content"
        },
    )
    .unwrap();
    col.update_note(&mut note).unwrap();
    let mut nt = col
        .get_notetype(note.notetype_id)
        .unwrap()
        .unwrap()
        .as_ref()
        .clone();
    nt.templates[0].config.q_format.push_str(if local {
        "<small>LOCAL template</small>"
    } else {
        "<small>REMOTE template</small>"
    });
    col.update_notetype(&mut nt, false).unwrap();
    col.close(None).unwrap();
    // Deliberately control mtime in this owned fixture; no timing sleeps.
    let db = Connection::open(root.join("collection.anki2")).unwrap();
    let time = if local {
        1_700_000_100
    } else {
        1_700_000_100 + i64::from(revision) * 100
    };
    db.execute("UPDATE notes SET mod=? WHERE id=?", [time, id.0])
        .unwrap();
    db.execute(
        "UPDATE notetypes SET mtime_secs=? WHERE id=?",
        [time, nt.id.0],
    )
    .unwrap();
}

#[test]
fn update_conditions_are_independent_and_do_not_overwrite_existing_scheduling() {
    // (notes policy, type policy, revision relative to local, note update, template update)
    for (notes, types, revision, note_updated, type_updated) in [
        (0, 0, 1, true, true),
        (0, 0, -1, false, false),
        (1, 1, -1, true, true),
        (1, 1, 0, false, false),
        (2, 2, 1, false, false),
        (2, 1, 1, false, true),
        (1, 2, -1, true, false),
    ] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let source = root.join("source");
        let mut src = seed(&source);
        let package = root.join("input.apkg");
        export(&mut src, &package, false, true, true);
        src.close(None).unwrap();
        let target = root.join("target");
        let native = Native::new();
        native.open(&target);
        native.import(&package, options(true)).unwrap();
        native.close();
        edit(&target, true, 0);
        edit(&source, false, revision);
        let mut src = open(&source);
        export(&mut src, &package, false, true, true);
        src.close(None).unwrap();
        let mut col = open(&target);
        let before = snapshot(&mut col, &target);
        col.close(None).unwrap();
        let mut opts = options(true);
        opts.update_notes = notes;
        opts.update_notetypes = types;
        native.open(&target);
        native.import(&package, opts).unwrap();
        native.close();
        let mut col = open(&target);
        let after = snapshot(&mut col, &target);
        assert_eq!(after["cards"], before["cards"]);
        assert_eq!(after["revlog"], before["revlog"]);
        let note = col
            .storage
            .get_all_note_ids()
            .unwrap()
            .into_iter()
            .map(|id| col.storage.get_note(id).unwrap().unwrap())
            .find(|n| n.guid == "interop-1-0")
            .unwrap();
        assert_eq!(
            note.fields()[0],
            if note_updated {
                "REMOTE content"
            } else {
                "LOCAL content"
            }
        );
        let nt = col.get_notetype(note.notetype_id).unwrap().unwrap();
        assert!(nt.templates[0].config.q_format.contains(if type_updated {
            "REMOTE template"
        } else {
            "LOCAL template"
        }));
        assert_eq!(after["notes"].as_array().unwrap().len(), 7);
        col.close(None).unwrap();
    }
}

#[test]
fn scheduling_and_media_options_reset_only_new_imported_cards() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let package = root.join("input.apkg");
    export(&mut src, &package, false, true, false);
    for include in [false, true] {
        let target = root.join(format!("target-{include}"));
        let mut col = open(&target);
        col.set_config_json(
            "resident_unknown",
            &json!({"keep":true,"nested":[4,"中文"]}),
            false,
        )
        .unwrap();
        col.close(None).unwrap();
        let native = Native::new();
        native.open(&target);
        let mut opts = options(include);
        opts.with_deck_configs = include;
        native.import(&package, opts).unwrap();
        native.close();
        assert!(media(&target).is_empty());
        assert_eq!(
            rows(
                &target,
                "SELECT val FROM config WHERE key='resident_unknown'"
            ),
            json!([[{"keep":true,"nested":[4,"中文"]}]])
        );
        assert_eq!(
            rows(
                &target,
                "SELECT count(*) FROM config WHERE key='interop_unknown_collection'"
            ),
            json!([[0]]),
            "APKG must not replace global collection configuration"
        );
        if include {
            assert_eq!(rows(&target, "SELECT count(*) FROM revlog"), json!([[3]]));
            let mut col = open(&target);
            assert_deck_config(&mut col);
            col.close(None).unwrap();
        } else {
            assert_eq!(rows(&target, "SELECT count(*) FROM revlog"), json!([[0]]));
            assert_eq!(
                rows(&target, "SELECT DISTINCT type,queue,reps,lapses FROM cards"),
                json!([[0, 0, 0, 0]])
            );
            let mut col = open(&target);
            let deck = col.get_or_create_normal_deck(DECK).unwrap().id;
            assert!(col
                .get_deck_configs_for_update(deck)
                .unwrap()
                .all_config
                .iter()
                .all(|c| c.config.as_ref().unwrap().name != "Interop preset"));
            col.close(None).unwrap();
        }
    }
    src.close(None).unwrap();
}

#[test]
fn media_conflict_keeps_local_bytes_and_rewrites_incoming_references() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let package = root.join("input.apkg");
    export(&mut src, &package, false, true, true);
    let target = root.join("target");
    let native = Native::new();
    native.open(&target);
    fs::write(
        target.join("collection.media/interop.png"),
        b"resident synthetic bytes",
    )
    .unwrap();
    native.import(&package, options(true)).unwrap();
    native.close();
    assert_eq!(
        fs::read(target.join("collection.media/interop.png")).unwrap(),
        b"resident synthetic bytes"
    );
    let files = media(&target);
    let renamed = files
        .iter()
        .find(|(name, data)| {
            name.starts_with("interop-")
                && name.ends_with(".png")
                && **data == include_bytes!("fixtures/interop.png")
        })
        .unwrap()
        .0;
    let col = open(&target);
    let expected = snapshot(&mut src, &source);
    for row in expected["notes"].as_array().unwrap() {
        let note = col
            .storage
            .get_note(NoteId(row[0].as_i64().unwrap()))
            .unwrap()
            .unwrap();
        assert_eq!(
            note.fields().join("\u{1f}"),
            row[2].as_str().unwrap().replace("interop.png", renamed)
        );
    }
    col.close(None).unwrap();
    src.close(None).unwrap();
}

#[test]
fn real_core_cancellation_rolls_back_notes_cards_and_revlog_then_allows_retry() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    // Large incompressible media exposes a cancellable IO phase on fast hosts.
    let mut data = vec![0_u8; 32 * 1024 * 1024];
    let mut state = 7_u32;
    for byte in &mut data {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        *byte = state as u8;
    }
    fs::write(source.join("collection.media/_cancel.bin"), &data).unwrap();
    let mut nt = src
        .get_notetype_by_name("Interop Basic")
        .unwrap()
        .unwrap()
        .as_ref()
        .clone();
    nt.templates[0]
        .config
        .q_format
        .push_str("<script src=\"_cancel.bin\"></script>");
    src.update_notetype(&mut nt, false).unwrap();
    let package = root.join("large.apkg");
    export(&mut src, &package, false, true, true);
    src.close(None).unwrap();
    let target = root.join("target");
    let mut resident = open(&target);
    let nt = resident
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut note = nt.new_note();
    note.guid = "resident-before-cancel".into();
    note.set_field(0, "Resident synthetic question").unwrap();
    note.set_field(1, "Resident answer").unwrap();
    resident
        .add_note(&mut note, anki::decks::DeckId(1))
        .unwrap();
    let before = snapshot(&mut resident, &target);
    resident.close(None).unwrap();
    let native = Native::new();
    native.open(&target);
    let handle = native.0;
    let input = ImportAnkiPackageRequest {
        package_path: package.to_str().unwrap().into(),
        options: Some(options(true)),
    }
    .encode_to_vec();
    let worker = thread::spawn(move || {
        let borrowed = std::mem::ManuallyDrop::new(Native(handle));
        borrowed.raw("import_anki_package", &input)
    });
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut observed = false;
    while !worker.is_finished() && Instant::now() < deadline {
        let progress =
            Progress::decode(native.raw("latest_progress", &[]).unwrap().as_slice()).unwrap();
        if matches!(
            progress.value,
            Some(anki_proto::collection::progress::Value::Importing(_))
        ) {
            observed = true;
            native.raw("set_wants_abort", &[]).unwrap();
        }
        thread::sleep(Duration::from_millis(1));
    }
    assert!(observed, "no actual Core import progress observed");
    let error = worker
        .join()
        .unwrap()
        .expect_err("cancellation did not interrupt this large import");
    assert_eq!(
        error.kind,
        anki_proto::backend::backend_error::Kind::Interrupted as i32
    );
    native.close();
    let mut resident = open(&target);
    assert_snapshot(&snapshot(&mut resident, &target), &before);
    resident.close(None).unwrap();
    // Media is outside the DB transaction and may be left unreferenced; retry must converge.
    native.open(&target);
    native.import(&package, options(true)).unwrap();
    native.close();
    assert_eq!(rows(&target, "SELECT count(*) FROM notes"), json!([[8]]));
    assert_eq!(rows(&target, "SELECT count(*) FROM cards"), json!([[12]]));
    assert_eq!(rows(&target, "SELECT count(*) FROM revlog"), json!([[3]]));
    assert_eq!(
        fs::read(target.join("collection.media/_cancel.bin")).unwrap(),
        data
    );
}

#[test]
fn id_collisions_remap_incoming_notes_cards_and_review_links_without_changing_residents() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let expected = snapshot(&mut src, &source);
    let package = root.join("input.apkg");
    export(&mut src, &package, false, true, true);
    src.close(None).unwrap();
    let target = root.join("target");
    fs::create_dir_all(target.join("collection.media")).unwrap();
    fs::copy(
        source.join("collection.anki2"),
        target.join("collection.anki2"),
    )
    .unwrap();
    let db = Connection::open(target.join("collection.anki2")).unwrap();
    db.execute("UPDATE notes SET guid='resident-' || guid", [])
        .unwrap();
    db.execute("DELETE FROM revlog", []).unwrap();
    drop(db);
    let resident_cards=rows(&target,"SELECT id,nid,ord,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data FROM cards ORDER BY id");
    let native = Native::new();
    native.open(&target);
    native.import(&package, options(true)).unwrap();
    native.close();
    assert_eq!(rows(&target, "SELECT count(*) FROM notes"), json!([[14]]));
    assert_eq!(rows(&target, "SELECT count(*) FROM cards"), json!([[22]]));
    assert_eq!(rows(&target, "SELECT count(*) FROM revlog"), json!([[3]]));
    assert_eq!(
        rows(
            &target,
            "SELECT count(*) FROM cards c LEFT JOIN notes n ON n.id=c.nid WHERE n.id IS NULL"
        ),
        json!([[0]])
    );
    assert_eq!(
        rows(
            &target,
            "SELECT count(*) FROM revlog r LEFT JOIN cards c ON c.id=r.cid WHERE c.id IS NULL"
        ),
        json!([[0]])
    );
    let resident_after=rows(&target,"SELECT c.id,c.nid,c.ord,c.type,c.queue,c.due,c.ivl,c.factor,c.reps,c.lapses,c.left,c.odue,c.odid,c.flags,c.data FROM cards c JOIN notes n ON n.id=c.nid WHERE n.guid LIKE 'resident-%' ORDER BY c.id");
    assert_eq!(resident_after, resident_cards);
    let mut col = open(&target);
    let actual = snapshot(&mut col, &target);
    for old_note in expected["notes"].as_array().unwrap() {
        let imported = actual["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n[1] == old_note[1])
            .unwrap();
        assert_ne!(imported[0], old_note[0]);
        assert_eq!(
            &imported.as_array().unwrap()[1..],
            &old_note.as_array().unwrap()[1..]
        );
        for old_card in expected["cards"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| c[1] == old_note[0])
        {
            let new_card = actual["cards"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c[1] == imported[0] && c[2] == old_card[2])
                .unwrap();
            assert_ne!(new_card[0], old_card[0]);
            assert_eq!(
                &new_card.as_array().unwrap()[2..],
                &old_card.as_array().unwrap()[2..]
            );
            for log in expected["revlog"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|r| r[1] == old_card[0])
            {
                let imported_log = actual["revlog"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|r| r[0] == log[0])
                    .unwrap();
                assert_eq!(imported_log[1], new_card[0]);
                assert_eq!(
                    &imported_log.as_array().unwrap()[2..],
                    &log.as_array().unwrap()[2..]
                );
            }
        }
    }
    col.close(None).unwrap();
}

#[test]
fn schema_conflict_is_reported_without_merge_and_merge_preserves_existing_card_history() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let package = root.join("base.apkg");
    export(&mut src, &package, false, true, true);
    let mut natives = Vec::new();
    for merge in [false, true] {
        let target = root.join(format!("target-{merge}"));
        let native = Native::new();
        native.open(&target);
        native.import(&package, options(true)).unwrap();
        native.close();
        natives.push((target, native, merge));
    }
    let mut nt = src
        .get_notetype_by_name("Interop Basic")
        .unwrap()
        .unwrap()
        .as_ref()
        .clone();
    nt.fields
        .push(anki::notetype::NoteField::new("Unknown future field"));
    src.update_notetype(&mut nt, false).unwrap();
    let mut note = src
        .storage
        .get_all_note_ids()
        .unwrap()
        .into_iter()
        .map(|nid| src.storage.get_note(nid).unwrap().unwrap())
        .find(|n| n.guid == "interop-1-0")
        .unwrap();
    note.set_field(2, "<b>hidden future value 中文</b>")
        .unwrap();
    src.update_note(&mut note).unwrap();
    // Core treats equal second-resolution mtimes as already imported even with
    // Always. Schema merging also updates target mtimes during import, so keep
    // this synthetic incoming revision a day ahead without a timing sleep.
    src.storage
        .db()
        .execute_batch(&format!(
            "UPDATE notes SET mod=mod+86400 WHERE id={};",
            note.id.0
        ))
        .unwrap();
    export(&mut src, &package, false, true, true);
    for (target, native, merge) in natives {
        let mut col = open(&target);
        let before = snapshot(&mut col, &target);
        col.close(None).unwrap();
        let mut opts = options(true);
        opts.merge_notetypes = merge;
        opts.update_notes = 1;
        opts.update_notetypes = 1;
        native.open(&target);
        let response =
            ImportResponse::decode(native.import(&package, opts).unwrap().as_slice()).unwrap();
        native.close();
        assert_eq!(
            response.log.unwrap().conflicting.len(),
            if merge { 0 } else { 1 }
        );
        let mut col = open(&target);
        let after = snapshot(&mut col, &target);
        assert_eq!(after["cards"], before["cards"]);
        assert_eq!(after["revlog"], before["revlog"]);
        let stored = col.storage.get_note(note.id).unwrap().unwrap();
        assert_eq!(stored.fields().len(), if merge { 3 } else { 2 });
        if merge {
            assert_eq!(stored.fields()[2], "<b>hidden future value 中文</b>");
        }
        assert_eq!(stored.guid, note.guid);
        col.close(None).unwrap();
    }
    src.close(None).unwrap();
}

#[test]
fn content_only_export_resets_schedule_even_when_import_requests_scheduling() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let package = root.join("content.apkg");
    export(&mut src, &package, false, false, true);
    let target = root.join("target");
    let native = Native::new();
    native.open(&target);
    native.import(&package, options(true)).unwrap();
    native.close();
    assert_eq!(rows(&target, "SELECT count(*) FROM revlog"), json!([[0]]));
    assert_eq!(
        rows(&target, "SELECT DISTINCT type,queue,reps,lapses FROM cards"),
        json!([[0, 0, 0, 0]])
    );
    assert_eq!(media(&target), media(&source));
    src.close(None).unwrap();
}

#[test]
fn colpkg_without_media_still_preserves_ids_and_review_history() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let source = root.join("source");
    let mut src = seed(&source);
    let expected = snapshot(&mut src, &source);
    let package = root.join("no-media.colpkg");
    src.export_colpkg(&package, false, false).unwrap();
    let target = root.join("target");
    fs::create_dir_all(&target).unwrap();
    Native::new().restore(&target, &package).unwrap();
    let mut col = open(&target);
    assert_snapshot(&snapshot(&mut col, &target), &expected);
    assert!(media(&target).is_empty());
    col.close(None).unwrap();
}
