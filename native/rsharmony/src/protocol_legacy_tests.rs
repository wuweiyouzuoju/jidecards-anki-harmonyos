// SPDX-License-Identifier: AGPL-3.0-or-later
//! Immutable pre-migration native code is an executable comparison oracle, never production.
#![allow(dead_code)]
use crate::protocol_generated::*;
use crate::rpc_ids::*;
use crate::{BackendFailure, RawBackend};
use prost::Message;

#[path = "../../../tools/tests/fixtures/protocol-legacy/native/note_duplicates.rs"]
mod old_duplicates;
#[path = "../../../tools/tests/fixtures/protocol-legacy/native/collection_history.rs"]
mod old_history;
#[path = "../../../tools/tests/fixtures/protocol-legacy/native/media_snapshot.rs"]
mod old_media;
#[path = "../../../tools/tests/fixtures/protocol-legacy/native/deck_preview.rs"]
mod old_preview;

#[derive(Default)]
struct Fake {
    calls: Vec<(u32, u32, Vec<u8>)>,
}
impl RawBackend for Fake {
    fn run_method_raw(
        &mut self,
        service: u32,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        self.calls.push((service, method, input.to_vec()));
        Ok(match (service, method) {
            (MEDIA_SERVICE, CHECK_MEDIA) => MediaCheckMediaResponse {
                unused: vec!["unused😀.mp3".into()],
                missing: vec!["missing.png".into()],
                missing_media_notes: vec![17, 2, 17],
                report: "报告😀\n".repeat(2000),
                have_trash: true,
            }
            .encode_to_vec(),
            (TAGS_SERVICE, ADD_NOTE_TAGS) => CollectionOpChangesWithCount {
                count: 2,
                ..Default::default()
            }
            .encode_to_vec(),
            (COLLECTION_SERVICE, GET_UNDO_STATUS) => CollectionUndoStatus {
                undo: "删除😀".into(),
                redo: "添加".into(),
                last_step: u32::MAX,
            }
            .encode_to_vec(),
            _ => vec![8, 1],
        })
    }
}

#[test]
fn native_media_projection_bytes_errors_and_core_calls_match_legacy() {
    let mut before = old_media::MediaSnapshot::default();
    let mut after = crate::media_snapshot::MediaSnapshot::default();
    let mut old_raw = Fake::default();
    let mut new_raw = Fake::default();
    for write_method in [3, 4, 6] {
        let check = before.call(&mut old_raw, 0, &[]).unwrap();
        assert_eq!(check, after.call(&mut new_raw, 0, &[]).unwrap());
        let token = JideMediaPage::decode(check.as_slice()).unwrap().token;
        for method in [1, 2, 5, 99] {
            for offset in [0, 1, u32::MAX] {
                let mut input = JideMediaRequest { token, offset }.encode_to_vec();
                input.extend_from_slice(&[0xf8, 0x3e, 1]);
                assert_eq!(
                    before.call(&mut old_raw, method, &input),
                    after.call(&mut new_raw, method, &input)
                );
            }
        }
        let input = JideMediaRequest { token, offset: 0 }.encode_to_vec();
        assert_eq!(
            before.call(&mut old_raw, write_method, &input),
            after.call(&mut new_raw, write_method, &input)
        );
        assert_eq!(
            before.call(&mut old_raw, 2, &input),
            after.call(&mut new_raw, 2, &input)
        );
    }
    assert_eq!(
        before.call(&mut old_raw, 0, &[10, 255]),
        after.call(&mut new_raw, 0, &[10, 255])
    );
    assert_eq!(old_raw.calls, new_raw.calls);
}

#[test]
fn native_history_bytes_presence_unknowns_errors_and_calls_match_legacy() {
    for method in [0, 1, 2] {
        for (undo, step) in [("删除😀", u32::MAX), ("", u32::MAX), ("删除😀", 0)] {
            let mut input = CollectionUndoStatus {
                undo: undo.into(),
                redo: "添加".into(),
                last_step: step,
            }
            .encode_to_vec();
            input.extend_from_slice(&[0xf8, 0x3e, 1]);
            let mut before = Fake::default();
            let mut after = Fake::default();
            assert_eq!(
                old_history::call(&mut before, method, &input),
                crate::collection_history::call(&mut after, method, &input)
            );
            assert_eq!(before.calls, after.calls);
        }
    }
    let mut before = Fake::default();
    let mut after = Fake::default();
    assert_eq!(
        old_history::call(&mut before, 0, &[10, 255]),
        crate::collection_history::call(&mut after, 0, &[10, 255])
    );
}

