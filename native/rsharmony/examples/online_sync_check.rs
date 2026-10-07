// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in AnkiWeb proof. Credentials come only from this process environment.
// Collections are always fresh. A populated server is downloaded before writes.
#[cfg(not(feature = "anki-core"))]
fn main() {
    panic!("requires anki-core");
}

#[cfg(feature = "anki-core")]
mod check {
    use anki::{
        backend::{init_backend, Backend},
        collection::CollectionBuilder,
    };
    use anki_proto::{
        cards::{Card, CardId, SetFlagRequest},
        collection::OpenCollectionRequest,
        decks::DeckIds,
        notes::{Note, NoteId, UpdateNotesRequest},
        search::{SearchRequest, SearchResponse},
        sync::{
            FullUploadOrDownloadRequest, MediaSyncStatusResponse, SyncAuth, SyncCollectionRequest,
            SyncCollectionResponse, SyncLoginRequest,
        },
    };
    use prost::Message;
    use serde_json::{json, Value};
    use std::{
        fs,
        path::Path,
        thread,
        time::{Duration, Instant},
    };

    fn call(backend: &Backend, name: &str, input: &[u8]) -> Vec<u8> {
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
                    .find(|(_, value)| value.as_str() == Some(name))
                    .map(|(method, _)| {
                        (
                            service["id"].as_u64().unwrap() as u32,
                            method.parse::<u32>().unwrap(),
                        )
                    })
            })
            .unwrap();
        backend
            .run_service_method(service, method, input)
            .unwrap_or_else(|_| panic!("AnkiWeb/Core RPC failed: {name}"))
    }
    struct Peer {
        backend: Backend,
        open: OpenCollectionRequest,
    }
    impl Peer {
        fn new(root: &Path, production: bool) -> Self {
            fs::create_dir_all(root).unwrap();
            // Resume only a previous media download. Collection identities are always fresh.
            if let Some(cache) = std::env::var_os("JIDECARDS_SYNC_MEDIA_CACHE") {
                let cache = Path::new(&cache);
                let media = root.join("collection.media");
                fs::create_dir_all(&media).unwrap();
                for entry in fs::read_dir(cache.join("collection.media")).unwrap() {
                    let entry = entry.unwrap();
                    if entry.file_type().unwrap().is_file() {
                        fs::copy(entry.path(), media.join(entry.file_name())).unwrap();
                    }
                }
                for name in ["collection.mdb", "collection.mdb-wal"] {
                    let source = cache.join(name);
                    if source.exists() {
                        fs::copy(source, root.join(name)).unwrap();
                    }
                }
            }
            let open = OpenCollectionRequest {
                collection_path: root.join("collection.anki2").to_string_lossy().into_owned(),
                media_folder_path: root.join("collection.media").to_string_lossy().into_owned(),
                media_db_path: root.join("collection.mdb").to_string_lossy().into_owned(),
            };
            let backend = if production {
                jidecards_core::init_anki_backend(&[]).unwrap()
            } else {
                init_backend(&[]).unwrap()
            };
            call(&backend, "open_collection", &open.encode_to_vec());
            Self { backend, open }
        }
        fn sync(&self, auth: &mut SyncAuth) -> SyncCollectionResponse {
            let response = SyncCollectionResponse::decode(
                call(
                    &self.backend,
                    "sync_collection",
                    &SyncCollectionRequest {
                        auth: Some(auth.clone()),
                        sync_media: false,
                    }
                    .encode_to_vec(),
                )
                .as_slice(),
            )
            .unwrap();
            if let Some(endpoint) = &response.new_endpoint {
                auth.endpoint = Some(endpoint.clone());
            }
            response
        }
        fn full(&self, auth: &SyncAuth, upload: bool) {
            call(
                &self.backend,
                "full_upload_or_download",
                &FullUploadOrDownloadRequest {
                    auth: Some(auth.clone()),
                    upload,
                    server_usn: None,
                }
                .encode_to_vec(),
            );
        }
        fn media(&self, auth: &SyncAuth) {
            call(&self.backend, "sync_media", &auth.encode_to_vec());
            let start = Instant::now();
            loop {
                let status = MediaSyncStatusResponse::decode(
                    call(&self.backend, "media_sync_status", &[]).as_slice(),
                )
                .unwrap();
                if !status.active {
                    break;
                }
                assert!(
                    start.elapsed() < Duration::from_secs(900),
                    "media sync timeout"
                );
                thread::sleep(Duration::from_millis(250));
            }
        }
        fn search(&self, query: &str) -> Vec<i64> {
            SearchResponse::decode(
                call(
                    &self.backend,
                    "search_cards",
                    &SearchRequest {
                        search: query.into(),
                        ..Default::default()
                    }
                    .encode_to_vec(),
                )
                .as_slice(),
            )
            .unwrap()
            .ids
        }
        fn card(&self, id: i64) -> Card {
            Card::decode(
                call(
                    &self.backend,
                    "get_card",
                    &CardId { cid: id }.encode_to_vec(),
                )
                .as_slice(),
            )
            .unwrap()
        }
        fn note(&self, id: i64) -> Note {
            Note::decode(
                call(
                    &self.backend,
                    "get_note",
                    &NoteId { nid: id }.encode_to_vec(),
                )
                .as_slice(),
            )
            .unwrap()
        }
        fn close(&self) {
            call(&self.backend, "close_collection", &[]);
        }
        fn reopen(&self) {
            call(&self.backend, "open_collection", &self.open.encode_to_vec());
        }
    }
    pub fn run() {
        let local = std::env::var_os("JIDECARDS_SYNC_LOCAL").is_some();
        let with_media = local || std::env::var_os("JIDECARDS_SYNC_MEDIA").is_some();
        let username = if local {
            "test".into()
        } else {
            std::env::var("JIDECARDS_SYNC_USER").expect("JIDECARDS_SYNC_USER required")
        };
        let password = if local {
            "test".into()
        } else {
            std::env::var("JIDECARDS_SYNC_PASSWORD").expect("JIDECARDS_SYNC_PASSWORD required")
        };
        fs::create_dir_all("tmp/core-online").unwrap();
        let root = tempfile::Builder::new()
            .prefix("run-")
            .tempdir_in("tmp/core-online")
            .unwrap()
            .keep();
        println!("Isolated artifacts: {}", root.display());
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        let endpoint = if local {
            let old = std::env::var_os("SYNC_USER1");
            std::env::set_var("SYNC_USER1", "test:test");
            let server = runtime.block_on(anki::sync::http_server::SimpleServer::make_server(
                anki::sync::http_server::SyncServerConfig {
                    host: "127.0.0.1".parse().unwrap(),
                    port: 0,
                    base_folder: root.join("server"),
                    ip_header: anki::sync::http_server::default_ip_header(),
                },
            ));
            match old {
                Some(value) => std::env::set_var("SYNC_USER1", value),
                None => std::env::remove_var("SYNC_USER1"),
            };
            let (address, future) = server.unwrap();
            runtime.spawn(future);
            Some(format!("http://{address}/"))
        } else {
            None
        };
        let a_root = root.join("jidecards");
        let a = Peer::new(&a_root, true);
        let mut auth = SyncAuth::decode(
            call(
                &a.backend,
                "sync_login",
                &SyncLoginRequest {
                    username,
                    password,
                    endpoint,
                }
                .encode_to_vec(),
            )
            .as_slice(),
        )
        .unwrap();
        auth.io_timeout_secs = Some(30);
        println!(
            "PASS {} login",
            if local {
                "isolated local Core server"
            } else {
                "official AnkiWeb"
            }
        );
        let initial = a.sync(&mut auth);
        println!("Initial collection requirement: {}", initial.required);
        match initial.required {
            0 | 1 => (),
            2 | 3 => a.full(&auth, false),
            4 => a.full(&auth, true), // Server explicitly reports no cards. Local is still empty.
            _ => panic!("unknown full sync requirement"),
        }
        if with_media {
            a.media(&auth);
        }
        let original = a.search("");
        println!(
            "PASS initial full/incremental sync: {} existing cards",
            original.len()
        );
        let suffix = root.file_name().unwrap().to_string_lossy();
        let tag = format!("jidecards-online-{suffix}");
        let media_name = format!("{tag}.wav");
        let wave: Vec<u8> = [
            b"RIFF".as_slice(),
            &36u32.to_le_bytes(),
            b"WAVEfmt ",
            &16u32.to_le_bytes(),
            &1u16.to_le_bytes(),
            &1u16.to_le_bytes(),
            &8000u32.to_le_bytes(),
            &16000u32.to_le_bytes(),
            &2u16.to_le_bytes(),
            &16u16.to_le_bytes(),
            b"data",
            &0u32.to_le_bytes(),
        ]
        .concat();
        a.close();
        let mut col = CollectionBuilder::new(a_root.join("collection.anki2"))
            .set_media_paths(
                a_root.join("collection.media"),
                a_root.join("collection.mdb"),
            )
            .build()
            .unwrap();
        let mut deck = anki::decks::Deck::new_normal();
        deck.name =
            anki::decks::NativeDeckName::from_human_name(format!("JideCards online {suffix}"));
        col.add_deck(&mut deck).unwrap();
        let nt = col
            .get_all_notetypes()
            .unwrap()
            .into_iter()
            .find(|nt| nt.config.original_stock_kind == 1)
            .unwrap();
        let mut note = nt.new_note();
        note.tags = vec![tag.clone()];
        note.set_field(0, format!("Synthetic 中文 😀 [sound:{media_name}]"))
            .unwrap();
        note.set_field(1, "Initial answer").unwrap();
        col.add_note(&mut note, deck.id).unwrap();
        let nid = note.id.0;
        let cid = col
            .storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()[0]
            .0;
        let deck_id = deck.id.0;
        col.close(None).unwrap();
        fs::create_dir_all(a_root.join("collection.media")).unwrap();
        fs::write(a_root.join("collection.media").join(&media_name), &wave).unwrap();
        a.reopen();
        let upload = a.sync(&mut auth);
        if upload.required == 4 && original.is_empty() {
            a.full(&auth, true);
        } else {
            assert!(
                upload.required <= 1,
                "unexpected upload requirement: {}",
                upload.required
            );
        }
        if with_media {
            a.media(&auth);
        }
        println!(
            "PASS production upload: one synthetic note{}",
            if with_media {
                " and WAV"
            } else {
                " (media skipped)"
            }
        );
        let b_root = root.join("reference-core");
        let b = Peer::new(&b_root, false);
        let initial_b = b.sync(&mut auth);
        assert!([2, 3].contains(&initial_b.required));
        b.full(&auth, false);
        if with_media {
            b.media(&auth);
        }
        assert_eq!(b.search(&format!("tag:{tag}")), vec![cid]);
        assert_eq!(b.note(nid).guid, note.guid);
        if with_media {
            assert_eq!(
                fs::read(b_root.join("collection.media").join(&media_name)).unwrap(),
                wave
            );
        }
        println!(
            "PASS reference Core full download: IDs/GUID/HTML{}",
            if with_media {
                "/media bytes"
            } else {
                " (media skipped)"
            }
        );
        let mut edited = b.note(nid);
        edited.fields[1] = "Reference answer 中文".into();
        edited.tags.push("online::roundtrip".into());
        call(
            &b.backend,
            "update_notes",
            &UpdateNotesRequest {
                notes: vec![edited.clone()],
                skip_undo_entry: false,
            }
            .encode_to_vec(),
        );
        call(
            &b.backend,
            "set_flag",
            &SetFlagRequest {
                card_ids: vec![cid],
                flag: 7,
            }
            .encode_to_vec(),
        );
        assert!(b.sync(&mut auth).required <= 1);
        assert!(a.sync(&mut auth).required <= 1);
        assert_eq!(a.note(nid).fields, edited.fields);
        assert!(a.note(nid).tags.contains(&"online::roundtrip".into()));
        assert_eq!(a.card(cid).flags & 7, 7);
        println!("PASS bidirectional incremental sync: fields/tags/flag");
        // Delete only the deck and media generated above. Pre-existing IDs remain present.
        assert_eq!(
            a.search(&format!("deck:\"JideCards online {suffix}\"")),
            vec![cid]
        );
        call(
            &a.backend,
            "remove_decks",
            &DeckIds {
                dids: vec![deck_id],
            }
            .encode_to_vec(),
        );
        fs::remove_file(a_root.join("collection.media").join(&media_name)).unwrap();
        assert!(a.sync(&mut auth).required <= 1);
        if with_media {
            a.media(&auth);
        }
        assert!(b.sync(&mut auth).required <= 1);
        if with_media {
            b.media(&auth);
        }
        assert!(b.search(&format!("tag:{tag}")).is_empty());
        assert!(!b_root.join("collection.media").join(&media_name).exists());
        let final_ids = a.search("");
        assert_eq!(final_ids, original);
        println!("PASS synchronized deletion of own fixture; existing card IDs retained");
        fs::write(root.join("report.json"), serde_json::to_vec_pretty(&json!({"status":"passed","server":if local {"isolated local Core server"} else {"official AnkiWeb"},"mediaVerified":with_media,"clients":["production Rust backend","default locked Core backend"],
            "existingCards":original.len(),"syntheticNotes":1,"cleanup":"complete","checks":["login","full download","incremental both directions","identity and fields","existing IDs preserved"],
            "notRun":["AnkiDroid Android runtime","HarmonyOS NAPI network","online cancellation and conflict matrix","AnkiWeb media when mediaVerified=false"]})).unwrap()).unwrap();
        a.close();
        b.close();
    }
}
#[cfg(feature = "anki-core")]
fn main() {
    check::run();
}
