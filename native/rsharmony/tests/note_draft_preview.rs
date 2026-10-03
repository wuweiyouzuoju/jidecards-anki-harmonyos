// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki_proto::card_rendering::{
    rendered_template_node, RenderCardResponse, RenderUncommittedCardLegacyRequest,
    RenderedTemplateNode,
};
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::generic::Json;
use anki_proto::notes::{ClozeNumbersInNoteResponse, Note};
use anki_proto::notetypes::{NotetypeId, UpdateNotetypeLegacyRequest};
use prost::Message;
use serde_json::{json, Value};

struct Fixture {
    root: tempfile::TempDir,
    backend: Backend,
    normal: i64,
    cloze: i64,
    normal_note: Note,
    cloze_note: Note,
    cloze_card: i64,
    card_ids: Vec<i64>,
}

fn html(nodes: &[RenderedTemplateNode]) -> String {
    nodes
        .iter()
        .map(|node| match node.value.as_ref().unwrap() {
            rendered_template_node::Value::Text(text) => text.as_str(),
            _ => panic!("Core must fully render preview nodes"),
        })
        .collect()
}

impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("collection.media")).unwrap();
        std::fs::write(
            root.path().join("collection.media/existing.png"),
            b"existing media",
        )
        .unwrap();
        let mut col = CollectionBuilder::new(root.path().join("collection.anki2"))
            .build()
            .unwrap();
        let types = col.get_all_notetypes().unwrap();
        let mut normal = types
            .iter()
            .find(|nt| nt.config.original_stock_kind == 2)
            .unwrap()
            .as_ref()
            .clone();
        normal.templates[0].config.other = br#"{"future":{"keep":1}}"#.to_vec();
        normal.fields[0].config.other = br#"{"future":{"keep":2}}"#.to_vec();
        col.update_notetype(&mut normal, false).unwrap();
        let normal = col.get_notetype(normal.id).unwrap().unwrap();
        let cloze = types
            .iter()
            .find(|nt| nt.config.original_stock_kind == 5)
            .unwrap();
        let mut normal_note = normal.new_note();
        normal_note.set_field(0, "saved question").unwrap();
        normal_note.set_field(1, "saved answer").unwrap();
        col.add_note(&mut normal_note, DeckId(1)).unwrap();
        let mut cloze_note = cloze.new_note();
        cloze_note.set_field(0, "saved {{c1::one}}").unwrap();
        col.add_note(&mut cloze_note, DeckId(1)).unwrap();
        let cloze_card = col
            .storage
            .all_card_ids_of_note_in_template_order(cloze_note.id)
            .unwrap()[0]
            .0;
        let card_ids: Vec<i64> = col
            .storage
            .all_card_ids_of_note_in_template_order(normal_note.id)
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect();
        for (index, card) in card_ids.iter().enumerate() {
            col.storage
                .db()
                .execute_batch(&format!(
                "UPDATE cards SET type=2,queue=2,due=100,ivl=20,reps=3,lapses=1 WHERE id={card};
                 INSERT INTO revlog VALUES ({}, {card}, -1, 3, 20, 10, 2500, 1234, 1);",
                1_000_000 + index
            ))
                .unwrap();
        }
        let normal_id = normal.id.0;
        let cloze_id = cloze.id.0;
        let normal_note: Note = normal_note.into();
        let cloze_note: Note = cloze_note.into();
        col.close(None).unwrap();
        let backend = init_backend(&[]).unwrap();
        backend
            .run_service_method(
                3,
                0,
                &OpenCollectionRequest {
                    collection_path: root
                        .path()
                        .join("collection.anki2")
                        .to_string_lossy()
                        .into(),
                    media_folder_path: root
                        .path()
                        .join("collection.media")
                        .to_string_lossy()
                        .into(),
                    media_db_path: root.path().join("collection.mdb").to_string_lossy().into(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        Self {
            root,
            backend,
            normal: normal_id,
            cloze: cloze_id,
            normal_note,
            cloze_note,
            cloze_card,
            card_ids,
        }
    }

    fn notetype(&self, id: i64) -> Value {
        let bytes = self
            .backend
            .run_service_method(23, 7, &NotetypeId { ntid: id }.encode_to_vec())
            .unwrap();
        serde_json::from_slice(&Json::decode(bytes.as_slice()).unwrap().json).unwrap()
    }

    fn render(&self, note: Note, template: Value, ord: u32, sample: bool) -> RenderCardResponse {
        let bytes = self
            .backend
            .run_service_method(
                27,
                8,
                &RenderUncommittedCardLegacyRequest {
                    note: Some(note),
                    card_ord: ord,
                    template: serde_json::to_vec(&template).unwrap(),
                    fill_empty: sample,
                    partial_render: false,
                }
                .encode_to_vec(),
            )
            .unwrap();
        RenderCardResponse::decode(bytes.as_slice()).unwrap()
    }
}

#[test]
fn actual_drafts_use_each_template_and_cloze_number_without_saving_or_touching_history() {
    let f = Fixture::new();
    let normal = f.notetype(f.normal);
    let cloze = f.notetype(f.cloze);
    let mut note = f.normal_note.clone();
    note.fields = vec![
        "draft <img src=\"draft.png\"> \\(x^2\\)".into(),
        "draft answer [sound:draft.mp3]".into(),
    ];
    for ordinal in 0..2 {
        let rendered = f.render(
            note.clone(),
            normal["tmpls"][ordinal].clone(),
            ordinal as u32,
            false,
        );
        assert!(!rendered.is_empty);
        let text = format!("{:?} {:?}", rendered.question_nodes, rendered.answer_nodes);
        assert!(text.contains("draft.png") && text.contains("draft.mp3") && text.contains("x^2"));
        assert!(!text.contains("saved question") && !text.contains("saved answer"));
    }
    let mut fresh = note.clone();
    fresh.id = 0;
    fresh.fields = vec!["new note".into(), "new answer".into()];
    assert!(format!(
        "{:?}",
        f.render(fresh, normal["tmpls"][0].clone(), 0, false)
            .question_nodes
    )
    .contains("new note"));
    let mut empty = note;
    empty.fields = vec!["".into(), "".into()];
    assert!(
        f.render(empty.clone(), normal["tmpls"][0].clone(), 0, false)
            .is_empty
    );
    assert!(
        !f.render(empty, normal["tmpls"][0].clone(), 0, true)
            .is_empty
    );

    let mut cloze_note = f.cloze_note.clone();
    cloze_note.fields = vec![
        "draft {{c1::ONE}} {{c6::SIX::six hint}} <img src=\"draft.png\">".into(),
        "extra [sound:draft.mp3]".into(),
    ];
    let numbers = f
        .backend
        .run_service_method(25, 8, &cloze_note.encode_to_vec())
        .unwrap();
    let mut numbers = ClozeNumbersInNoteResponse::decode(numbers.as_slice())
        .unwrap()
        .numbers;
    numbers.sort_unstable();
    assert_eq!(numbers, vec![1, 6]);
    let mut template = cloze["tmpls"][0].clone();
    template["qfmt"] = json!(format!(
        "{} <div>card-id:{{{{CardID}}}}</div>",
        template["qfmt"].as_str().unwrap()
    ));
    template["ord"] = json!(0);
    let first = f.render(cloze_note.clone(), template.clone(), 0, false);
    template["ord"] = json!(5);
    let sixth = f.render(cloze_note, template, 5, false);
    assert!(html(&first.question_nodes).contains("data-cloze=\"ONE\" data-ordinal=\"1\">[...]"));
    assert!(
        html(&sixth.question_nodes).contains("data-cloze=\"SIX\" data-ordinal=\"6\">[six hint]")
    );
    assert!(html(&sixth.question_nodes).contains("data-ordinal=\"1\">ONE</span>"));
    assert!(html(&sixth.answer_nodes).contains("data-ordinal=\"6\">SIX</span>"));
    assert!(html(&first.question_nodes).contains(&format!("card-id:{}", f.cloze_card)));
    assert!(html(&sixth.question_nodes).contains("card-id:0"));
    assert_eq!(f.notetype(f.normal), normal);
    assert_eq!(f.notetype(f.cloze), cloze);
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    assert_eq!(col.storage.get_all_note_ids().unwrap().len(), 2);
    assert_eq!(
        col.storage
            .get_note(anki::notes::NoteId(f.normal_note.id))
            .unwrap()
            .unwrap()
            .fields(),
        &f.normal_note.fields
    );
    assert_eq!(
        col.storage
            .get_note(anki::notes::NoteId(f.cloze_note.id))
            .unwrap()
            .unwrap()
            .fields(),
        &f.cloze_note.fields
    );
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(anki::notes::NoteId(f.normal_note.id))
            .unwrap()
            .into_iter()
            .map(|id| id.0)
            .collect::<Vec<_>>(),
        f.card_ids
    );
    for id in &f.card_ids {
        let card: anki_proto::cards::Card = col
            .storage
            .get_card(anki::card::CardId(*id))
            .unwrap()
            .unwrap()
            .into();
        assert_eq!(
            (card.due, card.interval, card.reps, card.lapses),
            (100, 20, 3, 1)
        );
    }
    let logs: i64 = col
        .storage
        .db()
        .query_row("select count(*) from revlog", [], |row| row.get(0))
        .unwrap();
    assert_eq!(logs, 2);
    assert_eq!(
        std::fs::read_dir(f.root.path().join("collection.media"))
            .unwrap()
            .count(),
        1
    );
    assert_eq!(
        std::fs::read(f.root.path().join("collection.media/existing.png")).unwrap(),
        b"existing media"
    );
}

