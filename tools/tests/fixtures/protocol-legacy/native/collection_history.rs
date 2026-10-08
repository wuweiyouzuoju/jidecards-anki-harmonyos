// SPDX-License-Identifier: AGPL-3.0-or-later
//! Compare the displayed history and execute under the registry's collection mutex.
use crate::rpc_ids::{COLLECTION_SERVICE, GET_UNDO_STATUS, REDO, UNDO};
use crate::{BackendFailure, RawBackend};
use prost::Message;

// 1000 media snapshot, 1001 deck preview, 1002 note duplicates.
pub const SERVICE: u32 = 1003;

#[derive(Clone, PartialEq, Message)]
struct Status {
    #[prost(string, tag = "1")]
    undo: String,
    #[prost(string, tag = "2")]
    redo: String,
    #[prost(uint32, tag = "3")]
    last_step: u32,
}

fn invalid() -> BackendFailure {
    // BackendError.localized, stable application error translated by the dialog.
    #[derive(Clone, PartialEq, Message)]
    struct Error {
        #[prost(string, tag = "1")]
        localized: String,
    }
    BackendFailure::Backend(
        Error {
            localized: "collection_history_changed".into(),
        }
        .encode_to_vec(),
    )
}

pub fn call(
    raw: &mut dyn RawBackend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, BackendFailure> {
    let expected = Status::decode(input).map_err(|_| invalid())?;
    let current = raw.run_method_raw(COLLECTION_SERVICE, GET_UNDO_STATUS, &[])?;
    let current = Status::decode(current.as_slice()).map_err(|_| invalid())?;
    if current != expected
        || method > 1
        || (if method == 0 {
            &current.undo
        } else {
            &current.redo
        })
        .is_empty()
    {
        return Err(invalid());
    }
    raw.run_method_raw(
        COLLECTION_SERVICE,
        if method == 0 { UNDO } else { REDO },
        &[],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fake {
        status: Status,
        writes: usize,
    }
    impl RawBackend for Fake {
        fn run_method_raw(
            &mut self,
            service: u32,
            method: u32,
            _: &[u8],
        ) -> Result<Vec<u8>, BackendFailure> {
            assert_eq!(service, COLLECTION_SERVICE);
            if method == GET_UNDO_STATUS {
                return Ok(self.status.encode_to_vec());
            }
            assert!(method == UNDO || method == REDO);
            self.writes += 1;
            Ok(vec![])
        }
    }
    #[test]
    fn changed_or_unavailable_history_never_undoes_another_operation() {
        let status = Status {
            undo: "Delete".into(),
            redo: String::new(),
            last_step: 7,
        };
        let mut raw = Fake {
            status: status.clone(),
            writes: 0,
        };
        assert!(call(&mut raw, 1, &status.encode_to_vec()).is_err());
        raw.status.last_step += 1;
        assert!(call(&mut raw, 0, &status.encode_to_vec()).is_err());
        assert_eq!(raw.writes, 0);
        let current = raw.status.encode_to_vec();
        call(&mut raw, 0, &current).unwrap();
        assert_eq!(raw.writes, 1);
    }

    #[cfg(feature = "anki-core")]
    #[test]
    fn registry_preview_and_deleted_deck_undo_redo_preserve_cards_and_notes() {
        use crate::{deck_preview, AnkiBackend, BackendRegistry};
        use anki::collection::CollectionBuilder;
        use anki::decks::DeckId;
        use anki_proto::collection::OpenCollectionRequest;
        use anki_proto::decks::{DeckId as DeckRequest, DeckIds};
        use anki_proto::notes::NoteId;
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("collection.anki2");
        let (parent, child, note_id, card_id) = {
            let mut col = CollectionBuilder::new(&path).build().unwrap();
            let parent = col.get_or_create_normal_deck("Undo parent").unwrap().id.0;
            let child = col
                .get_or_create_normal_deck("Undo parent::Child")
                .unwrap()
                .id
                .0;
            let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
            let mut note = nt.new_note();
            note.set_field(0, "中文删除恢复").unwrap();
            note.set_field(1, "preserve exact fields and IDs").unwrap();
            col.add_note(&mut note, DeckId(child)).unwrap();
            let card_id = col
                .storage
                .all_card_ids_of_note_in_template_order(note.id)
                .unwrap()[0]
                .0;
            let result = (parent, child, note.id.0, card_id);
            col.close(None).unwrap();
            result
        };
        let registry = BackendRegistry::new();
        let handle = registry.insert(AnkiBackend(anki::backend::init_backend(&[]).unwrap()));
        registry
            .call(
                handle,
                COLLECTION_SERVICE,
                0,
                &OpenCollectionRequest {
                    collection_path: path.to_string_lossy().into_owned(),
                    media_folder_path: root.path().join("media").to_string_lossy().into_owned(),
                    media_db_path: root.path().join("media.db").to_string_lossy().into_owned(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        let preview = registry
            .call(
                handle,
                deck_preview::SERVICE,
                0,
                &deck_preview::Request {
                    deck_id: parent,
                    scope: 3,
                }
                .encode_to_vec(),
            )
            .unwrap();
        assert_eq!(
            deck_preview::Response::decode(preview.as_slice())
                .unwrap()
                .card_ids,
            vec![card_id]
        );
        let request = NoteId { nid: note_id }.encode_to_vec();
        let original_note = registry.call(handle, 25, 6, &request).unwrap();
        let original_decks: Vec<_> = [parent, child]
            .iter()
            .map(|did| {
                registry
                    .call(handle, 7, 8, &DeckRequest { did: *did }.encode_to_vec())
                    .unwrap()
            })
            .collect();
        let backups = root.path().join("backups");
        std::fs::create_dir(&backups).unwrap();
        let created = registry
            .call(
                handle,
                COLLECTION_SERVICE,
                2,
                &anki_proto::collection::CreateBackupRequest {
                    backup_folder: backups.to_string_lossy().into_owned(),
                    force: true,
                    wait_for_completion: true,
                }
                .encode_to_vec(),
            )
            .unwrap();
        assert!(
            anki_proto::generic::Bool::decode(created.as_slice())
                .unwrap()
                .val
        );
        let backup = std::fs::read_dir(&backups)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let staged = root.path().join("selected-backup.colpkg");
        std::fs::copy(backup, &staged).unwrap();
        std::fs::create_dir_all(root.path().join("media")).unwrap();
        let media_file = root.path().join("media/retained.txt");
        std::fs::write(&media_file, "no-media backup retains existing media").unwrap();
        registry
            .call(
                handle,
                7,
                16,
                &DeckIds { dids: vec![parent] }.encode_to_vec(),
            )
            .unwrap();
        assert!(registry.call(handle, 25, 6, &request).is_err());
        let status = registry
            .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
            .unwrap();
        assert!(!Status::decode(status.as_slice()).unwrap().undo.is_empty());
        // An older native library routes the former history ID to deck preview.
        // Reading/refreshing history still works, but applying it never reaches Undo.
        let wrong_route = registry
            .call(handle, deck_preview::SERVICE, 0, &status)
            .unwrap_err();
        let BackendFailure::Backend(error) = wrong_route else {
            panic!("wrong history route did not report a backend error");
        };
        assert_eq!(
            anki_proto::backend::BackendError::decode(error.as_slice())
                .unwrap()
                .message,
            "Invalid deck preview request"
        );
        assert_eq!(
            registry
                .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
                .unwrap(),
            status
        );
        registry.call(handle, SERVICE, 0, &status).unwrap();
        assert_eq!(
            registry.call(handle, 25, 6, &request).unwrap(),
            original_note
        );
        for (did, original) in [parent, child].iter().zip(&original_decks) {
            assert_eq!(
                registry
                    .call(handle, 7, 8, &DeckRequest { did: *did }.encode_to_vec())
                    .unwrap(),
                *original
            );
        }
        let card = registry
            .call(
                handle,
                5,
                0,
                &anki_proto::cards::CardId { cid: card_id }.encode_to_vec(),
            )
            .unwrap();
        assert_eq!(
            anki_proto::cards::Card::decode(card.as_slice())
                .unwrap()
                .deck_id,
            child
        );
        let status = registry
            .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
            .unwrap();
        assert!(!Status::decode(status.as_slice()).unwrap().redo.is_empty());
        registry.call(handle, SERVICE, 1, &status).unwrap();
        assert!(registry.call(handle, 25, 6, &request).is_err());
        assert!(registry
            .call(
                handle,
                5,
                0,
                &anki_proto::cards::CardId { cid: card_id }.encode_to_vec()
            )
            .is_err());
        assert!(registry
            .call(handle, 7, 8, &DeckRequest { did: parent }.encode_to_vec())
            .is_err());
        assert!(registry.call(handle, SERVICE, 1, &status).is_err());
        registry.call(handle, COLLECTION_SERVICE, 1, &[]).unwrap();
        registry
            .call(
                handle,
                39,
                0,
                &anki_proto::import_export::ImportCollectionPackageRequest {
                    col_path: path.to_string_lossy().into_owned(),
                    backup_path: staged.to_string_lossy().into_owned(),
                    media_folder: root.path().join("media").to_string_lossy().into_owned(),
                    media_db: root.path().join("media.db").to_string_lossy().into_owned(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        registry
            .call(
                handle,
                COLLECTION_SERVICE,
                0,
                &OpenCollectionRequest {
                    collection_path: path.to_string_lossy().into_owned(),
                    media_folder_path: root.path().join("media").to_string_lossy().into_owned(),
                    media_db_path: root.path().join("media.db").to_string_lossy().into_owned(),
                }
                .encode_to_vec(),
            )
            .unwrap();
        assert_eq!(
            registry.call(handle, 25, 6, &request).unwrap(),
            original_note
        );
        for (did, original) in [parent, child].iter().zip(&original_decks) {
            assert_eq!(
                registry
                    .call(handle, 7, 8, &DeckRequest { did: *did }.encode_to_vec())
                    .unwrap(),
                *original
            );
        }
        assert_eq!(
            registry
                .call(
                    handle,
                    5,
                    0,
                    &anki_proto::cards::CardId { cid: card_id }.encode_to_vec()
                )
                .unwrap(),
            card
        );
        assert_eq!(
            std::fs::read_to_string(media_file).unwrap(),
            "no-media backup retains existing media"
        );
        let restored_status = Status::decode(
            registry
                .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        assert!(restored_status.undo.is_empty() && restored_status.redo.is_empty());
        registry.call(handle, COLLECTION_SERVICE, 1, &[]).unwrap();
        registry.close(handle);
    }
}
