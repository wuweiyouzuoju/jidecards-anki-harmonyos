// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::notetype::NotetypeId;
use anki_proto::card_rendering::{RenderCardResponse, RenderUncommittedCardLegacyRequest};
use anki_proto::collection::{OpChangesWithId, OpenCollectionRequest};
use anki_proto::generic::{Json, UInt32};
use anki_proto::import_export::{
    export_limit, ExportCardCsvRequest, ExportLimit, ExportNoteCsvRequest,
};
use anki_proto::notetypes::UpdateNotetypeLegacyRequest;
use prost::Message;
use serde_json::{json, Value};

struct Fixture {
    root: tempfile::TempDir,
    backend: Backend,
    ntid: i64,
    deck: i64,
    note: i64,
    cards: Vec<i64>,
}

impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("collection.anki2");
        let mut col = CollectionBuilder::new(&path).build().unwrap();
        let deck = col.get_or_create_normal_deck("Text 中文").unwrap().id;
        let mut nt = col
            .get_all_notetypes()
            .unwrap()
            .into_iter()
            .find(|nt| nt.config.original_stock_kind == 1)
            .unwrap()
            .as_ref()
            .clone();
        for name in ["Second", "Third"] {
            let mut template = nt.templates[0].clone();
            template.ord = None;
            template.name = name.into();
            template.config.q_format = format!("{name} {{{{Front}}}}");
            nt.templates.push(template);
        }
        col.update_notetype(&mut nt, false).unwrap();
        let nt = col.get_notetype(nt.id).unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "<b>中文</b>\nline\tquoted \"value\"")
            .unwrap();
        note.set_field(1, "Answer [sound:keep.mp3]").unwrap();
        note.tags = vec!["text_tag".into()];
        col.add_note(&mut note, deck).unwrap();
        let cards = col
            .storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect::<Vec<_>>();
        col.storage
            .db()
            .execute_batch(&format!(
                "UPDATE cards SET type=2,queue=2,due=10,ivl=20,reps=3 WHERE nid={};",
                note.id.0
            ))
            .unwrap();
        let mut outside = nt.new_note();
        outside.set_field(0, "OUTSIDE_SENTINEL").unwrap();
        col.add_note(&mut outside, DeckId(1)).unwrap();
        let ntid = nt.id.0;
        let note = note.id.0;
        col.close(None).unwrap();
        let backend = init_backend(&[]).unwrap();
        backend
            .run_service_method(
                3,
                0,
                &OpenCollectionRequest {
                    collection_path: path.to_string_lossy().into_owned(),
                    media_folder_path: root
                        .path()
                        .join("collection.media")
                        .to_string_lossy()
                        .into_owned(),
                    media_db_path: root
                        .path()
                        .join("collection.mdb")
                        .to_string_lossy()
                        .into_owned(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        Self {
            root,
            backend,
            ntid,
            deck: deck.0,
            note,
            cards,
        }
    }

    fn notetype(&self, id: i64) -> Value {
        let bytes = self
            .backend
            .run_service_method(
                23,
                7,
                &anki_proto::notetypes::NotetypeId { ntid: id }.encode_to_vec(),
            )
            .unwrap();
        serde_json::from_slice(&Json::decode(bytes.as_slice()).unwrap().json).unwrap()
    }

    fn limit(&self) -> Option<ExportLimit> {
        Some(ExportLimit {
            limit: Some(export_limit::Limit::DeckId(self.deck)),
        })
    }
}

#[test]
fn legacy_clone_and_unsaved_template_preview_are_read_only_for_existing_notes() {
    let f = Fixture::new();
    let original = f.notetype(f.ntid);
    let mut clone = original.clone();
    clone["id"] = json!(0);
    clone["mod"] = json!(0);
    clone["usn"] = json!(0);
    clone["name"] = json!("Clone 中文");
    let response = f
        .backend
        .run_service_method(
            23,
            2,
            &Json {
                json: serde_json::to_vec(&clone).unwrap(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    let new_id = OpChangesWithId::decode(response.as_slice()).unwrap().id;
    assert_ne!(new_id, f.ntid);
    let actual = f.notetype(new_id);
    assert_eq!(actual["name"], "Clone 中文");
    assert_eq!(actual["css"], original["css"]);
    assert_eq!(actual["flds"], original["flds"]);
    assert_eq!(actual["tmpls"], original["tmpls"]);
    let draft = json!({"ord":null,"name":"Draft","qfmt":"draft 中文 {{Front}}","afmt":"{{FrontSide}} {{Back}}"});
    let response = f
        .backend
        .run_service_method(
            27,
            8,
            &RenderUncommittedCardLegacyRequest {
                note: Some(anki_proto::notes::Note {
                    notetype_id: f.ntid,
                    fields: vec!["".into(), "".into()],
                    ..Default::default()
                }),
                card_ord: 3,
                template: serde_json::to_vec(&draft).unwrap(),
                fill_empty: true,
                partial_render: false,
            }
            .encode_to_vec(),
        )
        .unwrap();
    let rendered = RenderCardResponse::decode(response.as_slice()).unwrap();
    assert!(!rendered.is_empty);
    assert!(format!("{:?}", rendered.question_nodes).contains("draft 中文"));
    assert_eq!(f.notetype(f.ntid), original);
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let mut col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    assert_eq!(col.storage.get_all_note_ids().unwrap().len(), 2);
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(anki::notes::NoteId(f.note))
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect::<Vec<_>>(),
        f.cards
    );
    assert!(col.get_notetype(NotetypeId(new_id)).unwrap().is_some());
}

#[test]
fn removing_middle_template_keeps_surviving_card_ids_and_scheduling() {
    let f = Fixture::new();
    let mut nt = f.notetype(f.ntid);
    let templates = nt["tmpls"].as_array_mut().unwrap();
    templates.remove(1);
    templates.push(json!({"ord":null,"name":"New","qfmt":"New {{Front}}","afmt":"{{Back}}"}));
    f.backend
        .run_service_method(
            23,
            3,
            &UpdateNotetypeLegacyRequest {
                json: serde_json::to_vec(&nt).unwrap(),
                skip_checks: false,
            }
            .encode_to_vec(),
        )
        .unwrap();
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    let cards = col
        .storage
        .all_cards_of_note(anki::notes::NoteId(f.note))
        .unwrap();
    assert_eq!(cards.len(), 3);
    assert!(!cards.iter().any(|card| card.id().0 == f.cards[1]));
    for (ordinal, id) in [(0, f.cards[0]), (1, f.cards[2])] {
        let card = cards.iter().find(|card| card.id().0 == id).unwrap();
        assert_eq!(card.template_idx(), ordinal);
        let card: anki_proto::cards::Card = card.clone().into();
        assert_eq!(card.interval, 20);
        assert_eq!(card.reps, 3);
    }
}

#[test]
fn text_export_rpc_respects_deck_html_and_metadata_with_unicode_multiline_fields() {
    let f = Fixture::new();
    let notes = f.root.path().join("笔记.txt");
    let response = f
        .backend
        .run_service_method(
            39,
            7,
            &ExportNoteCsvRequest {
                out_path: notes.to_string_lossy().into_owned(),
                with_html: true,
                with_tags: true,
                with_deck: true,
                with_notetype: true,
                with_guid: true,
                limit: f.limit(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    assert_eq!(UInt32::decode(response.as_slice()).unwrap().val, 1);
    let text = std::fs::read_to_string(notes).unwrap();
    assert!(text.starts_with("#separator:tab\n#html:true\n"));
    for expected in [
        "<b>中文</b>",
        "line\tquoted",
        "text_tag",
        "#guid column:",
        "#notetype column:",
        "#deck column:",
        "#tags column:",
    ] {
        assert!(text.contains(expected), "missing {expected}: {text}");
    }
    assert!(!text.contains("OUTSIDE_SENTINEL"));
    let cards = f.root.path().join("卡片.txt");
    let response = f
        .backend
        .run_service_method(
            39,
            8,
            &ExportCardCsvRequest {
                out_path: cards.to_string_lossy().into_owned(),
                with_html: false,
                limit: f.limit(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    assert_eq!(UInt32::decode(response.as_slice()).unwrap().val, 3);
    let text = std::fs::read_to_string(cards).unwrap();
    assert!(text.starts_with("#separator:tab\n#html:false\n"));
    assert!(text.contains("中文"));
    assert!(text.contains("Answer"));
    assert!(!text.contains("<b>"));
    assert!(!text.contains("OUTSIDE_SENTINEL"));
}