#[test]
fn malformed_core_changes_have_an_explicit_stricter_error_than_legacy_projection() {
    struct Malformed(Fake);
    impl RawBackend for Malformed {
        fn run_method_raw(
            &mut self,
            service: u32,
            method: u32,
            input: &[u8],
        ) -> Result<Vec<u8>, BackendFailure> {
            if service == TAGS_SERVICE && method == ADD_NOTE_TAGS {
                // Valid count, invalid nested OpChanges field zero. Old count-only projection ignored it.
                Ok(vec![10, 1, 0, 16, 2])
            } else {
                self.0.run_method_raw(service, method, input)
            }
        }
    }
    let mut before = old_media::MediaSnapshot::default();
    let mut after = crate::media_snapshot::MediaSnapshot::default();
    let mut old_raw = Malformed(Fake::default());
    let mut new_raw = Malformed(Fake::default());
    let first = before.call(&mut old_raw, 0, &[]).unwrap();
    assert_eq!(first, after.call(&mut new_raw, 0, &[]).unwrap());
    let request = JideMediaRequest {
        token: JideMediaPage::decode(first.as_slice()).unwrap().token,
        offset: 0,
    }
    .encode_to_vec();
    let old = before.call(&mut old_raw, 6, &request).unwrap();
    assert_eq!(
        JideMediaPage::decode(old.as_slice()).unwrap().tagged_count,
        2
    );
    assert_eq!(
        after.call(&mut new_raw, 6, &request),
        Err(BackendFailure::Backend(
            GenericStringList {
                vals: vec!["Invalid tag response".into()]
            }
            .encode_to_vec()
        ))
    );
    #[cfg(feature = "anki-core")]
    assert!(
        anki_proto::collection::OpChangesWithCount::decode([10, 1, 0, 16, 2].as_slice()).is_err()
    );
}

#[test]
fn native_private_message_bytes_and_values_match_legacy_at_full_width() {
    for id in [0, 17, i64::MIN, i64::MAX] {
        let old = old_preview::Request {
            deck_id: id,
            scope: u32::MAX,
        };
        let new = JideDeckPreviewRequest {
            deck_id: id,
            scope: u32::MAX,
        };
        assert_eq!(old.encode_to_vec(), new.encode_to_vec());
        assert_eq!(
            old_preview::Request::decode(new.encode_to_vec().as_slice())
                .unwrap()
                .deck_id,
            id
        );
        assert_eq!(
            JideDeckPreviewRequest::decode(old.encode_to_vec().as_slice()).unwrap(),
            new
        );
        let old = old_duplicates::Request {
            note_ids: vec![id, 17],
            notetype_id: id,
            field_ord: u32::MAX,
        };
        let new = JideNoteDuplicateRequest {
            note_ids: vec![id, 17],
            notetype_id: id,
            field_ord: u32::MAX,
        };
        assert_eq!(old.encode_to_vec(), new.encode_to_vec());
        assert_eq!(
            JideNoteDuplicateRequest::decode(old.encode_to_vec().as_slice()).unwrap(),
            new
        );
        assert_eq!(
            old_duplicates::Request::decode(new.encode_to_vec().as_slice())
                .unwrap()
                .note_ids,
            new.note_ids
        );
        let old = old_duplicates::Response {
            fields: vec![old_duplicates::Field {
                note_id: id,
                value: "UTF-8😀".into(),
            }],
        };
        let new = JideNoteDuplicateResponse {
            fields: vec![JideDuplicateField {
                note_id: id,
                value: "UTF-8😀".into(),
            }],
        };
        assert_eq!(old.encode_to_vec(), new.encode_to_vec());
        assert_eq!(
            JideNoteDuplicateResponse::decode(old.encode_to_vec().as_slice()).unwrap(),
            new
        );
        assert_eq!(
            old_duplicates::Response::decode(new.encode_to_vec().as_slice())
                .unwrap()
                .fields[0]
                .value,
            new.fields[0].value
        );
        assert_eq!(
            old_preview::Response {
                card_ids: vec![id, 17]
            }
            .encode_to_vec(),
            JideDeckPreviewResponse {
                card_ids: vec![id, 17]
            }
            .encode_to_vec()
        );
    }
}

#[cfg(feature = "anki-core")]
#[test]
fn native_preview_and_duplicate_calls_match_legacy_on_real_core() {
    use anki::{backend::init_backend, collection::CollectionBuilder, decks::DeckId};
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("legacy.anki2");
    let (note_id, notetype_id) = {
        let mut col = CollectionBuilder::new(&path).build().unwrap();
        let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "旧／新😀").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        (note.id.0, nt.id.0)
    };
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            COLLECTION_SERVICE,
            OPEN_COLLECTION,
            &anki_proto::collection::OpenCollectionRequest {
                collection_path: path.to_string_lossy().into(),
                media_folder_path: root.path().join("media").to_string_lossy().into(),
                media_db_path: root.path().join("media.db").to_string_lossy().into(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    for method in [0, 1] {
        for scope in 0..=4 {
            let mut input = JideDeckPreviewRequest { deck_id: 1, scope }.encode_to_vec();
            input.extend_from_slice(&[0xf8, 0x3e, 1]);
            assert_eq!(
                old_preview::call(&backend, method, &input),
                crate::deck_preview::call(&backend, method, &input)
            );
        }
        for ids in [vec![note_id], vec![], vec![note_id, note_id]] {
            let mut input = JideNoteDuplicateRequest {
                note_ids: ids,
                notetype_id,
                field_ord: 0,
            }
            .encode_to_vec();
            input.extend_from_slice(&[0xf8, 0x3e, 1]);
            assert_eq!(
                old_duplicates::call(&backend, method, &input),
                crate::note_duplicates::call(&backend, method, &input)
            );
        }
    }
    for input in [vec![], vec![10, 255]] {
        assert_eq!(
            old_preview::call(&backend, 0, &input),
            crate::deck_preview::call(&backend, 0, &input)
        );
        assert_eq!(
            old_duplicates::call(&backend, 0, &input),
            crate::note_duplicates::call(&backend, 0, &input)
        );
    }
    backend
        .run_service_method(COLLECTION_SERVICE, CLOSE_COLLECTION, &[])
        .unwrap();
}
