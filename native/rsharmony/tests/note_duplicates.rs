// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::search::{SearchNode, SortMode};
use jidecards_core::note_duplicates::{call, Request, Response, BATCH_SIZE};
use prost::Message;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

#[derive(Clone, PartialEq, Message)]
struct Open {
    #[prost(string, tag = "1")]
    collection: String,
    #[prost(string, tag = "2")]
    media: String,
    #[prost(string, tag = "3")]
    media_db: String,
}

#[test]
fn bounded_batches_scan_large_core_collections_and_only_return_selected_fields() {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let root = std::env::temp_dir().join(format!(
        "jidecards-dupes-test-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::SeqCst)
    ));
    std::fs::create_dir(&root).unwrap();
    let path = root.join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut ids = Vec::new();
    for i in 0..1205 {
        let mut note = nt.new_note();
        note.set_field(0, format!("unique {i}")).unwrap();
        note.set_field(
            1,
            match i {
                0 | 1204 => "<b>same &amp; 中文</b>",
                199 | 400 => "<img src=\"media.png\">",
                2 => "Same &amp; 中文",
                3 => "same &amp; 中文 ",
                _ => "<b></b>",
            },
        )
        .unwrap();
        if i == 0 || i == 1204 {
            note.tags.push("scope".into());
        }
        col.add_note(&mut note, DeckId(1)).unwrap();
        ids.push(note.id.0);
    }
    let other_type = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|other| other.id != nt.id && other.config.original_stock_kind == 2)
        .unwrap();
    let mut unrelated = other_type.new_note();
    unrelated.set_field(0, "unrelated OR scope hit").unwrap();
    unrelated.tags.push("none-such".into());
    col.add_note(&mut unrelated, DeckId(1)).unwrap();
    let scope = format!("mid:{} (tag:scope OR tag:none-such)", nt.id.0);
    let scoped = col.search_notes(scope.as_str(), SortMode::NoOrder).unwrap();
    assert_eq!(scoped.len(), 2);
    let exact_search = format!("nid:{},{}", ids[0], ids[1204]);
    let exact = col
        .search_notes(exact_search.as_str(), SortMode::NoOrder)
        .unwrap();
    assert_eq!(exact, scoped);
    drop(col);
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            3,
            0,
            &Open {
                collection: path.to_string_lossy().into(),
                media: root.join("media").to_string_lossy().into(),
                media_db: root.join("media.db2").to_string_lossy().into(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    // Exercise the same Core node/RPC path as the UI, including an empty scope.
    use anki_proto::search::{search_node, SearchRequest, SearchResponse};
    for (scope, expected) in [
        ("", ids.clone()),
        ("tag:scope OR tag:none-such", vec![ids[0], ids[1204]]),
    ] {
        let node = anki_proto::search::SearchNode {
            filter: Some(search_node::Filter::Group(search_node::Group {
                nodes: [format!("mid:{}", nt.id.0), scope.into()]
                    .into_iter()
                    .map(|text| anki_proto::search::SearchNode {
                        filter: Some(search_node::Filter::ParsableText(text)),
                    })
                    .collect(),
                joiner: search_node::group::Joiner::And as i32,
            })),
        };
        let search = anki_proto::generic::String::decode(
            backend
                .run_service_method(29, 0, &node.encode_to_vec())
                .unwrap()
                .as_slice(),
        )
        .unwrap()
        .val;
        let found = SearchResponse::decode(
            backend
                .run_service_method(
                    29,
                    2,
                    &SearchRequest {
                        search,
                        order: None,
                    }
                    .encode_to_vec(),
                )
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        assert_eq!(found.ids, expected);
    }
    let before = db(&backend, "select * from notes order by id");
    let mut groups: HashMap<String, Vec<i64>> = HashMap::new();
    for batch in ids.chunks(BATCH_SIZE) {
        let fields = Response::decode(
            call(
                &backend,
                0,
                &Request {
                    note_ids: batch.to_vec(),
                    notetype_id: nt.id.0,
                    field_ord: 1,
                }
                .encode_to_vec(),
            )
            .unwrap()
            .as_slice(),
        )
        .unwrap()
        .fields;
        assert_eq!(fields.len(), batch.len());
        for field in fields {
            if !field.value.is_empty() {
                groups.entry(field.value).or_default().push(field.note_id);
            }
        }
    }
    assert_eq!(groups["same & 中文"], vec![ids[0], ids[1204]]);
    assert_eq!(groups["Same & 中文"], vec![ids[2]]);
    assert_eq!(groups["same & 中文 "], vec![ids[3]]);
    let media = groups
        .iter()
        .find(|(value, _)| value.contains("media.png"))
        .unwrap();
    assert_eq!(media.1, &vec![ids[199], ids[400]]);
    assert!(!media.0.contains("<img"));
    for request in [
        Request {
            note_ids: vec![],
            notetype_id: nt.id.0,
            field_ord: 0,
        },
        Request {
            note_ids: ids[..201].to_vec(),
            notetype_id: nt.id.0,
            field_ord: 0,
        },
        Request {
            note_ids: vec![ids[0], ids[0]],
            notetype_id: nt.id.0,
            field_ord: 0,
        },
        Request {
            note_ids: vec![-1],
            notetype_id: nt.id.0,
            field_ord: 0,
        },
        Request {
            note_ids: vec![ids[0]],
            notetype_id: nt.id.0,
            field_ord: 99,
        },
        Request {
            note_ids: vec![ids[0]],
            notetype_id: nt.id.0 + 9999,
            field_ord: 0,
        },
        Request {
            note_ids: vec![i64::MAX],
            notetype_id: nt.id.0,
            field_ord: 0,
        },
    ] {
        assert!(call(&backend, 0, &request.encode_to_vec()).is_err());
    }
    assert!(call(
        &backend,
        1,
        &Request {
            note_ids: vec![ids[0]],
            notetype_id: nt.id.0,
            field_ord: 0
        }
        .encode_to_vec()
    )
    .is_err());
    assert!(call(&backend, 0, &[255]).is_err());
    assert_eq!(before, db(&backend, "select * from notes order by id"));
    backend.run_service_method(3, 1, &[]).unwrap();
    assert_eq!(root.parent().unwrap(), std::env::temp_dir());
    assert!(root
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("jidecards-dupes-test-"));
    std::fs::remove_dir_all(root).unwrap();
}

fn db(backend: &Backend, sql: &str) -> Vec<u8> {
    backend
        .run_db_command_bytes(
            serde_json::json!({
                "kind": "query", "sql": sql, "args": [], "first_row_only": false
            })
            .to_string()
            .as_bytes(),
        )
        .unwrap()
}

#[test]
fn core_duplicate_warning_is_separate_from_empty_and_invalid_cloze_states() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let basic = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let first = "<b>quote \" slash \\ wildcard * 中 &amp;</b>";
    let mut original = basic.new_note();
    original.set_field(0, first).unwrap();
    original.set_field(1, "back").unwrap();
    col.add_note(&mut original, DeckId(1)).unwrap();
    let mut duplicate = basic.new_note();
    duplicate.set_field(0, first).unwrap();
    duplicate.set_field(1, "other").unwrap();
    assert_eq!(col.note_fields_check(&duplicate).unwrap() as i32, 2);
    let duplicates = col
        .search_notes(
            SearchNode::Duplicates {
                notetype_id: basic.id,
                text: first.into(),
            },
            SortMode::NoOrder,
        )
        .unwrap();
    assert_eq!(duplicates, vec![original.id]);
    // Core add itself permits duplicates; application default validation is tested in Node.
    col.add_note(&mut duplicate, DeckId(1)).unwrap();
    assert_ne!(duplicate.id, original.id);
    duplicate.set_field(0, "<b> </b>").unwrap();
    assert_eq!(col.note_fields_check(&duplicate).unwrap() as i32, 1);
    duplicate.set_field(0, first).unwrap();
    duplicate.set_field(1, "{{c1::wrong type}}").unwrap();
    assert_eq!(col.note_fields_check(&duplicate).unwrap() as i32, 4);
    let mut cloze = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.kind == 1)
        .unwrap()
        .as_ref()
        .clone();
    let mut note = cloze.new_note();
    note.set_field(0, "text without cloze").unwrap();
    assert_eq!(col.note_fields_check(&note).unwrap() as i32, 3);
    note.set_field(0, "{{c1::valid}}").unwrap();
    note.set_field(1, "{{c2::outside cloze field}}").unwrap();
    assert_eq!(col.note_fields_check(&note).unwrap() as i32, 5);
    // Renamed note types keep the same Core behavior and field identities.
    cloze.name = "Renamed cloze".into();
    col.update_notetype(&mut cloze, false).unwrap();
    note.set_field(1, "").unwrap();
    assert_eq!(col.note_fields_check(&note).unwrap() as i32, 0);
}
