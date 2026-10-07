// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::Backend;
use anki_proto::card_rendering::{CompareAnswerRequest, ExtractClozeForTypingRequest};
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::generic;
use prost::Message;
use serde_json::Value;

fn method(name: &str) -> (u32, u32) {
    let baseline: Value =
        serde_json::from_str(include_str!("../../../tools/rpc-index-baseline.json")).unwrap();
    baseline["services"]
        .as_object()
        .unwrap()
        .values()
        .find_map(|service| {
            service["methods"]
                .as_object()
                .unwrap()
                .iter()
                .find_map(|(id, value)| {
                    (value.as_str() == Some(name))
                        .then(|| (service["id"].as_u64().unwrap() as u32, id.parse().unwrap()))
                })
        })
        .unwrap()
}

fn call(backend: &Backend, name: &str, request: &impl Message) -> Vec<u8> {
    let (service, method) = method(name);
    backend
        .run_service_method(service, method, &request.encode_to_vec())
        .unwrap()
}

fn backend() -> (Backend, tempfile::TempDir) {
    let directory = tempfile::tempdir().unwrap();
    let backend = jidecards_core::init_anki_backend(&[]).unwrap();
    call(
        &backend,
        "open_collection",
        &OpenCollectionRequest {
            collection_path: directory
                .path()
                .join("collection.anki2")
                .to_str()
                .unwrap()
                .into(),
            media_folder_path: directory
                .path()
                .join("collection.media")
                .to_str()
                .unwrap()
                .into(),
            media_db_path: directory
                .path()
                .join("collection.mdb")
                .to_str()
                .unwrap()
                .into(),
        },
    );
    (backend, directory)
}

#[test]
fn answer_comparison_fixtures_use_the_locked_core_dispatch() {
    let (backend, _directory) = backend();
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../tools/tests/fixtures/core-answer-comparison.json"
    ))
    .unwrap();
    for case in cases {
        let bytes = call(
            &backend,
            "compare_answer",
            &CompareAnswerRequest {
                expected: case["expected"].as_str().unwrap().into(),
                provided: case["provided"].as_str().unwrap().into(),
                combining: case["combining"].as_bool().unwrap(),
            },
        );
        assert_eq!(
            generic::String::decode(bytes.as_slice()).unwrap().val,
            case["html"].as_str().unwrap(),
            "{case}"
        );
    }
}

#[test]
fn media_paths_encode_hashes_and_leave_remote_urls_unchanged() {
    let (backend, _directory) = backend();
    let html = "<img src=\"图#1.png\"><img src=\"https://example.com/图#1.png\">";
    let bytes = call(
        &backend,
        "encode_iri_paths",
        &generic::String { val: html.into() },
    );
    let encoded = generic::String::decode(bytes.as_slice()).unwrap().val;
    assert_eq!(
        encoded,
        "<img src=\"图%231.png\"><img src=\"https://example.com/图#1.png\">"
    );
    let bytes = call(
        &backend,
        "decode_iri_paths",
        &generic::String { val: encoded },
    );
    assert_eq!(generic::String::decode(bytes.as_slice()).unwrap().val, html);
}

#[test]
fn cloze_typing_preserves_numbering_nested_content_and_duplicate_collapse() {
    let (backend, _directory) = backend();
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../tools/tests/fixtures/core-cloze-typing.json"
    ))
    .unwrap();
    for case in cases {
        let bytes = call(
            &backend,
            "extract_cloze_for_typing",
            &ExtractClozeForTypingRequest {
                text: case["text"].as_str().unwrap().into(),
                ordinal: case["ordinal"].as_u64().unwrap() as u32,
            },
        );
        assert_eq!(
            generic::String::decode(bytes.as_slice()).unwrap().val,
            case["expected"].as_str().unwrap()
        );
    }
}

#[test]
fn deferred_frontside_keeps_question_av_out_of_answer_autoplay() {
    use anki::collection::CollectionBuilder;
    use anki_proto::card_rendering::{
        rendered_template_node::Value, ExtractAvTagsRequest, ExtractAvTagsResponse,
        RenderCardResponse, RenderExistingCardRequest,
    };
    let (backend, directory) = backend();
    call(&backend, "close_collection", &generic::Empty {});
    let collection_path = directory.path().join("collection.anki2");
    let mut col = CollectionBuilder::new(&collection_path).build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Question[sound:q.wav]").unwrap();
    note.set_field(1, "Answer[sound:a.wav]").unwrap();
    col.add_note(&mut note, 1.into()).unwrap();
    let cid = col
        .storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap()[0]
        .0;
    col.close(None).unwrap();
    call(
        &backend,
        "open_collection",
        &OpenCollectionRequest {
            collection_path: collection_path.to_string_lossy().into_owned(),
            media_folder_path: directory
                .path()
                .join("collection.media")
                .to_string_lossy()
                .into_owned(),
            media_db_path: directory
                .path()
                .join("collection.mdb")
                .to_string_lossy()
                .into_owned(),
        },
    );
    let rendered = RenderCardResponse::decode(
        call(
            &backend,
            "render_existing_card",
            &RenderExistingCardRequest {
                card_id: cid,
                browser: false,
                partial_render: true,
            },
        )
        .as_slice(),
    )
    .unwrap();
    let question: String = rendered
        .question_nodes
        .iter()
        .map(|node| match node.value.as_ref().unwrap() {
            Value::Text(text) => text.as_str(),
            Value::Replacement(_) => panic!("stock Basic question must be complete"),
        })
        .collect();
    let q = ExtractAvTagsResponse::decode(
        call(
            &backend,
            "extract_av_tags",
            &ExtractAvTagsRequest {
                text: question,
                question_side: true,
            },
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(q.av_tags.len(), 1);
    let mut deferred_fronts = 0;
    let answer: String = rendered
        .answer_nodes
        .iter()
        .map(|node| match node.value.as_ref().unwrap() {
            Value::Text(text) => text.as_str(),
            Value::Replacement(replacement) => {
                assert_eq!(replacement.field_name, "FrontSide");
                assert!(replacement.filters.is_empty());
                deferred_fronts += 1;
                q.text.as_str()
            }
        })
        .collect();
    assert_eq!(deferred_fronts, 1);
    let a = ExtractAvTagsResponse::decode(
        call(
            &backend,
            "extract_av_tags",
            &ExtractAvTagsRequest {
                text: answer,
                question_side: false,
            },
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(a.av_tags.len(), 1);
    assert!(a.text.contains("[anki:play:q:0]"));
    assert!(a.text.contains("[anki:play:a:0]"));
    call(&backend, "close_collection", &generic::Empty {});
}
