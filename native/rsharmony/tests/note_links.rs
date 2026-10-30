// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use jidecards_core::note_links;
use prost::Message;

#[derive(Clone, PartialEq, Message)]
struct Text {
    #[prost(string, tag = "1")]
    val: String,
}
#[derive(Clone, PartialEq, Message)]
struct Open {
    #[prost(string, tag = "1")]
    collection: String,
    #[prost(string, tag = "2")]
    media: String,
    #[prost(string, tag = "3")]
    media_db: String,
}
fn db(backend: &Backend, sql: &str) -> Vec<u8> {
    backend
        .run_db_command_bytes(
            serde_json::json!({"kind":"query","sql":sql,"args":[],"first_row_only":false})
                .to_string()
                .as_bytes(),
        )
        .unwrap()
}
#[test]
fn resolves_guids_not_stale_numeric_ids_and_only_returns_metadata_without_mutation() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|n| n.fields.len() == 2)
        .unwrap();
    let guid = "d`LW#/&|";
    for (g, title, content) in [
        (
            "source",
            "<b>Source</b>",
            "user<!--jide-links:v1:%7B%22v%22%3A1%7D-->mirror",
        ),
        (guid, "Target", "answer"),
    ] {
        let mut note = nt.new_note();
        note.guid = g.to_owned();
        note.set_field(0, title).unwrap();
        note.set_field(1, content).unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
    }
    drop(col);
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            3,
            0,
            &Open {
                collection: path.to_string_lossy().into(),
                media: root.path().join("media").to_string_lossy().into(),
                media_db: root.path().join("media.db2").to_string_lossy().into(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    let before = db(&backend, "select * from notes order by id");
    let cards = db(&backend, "select * from cards order by id");
    let response =
        note_links::call(&backend, 0, &Text { val: String::new() }.encode_to_vec()).unwrap();
    let graph: serde_json::Value =
        serde_json::from_str(&Text::decode(response.as_slice()).unwrap().val).unwrap();
    assert_eq!(graph.as_array().unwrap().len(), 1);
    assert_eq!(graph[0]["title"], "Source");
    assert_eq!(
        graph[0]["metadata"],
        "<!--jide-links:v1:%7B%22v%22%3A1%7D-->"
    );
    let response = note_links::call(
        &backend,
        1,
        &Text {
            val: serde_json::json!([guid, "missing", "' OR 1=1 --"]).to_string(),
        }
        .encode_to_vec(),
    )
    .unwrap();
    let resolved: serde_json::Value =
        serde_json::from_str(&Text::decode(response.as_slice()).unwrap().val).unwrap();
    assert_eq!(resolved.as_array().unwrap().len(), 1);
    assert_eq!(resolved[0]["guid"], guid);
    assert!(!resolved[0]["cardIds"].as_array().unwrap().is_empty());
    for value in [
        "[]".to_string(),
        serde_json::json!(vec!["x"; 201]).to_string(),
        "invalid".to_string(),
    ] {
        assert!(note_links::call(&backend, 1, &Text { val: value }.encode_to_vec()).is_err());
    }
    assert!(note_links::call(&backend, 42, &Text { val: String::new() }.encode_to_vec()).is_err());
    assert_eq!(before, db(&backend, "select * from notes order by id"));
    assert_eq!(cards, db(&backend, "select * from cards order by id"));
    backend.run_service_method(3, 1, &[]).unwrap();
}
