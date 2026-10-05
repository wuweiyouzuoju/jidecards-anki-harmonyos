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