#[test]
fn legacy_reorder_retains_field_template_config_card_identity_and_review_records() {
    let f = Fixture::new();
    let mut draft = f.notetype(f.normal);
    draft["flds"].as_array_mut().unwrap().swap(0, 1);
    draft["tmpls"].as_array_mut().unwrap().swap(0, 1);
    f.backend
        .run_service_method(
            23,
            3,
            &UpdateNotetypeLegacyRequest {
                json: serde_json::to_vec(&draft).unwrap(),
                skip_checks: false,
            }
            .encode_to_vec(),
        )
        .unwrap();
    let actual = f.notetype(f.normal);
    assert_eq!(actual["flds"][1]["future"], json!({"keep":2}));
    assert_eq!(actual["tmpls"][1]["future"], json!({"keep":1}));
    f.backend.run_service_method(3, 1, &[]).unwrap();
    let col = CollectionBuilder::new(f.root.path().join("collection.anki2"))
        .build()
        .unwrap();
    assert_eq!(
        col.storage
            .get_note(anki::notes::NoteId(f.normal_note.id))
            .unwrap()
            .unwrap()
            .fields(),
        &vec!["saved answer", "saved question"]
    );
    let cards = col
        .storage
        .all_card_ids_of_note_in_template_order(anki::notes::NoteId(f.normal_note.id))
        .unwrap()
        .into_iter()
        .map(|id| id.0)
        .collect::<Vec<_>>();
    assert_eq!(cards, vec![f.card_ids[1], f.card_ids[0]]);
    for id in cards {
        let card: anki_proto::cards::Card = col
            .storage
            .get_card(anki::card::CardId(id))
            .unwrap()
            .unwrap()
            .into();
        assert_eq!(
            (card.due, card.interval, card.reps, card.lapses),
            (100, 20, 3, 1)
        );
        let logs: i64 = col
            .storage
            .db()
            .query_row("select count(*) from revlog where cid=?", [id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(logs, 1);
    }
}
