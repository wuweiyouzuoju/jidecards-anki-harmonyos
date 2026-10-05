// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::notes::NoteId;
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::config::Preferences;
use anki_proto::generic::{Json, UInt32};
use anki_proto::import_export::{
    export_limit, ExportAnkiPackageOptions, ExportAnkiPackageRequest, ExportCardCsvRequest,
    ExportLimit, ExportNoteCsvRequest,
};
use anki_proto::notetypes::{
    NotetypeId, RestoreNotetypeToStockRequest, UpdateNotetypeLegacyRequest,
};
use prost::Message;
use serde_json::{json, Value};

struct Fixture {
    root: tempfile::TempDir,
    backend: Backend,
    ntid: i64,
    note: i64,
    cards: Vec<i64>,
}
impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("collection.anki2");
        let mut col = CollectionBuilder::new(&path).build().unwrap();
        let mut nt = col
            .get_all_notetypes()
            .unwrap()
            .into_iter()
            .find(|nt| nt.config.original_stock_kind == 1)
            .unwrap()
            .as_ref()
            .clone();
        let mut template = nt.templates[0].clone();
        template.ord = None;
        template.name = "Second".into();
        template.config.q_format = "Second {{Front}}".into();
        nt.templates.push(template);
        col.update_notetype(&mut nt, false).unwrap();
        let nt = col.get_notetype(nt.id).unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "SELECTED 中文").unwrap();
        note.set_field(1, "answer").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let cards = col
            .storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect();
        let mut outside = nt.new_note();
        outside.set_field(0, "OUTSIDE_SENTINEL").unwrap();
        col.add_note(&mut outside, DeckId(1)).unwrap();
        let ntid = nt.id.0;
        col.close(None).unwrap();
        let backend = init_backend(&[]).unwrap();
        backend
            .run_service_method(
                3,
                0,
                &OpenCollectionRequest {
                    collection_path: path.to_string_lossy().into_owned(),
                    media_folder_path: root.path().join("media").to_string_lossy().into_owned(),
                    media_db_path: root.path().join("media.db").to_string_lossy().into_owned(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        Self {
            root,
            backend,
            ntid,
            note: note.id.0,
            cards,
        }
    }
    fn notetype(&self) -> Value {
        let bytes = self
            .backend
            .run_service_method(23, 7, &NotetypeId { ntid: self.ntid }.encode_to_vec())
            .unwrap();
        serde_json::from_slice(&Json::decode(bytes.as_slice()).unwrap().json).unwrap()
    }
    fn update(&self, value: &Value) {
        self.backend
            .run_service_method(
                23,
                3,
                &UpdateNotetypeLegacyRequest {
                    json: serde_json::to_vec(value).unwrap(),
                    skip_checks: false,
                }
                .encode_to_vec(),
            )
            .unwrap();
    }
}

#[test]
fn advanced_preferences_roundtrip_without_changing_other_sections() {
    let f = Fixture::new();
    let read = || {
        Preferences::decode(f.backend.run_service_method(9, 9, &[]).unwrap().as_slice()).unwrap()
    };
    let original = read();
    let mut expected = original.clone();
    let reviewing = expected.reviewing.as_mut().unwrap();
    reviewing.load_balancer_enabled = false;
    reviewing.fsrs_short_term_with_steps_enabled = true;
    let backup = expected.backups.as_mut().unwrap();
    backup.daily = 0;
    backup.weekly = 3;
    backup.monthly = 4;
    backup.minimum_interval_mins = 0;
    f.backend
        .run_service_method(9, 10, &expected.encode_to_vec())
        .unwrap();
    let saved = read();
    assert_eq!(saved, expected);
    assert_eq!(saved.scheduling, original.scheduling);
    assert_eq!(saved.editing, original.editing);
    f.backend.run_service_method(3, 1, &[]).unwrap();
}

#[test]
fn metadata_preserves_field_identity_and_content_and_stock_restore_reduces_templates() {
    let f = Fixture::new();
    let original = f.notetype();
    let mut changed = original.clone();
    changed["flds"][0]["rtl"] = json!(true);
    changed["flds"][0]["font"] = json!("Serif");
    changed["flds"][0]["size"] = json!(30);
    changed["flds"][0]["description"] = json!("中文");
    changed["flds"][0]["excludeFromSearch"] = json!(true);
    changed["sortf"] = json!(1);
    f.update(&changed);
    let saved = f.notetype();
    assert_eq!(saved["flds"], changed["flds"]);
    assert_eq!(saved["sortf"], 1);
    assert_eq!(saved["flds"][0]["id"], original["flds"][0]["id"]);
    f.backend
        .run_service_method(
            23,
            17,
            &RestoreNotetypeToStockRequest {
                notetype_id: Some(NotetypeId { ntid: f.ntid }),
                force_kind: Some(0),
            }
            .encode_to_vec(),
        )
        .unwrap();
    let restored = f.notetype();
    assert_eq!(restored["tmpls"].as_array().unwrap().len(), 1);
    assert_eq!(restored["flds"].as_array().unwrap().len(), 2);
    assert_eq!(restored["flds"][0]["rtl"], false);
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    let note = col.storage.get_note(NoteId(f.note)).unwrap().unwrap();
    assert_eq!(note.fields(), &["SELECTED 中文", "answer"]);
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn notes_and_cards_subset_exports_exclude_unselected_notes_and_leave_collection_unchanged() {
    let f = Fixture::new();
    for cards_mode in [false, true] {
        let limit = Some(ExportLimit {
            limit: Some(if cards_mode {
                export_limit::Limit::CardIds(anki_proto::cards::CardIds {
                    cids: vec![f.cards[0]],
                })
            } else {
                export_limit::Limit::NoteIds(anki_proto::notes::NoteIds {
                    note_ids: vec![f.note],
                })
            }),
        });
        let text = f
            .root
            .path()
            .join(if cards_mode { "cards.txt" } else { "notes.txt" });
        let response = if cards_mode {
            f.backend.run_service_method(
                39,
                8,
                &ExportCardCsvRequest {
                    out_path: text.to_string_lossy().into_owned(),
                    with_html: true,
                    limit: limit.clone(),
                }
                .encode_to_vec(),
            )
        } else {
            f.backend.run_service_method(
                39,
                7,
                &ExportNoteCsvRequest {
                    out_path: text.to_string_lossy().into_owned(),
                    with_html: true,
                    with_tags: true,
                    with_deck: true,
                    with_notetype: true,
                    with_guid: true,
                    limit: limit.clone(),
                }
                .encode_to_vec(),
            )
        }
        .unwrap();
        assert_eq!(UInt32::decode(response.as_slice()).unwrap().val, 1);
        let contents = std::fs::read_to_string(text).unwrap();
        assert!(contents.contains("SELECTED 中文"));
        assert!(!contents.contains("OUTSIDE_SENTINEL"));
        let apkg = f.root.path().join(if cards_mode {
            "cards.apkg"
        } else {
            "notes.apkg"
        });
        let response = f
            .backend
            .run_service_method(
                39,
                4,
                &ExportAnkiPackageRequest {
                    out_path: apkg.to_string_lossy().into_owned(),
                    limit,
                    options: Some(ExportAnkiPackageOptions {
                        with_scheduling: false,
                        with_deck_configs: false,
                        with_media: false,
                        legacy: false,
                    }),
                }
                .encode_to_vec(),
            )
            .unwrap();
        assert_eq!(UInt32::decode(response.as_slice()).unwrap().val, 1);
        assert!(std::fs::metadata(apkg).unwrap().len() > 0);
    }
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    assert_eq!(col.storage.get_all_note_ids().unwrap().len(), 2);
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(NoteId(f.note))
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect::<Vec<_>>(),
        f.cards
    );
}
