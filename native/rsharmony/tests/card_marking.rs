// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::sync::http_server::{default_ip_header, SimpleServer, SyncServerConfig};
use anki_proto::cards::{Card, CardId, SetFlagRequest};
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::config::SetConfigJsonRequest;
use anki_proto::generic::{Json, String as ProtoString};
use anki_proto::notes::{Note, NoteId, UpdateNotesRequest};
use anki_proto::scheduler::{CardAnswer, GetQueuedCardsRequest, QueuedCards};
use anki_proto::search::{SearchRequest, SearchResponse};
use anki_proto::sync::{
    FullUploadOrDownloadRequest, SyncAuth, SyncCollectionRequest, SyncCollectionResponse,
    SyncLoginRequest,
};
use jidecards_core::init_anki_backend;
use prost::Message;
use serde_json::{json, Value};

fn call_result(backend: &Backend, name: &str, input: &[u8]) -> Result<Vec<u8>, Vec<u8>> {
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
    backend.run_service_method(service, method, input)
}
fn call(backend: &Backend, name: &str, input: &[u8]) -> Vec<u8> {
    call_result(backend, name, input).unwrap()
}
fn card(backend: &Backend, id: i64) -> Card {
    Card::decode(call(backend, "get_card", &CardId { cid: id }.encode_to_vec()).as_slice()).unwrap()
}
fn note(backend: &Backend, id: i64) -> Note {
    Note::decode(call(backend, "get_note", &NoteId { nid: id }.encode_to_vec()).as_slice()).unwrap()
}
fn search(backend: &Backend, text: &str) -> Vec<i64> {
    SearchResponse::decode(
        call(
            backend,
            "search_cards",
            &SearchRequest {
                search: text.into(),
                ..Default::default()
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap()
    .ids
}

fn queue(backend: &Backend) -> QueuedCards {
    QueuedCards::decode(
        call(
            backend,
            "get_queued_cards",
            &GetQueuedCardsRequest {
                fetch_limit: 1,
                intraday_learning_only: false,
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap()
}

struct SyncPeer {
    backend: Backend,
    open: OpenCollectionRequest,
}

impl SyncPeer {
    fn new(folder: &std::path::Path, marking_priority: bool) -> Self {
        std::fs::create_dir_all(folder).unwrap();
        let open = OpenCollectionRequest {
            collection_path: folder
                .join("collection.anki2")
                .to_string_lossy()
                .into_owned(),
            media_folder_path: folder
                .join("collection.media")
                .to_string_lossy()
                .into_owned(),
            media_db_path: folder.join("collection.mdb").to_string_lossy().into_owned(),
        };
        let backend = if marking_priority {
            init_anki_backend(&[]).unwrap()
        } else {
            init_backend(&[]).unwrap()
        };
        call(&backend, "open_collection", &open.encode_to_vec());
        Self { backend, open }
    }

    fn sync(&self, auth: &SyncAuth) -> i32 {
        self.sync_result(auth).unwrap()
    }

    fn sync_result(&self, auth: &SyncAuth) -> Result<i32, Vec<u8>> {
        call_result(
            &self.backend,
            "sync_collection",
            &SyncCollectionRequest {
                auth: Some(auth.clone()),
                sync_media: false,
            }
            .encode_to_vec(),
        )
        .map(|bytes| {
            SyncCollectionResponse::decode(bytes.as_slice())
                .unwrap()
                .required
        })
    }

    fn full_sync(&self, auth: &SyncAuth, upload: bool) {
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

    fn flag(&self, id: i64, flag: u32) {
        call(
            &self.backend,
            "set_flag",
            &SetFlagRequest {
                card_ids: vec![id],
                flag,
            }
            .encode_to_vec(),
        );
    }

    fn mark(&self, nid: i64, marked: bool) {
        // Same latest-note UpdateNotes operation used by both frontends.
        let mut current = note(&self.backend, nid);
        current
            .tags
            .retain(|tag| !tag.eq_ignore_ascii_case("marked"));
        if marked {
            current.tags.push("Marked".into());
        }
        call(
            &self.backend,
            "update_notes",
            &UpdateNotesRequest {
                notes: vec![current],
                skip_undo_entry: false,
            }
            .encode_to_vec(),
        );
    }

    fn labels(&self) -> Value {
        let config = Json::decode(
            call(
                &self.backend,
                "get_config_json",
                &ProtoString {
                    val: "flagLabels".into(),
                }
                .encode_to_vec(),
            )
            .as_slice(),
        )
        .unwrap();
        serde_json::from_slice(&config.json).unwrap()
    }

    fn save_labels(&self, labels: &Value, undoable: bool) {
        // AnkiDroid uses undoable=false; JideCards uses true. Both must sync.
        call(
            &self.backend,
            "set_config_json",
            &SetConfigJsonRequest {
                key: "flagLabels".into(),
                value_json: serde_json::to_vec(labels).unwrap(),
                undoable,
            }
            .encode_to_vec(),
        );
    }

    fn reopen(&self) {
        call(&self.backend, "close_collection", &[]);
        call(&self.backend, "open_collection", &self.open.encode_to_vec());
    }
}

impl Drop for SyncPeer {
    fn drop(&mut self) {
        call(&self.backend, "close_collection", &[]);
    }
}

fn exchange(writer: &SyncPeer, reader: &SyncPeer, auth: &SyncAuth) {
    // Every change must travel through HTTP incremental sync, never a DB copy.
    assert!(writer.sync(auth) <= 1);
    assert!(reader.sync(auth) <= 1);
    assert_eq!(writer.sync(auth), 0);
}

#[test]
fn marking_roundtrips_between_two_clients_over_real_full_and_incremental_sync() {
    check_marking_sync(false, false, false, false);
}

#[test]
fn offline_marking_conflicts_prefer_jidecards_when_jidecards_syncs_first() {
    check_marking_sync(true, false, false, false);
}

#[test]
fn offline_marking_conflicts_prefer_jidecards_when_reference_peer_syncs_first() {
    check_marking_sync(true, true, false, false);
}

#[test]
fn marking_priority_preserves_newer_remote_schedule_fields_and_other_tags() {
    check_marking_sync(true, true, true, false);
}

#[test]
fn two_jidecards_devices_converge_when_client_a_syncs_first() {
    check_marking_sync(true, false, false, true);
}

#[test]
fn two_jidecards_devices_converge_when_client_b_syncs_first() {
    check_marking_sync(true, true, false, true);
}

fn check_marking_sync(
    check_offline_conflicts: bool,
    droid_first: bool,
    remote_is_newer: bool,
    both_jidecards: bool,
) {
    let root = tempfile::tempdir().unwrap();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    // This standalone test executable owns the server environment. Restore it
    // immediately after construction; all data and synthetic auth stay temporary.
    assert!(std::env::var_os("SYNC_USER2").is_none());
    assert!(std::env::var_os("PASSWORDS_HASHED").is_none());
    static SERVER_ENVIRONMENT: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let environment_guard = SERVER_ENVIRONMENT.lock().unwrap();
    let old_user = std::env::var_os("SYNC_USER1");
    std::env::set_var("SYNC_USER1", "user:pass");
    let server = runtime.block_on(SimpleServer::make_server(SyncServerConfig {
        host: "127.0.0.1".parse().unwrap(),
        port: 0,
        base_folder: root.path().join("server"),
        ip_header: default_ip_header(),
    }));
    match old_user {
        Some(value) => std::env::set_var("SYNC_USER1", value),
        None => std::env::remove_var("SYNC_USER1"),
    }
    drop(environment_guard);
    let (address, server_future) = server.unwrap();
    let server_task = runtime.spawn(server_future);

    let a_folder = root.path().join("jidecards");
    std::fs::create_dir_all(&a_folder).unwrap();
    let mut col = CollectionBuilder::new(a_folder.join("collection.anki2"))
        .build()
        .unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 2)
        .unwrap();
    let mut seed = nt.new_note();
    seed.set_field(0, "Sync marking test").unwrap();
    seed.set_field(1, "Same fields on both clients").unwrap();
    seed.tags = vec!["marked::child".into(), "topic".into()];
    col.add_note(&mut seed, DeckId(1)).unwrap();
    let ids = col
        .storage
        .all_card_ids_of_note_in_template_order(seed.id)
        .unwrap();
    let (id, sibling, nid) = (ids[0].0, ids[1].0, seed.id.0);
    col.storage
        .db()
        .execute("UPDATE cards SET flags=168 WHERE id=?", [id])
        .unwrap();
    col.close(None).unwrap();

    // Production factory enables local marking policy. Reference peer and
    // HTTP server keep the default locked Core policy; no shared config opt-in.
    let a = SyncPeer::new(&a_folder, true);
    let b = SyncPeer::new(&root.path().join("peer-b"), both_jidecards);
    let auth = SyncAuth::decode(
        call(
            &a.backend,
            "sync_login",
            &SyncLoginRequest {
                username: "user".into(),
                password: "pass".into(),
                endpoint: Some(format!("http://{address}/")),
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(a.sync(&auth), 4); // Empty server: full upload required.
    a.full_sync(&auth, true);
    assert_eq!(b.sync(&auth), 3); // Empty peer: full download required.
    b.full_sync(&auth, false);
    assert_eq!(card(&a.backend, id), card(&b.backend, id));
    let mut original = card(&a.backend, id);
    let original_sibling = card(&a.backend, sibling);
    let mut fields = note(&a.backend, nid).fields;

    for (writer, reader) in [(&a, &b), (&b, &a)] {
        for flag in (1..=7).chain(std::iter::once(0)) {
            writer.flag(id, flag);
            assert_eq!(
                card(&writer.backend, id).usn,
                -1,
                "flag must remain pending sync until uploaded"
            );
            exchange(writer, reader, &auth);
            assert_eq!(card(&reader.backend, id).flags, 168 | flag);
            assert_eq!(card(&writer.backend, id), card(&reader.backend, id));
            assert!(search(&reader.backend, &format!("flag:{flag}")).contains(&id));
            assert_eq!(card(&reader.backend, sibling), original_sibling);
        }
        for marked in [true, false] {
            writer.mark(nid, marked);
            assert_eq!(note(&writer.backend, nid).usn, -1);
            exchange(writer, reader, &auth);
            assert_eq!(
                search(&reader.backend, "tag:re:^marked$").len(),
                if marked { 2 } else { 0 }
            );
            assert_eq!(note(&writer.backend, nid), note(&reader.backend, nid));
            assert_eq!(note(&reader.backend, nid).fields, fields);
            assert!(note(&reader.backend, nid)
                .tags
                .contains(&"marked::child".into()));
            assert_eq!(search(&reader.backend, "tag:marked").len(), 2);
        }
    }

    let mut labels = json!({"1":"稍后处理","7":"重点","future":{"nested":[true,7]}});
    a.save_labels(&labels, true);
    exchange(&a, &b, &auth);
    assert_eq!(b.labels(), labels);
    let mut remote_labels = b.labels();
    remote_labels["5"] = json!("Droid 粉色");
    b.save_labels(&remote_labels, false);
    exchange(&b, &a, &auth);
    assert_eq!(a.labels(), remote_labels);
    labels = a.labels();
    labels.as_object_mut().unwrap().remove("1"); // Restore default, retain other/unknown names.
    a.save_labels(&labels, true);
    call(&a.backend, "undo", &[]);
    assert_eq!(a.labels(), remote_labels);
    call(&a.backend, "redo", &[]);
    exchange(&a, &b, &auth);
    assert_eq!(b.labels(), labels);

    a.flag(id, 7);
    call(&a.backend, "undo", &[]);
    exchange(&a, &b, &auth);
    assert_eq!(card(&b.backend, id).flags, 168);
    b.mark(nid, true);
    call(&b.backend, "undo", &[]);
    exchange(&b, &a, &auth);
    assert!(search(&a.backend, "tag:re:^marked$").is_empty());

    // Unsent operations must survive reopening and remain incremental.
    a.flag(id, 6);
    a.mark(nid, true);
    a.reopen();
    exchange(&a, &b, &auth);
    assert_eq!(card(&b.backend, id).flags, 174);
    assert_eq!(search(&b.backend, "tag:re:^marked$").len(), 2);
    b.flag(id, 2);
    b.mark(nid, false);
    b.reopen();
    exchange(&b, &a, &auth);
    assert_eq!(card(&a.backend, id).flags, 170);
    assert!(search(&a.backend, "tag:re:^marked$").is_empty());

    // Failed sync cannot consume unsent changes or require the user to reapply them.
    a.flag(id, 3);
    a.mark(nid, true);
    let mut bad_auth = auth.clone();
    bad_auth.hkey = "invalid-test-key".into();
    assert!(a.sync_result(&bad_auth).is_err());
    assert_eq!(card(&a.backend, id).usn, -1);
    assert_eq!(note(&a.backend, nid).usn, -1);
    a.reopen();
    exchange(&a, &b, &auth);
    assert_eq!(card(&b.backend, id).flags, 171);
    assert_eq!(search(&b.backend, "tag:re:^marked$").len(), 2);

    if check_offline_conflicts {
        // Mixed clients prefer JideCards in either order. With two JideCards
        // devices, the second device's pending local marking wins the conflict.
        a.flag(id, 6);
        b.flag(id, 2);
        a.mark(nid, false);
        b.mark(nid, false);
        b.mark(nid, true);
        let mut a_labels = a.labels();
        a_labels["1"] = json!("JideCards offline");
        a.save_labels(&a_labels, true);
        let mut b_labels = b.labels();
        b_labels["7"] = json!("Droid offline");
        b.save_labels(&b_labels, false);
        let high_bits = if remote_is_newer {
            // Force the remote record to be strictly newer (including clock
            // skew) so the local-marker merge cannot pass by rejecting it all.
            let mut remote_note = note(&b.backend, nid);
            remote_note.fields[0] = "Droid edited field must survive".into();
            remote_note.tags.push("remote-topic".into());
            fields = remote_note.fields.clone();
            call(
                &b.backend,
                "update_notes",
                &UpdateNotesRequest {
                    notes: vec![remote_note],
                    skip_undo_entry: false,
                }
                .encode_to_vec(),
            );
            let newer = card(&a.backend, id)
                .mtime_secs
                .max(i64::from(note(&a.backend, nid).mtime_secs))
                + 3600;
            call(&b.backend, "close_collection", &[]);
            let remote = CollectionBuilder::new(&b.open.collection_path)
                .build()
                .unwrap();
            remote
                .storage
                .db()
                .execute(
                    "UPDATE cards SET mod=?, due=due+23, flags=146 WHERE id=?",
                    [newer, id],
                )
                .unwrap();
            remote
                .storage
                .db()
                .execute("UPDATE notes SET mod=? WHERE id=?", [newer, nid])
                .unwrap();
            remote.close(None).unwrap();
            call(&b.backend, "open_collection", &b.open.encode_to_vec());
            original.due += 23;
            144
        } else {
            168
        };
        a.reopen();
        b.reopen();
        let peers = if droid_first {
            [&b, &a, &b, &a, &b]
        } else {
            [&a, &b, &a, &b, &a]
        };
        for peer in peers {
            assert!(peer.sync(&auth) <= 1);
        }
        assert_eq!(
            card(&a.backend, id),
            card(&b.backend, id),
            "offline flag conflict did not converge"
        );
        let b_wins = both_jidecards && !droid_first;
        assert_eq!(
            card(&a.backend, id).flags,
            high_bits | if b_wins { 2 } else { 6 }
        );
        assert_eq!(
            card(&a.backend, id).due,
            original.due,
            "normal scheduling conflict selection must survive"
        );
        assert_eq!(note(&a.backend, nid), note(&b.backend, nid));
        assert_eq!(
            search(&a.backend, "tag:re:^marked$"),
            search(&b.backend, "tag:re:^marked$")
        );
        assert_eq!(
            search(&a.backend, "tag:re:^marked$").len(),
            if b_wins { 2 } else { 0 }
        );
        assert_eq!(note(&a.backend, nid).fields, fields);
        if remote_is_newer {
            assert!(note(&a.backend, nid).tags.contains(&"remote-topic".into()));
        }
        // Also exercise clearing a flag and adding a star, so a one-way
        // OR/always-marked merge cannot satisfy the convergence assertions.
        a.flag(id, 0);
        a.mark(nid, true);
        b.flag(id, 4);
        b.mark(nid, true);
        b.mark(nid, false);
        a.reopen();
        b.reopen();
        for peer in peers {
            assert!(peer.sync(&auth) <= 1);
        }
        assert_eq!(card(&a.backend, id), card(&b.backend, id));
        assert_eq!(
            card(&a.backend, id).flags,
            high_bits | if b_wins { 4 } else { 0 }
        );
        assert_eq!(note(&a.backend, nid), note(&b.backend, nid));
        assert_eq!(
            search(&a.backend, "tag:re:^marked$").len(),
            if b_wins { 0 } else { 2 }
        );
        assert_eq!(note(&a.backend, nid).fields, fields);
        // Once clean, either client must accept a subsequent change from its peer.
        b.flag(id, 5);
        b.mark(nid, false);
        exchange(&b, &a, &auth);
        assert_eq!(card(&a.backend, id).flags, high_bits | 5);
        assert!(search(&a.backend, "tag:re:^marked$").is_empty());
        labels = a.labels();
        assert_eq!(b.labels(), labels);
        assert_eq!(labels["future"], json!({"nested":[true,7]}));
        assert!(labels["1"] == json!("JideCards offline") || labels["7"] == json!("Droid offline"));
    }

    a.full_sync(&auth, true);
    b.full_sync(&auth, false);
    for peer in [&a, &b] {
        assert_eq!(peer.labels(), labels);
        assert_eq!(note(&peer.backend, nid).fields, fields);
        assert_eq!(card(&peer.backend, sibling), original_sibling);
        let mut schedule = card(&peer.backend, id);
        schedule.flags = original.flags;
        schedule.usn = original.usn;
        schedule.mtime_secs = original.mtime_secs;
        assert_eq!(
            schedule, original,
            "syncing markers must preserve all scheduling fields"
        );
        assert_eq!(peer.sync(&auth), 0);
    }
    drop(a);
    drop(b);
    let reopened = CollectionBuilder::new(a_folder.join("collection.anki2"))
        .build()
        .unwrap();
    let reviews: i64 = reopened
        .storage
        .db()
        .query_row("SELECT count(*) FROM revlog", [], |row| row.get(0))
        .unwrap();
    assert_eq!(reviews, 0);
    reopened.close(None).unwrap();
    server_task.abort();
    runtime.block_on(async {
        let _ = server_task.await;
    });
}

#[test]
fn marking_rpcs_preserve_schedule_and_siblings_support_exact_search_undo_and_reopen() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 2)
        .unwrap();
    let mut n = nt.new_note();
    n.set_field(0, "Marking test").unwrap();
    n.set_field(1, "Answer").unwrap();
    n.tags = vec!["marked::child".into(), "topic".into()];
    col.add_note(&mut n, DeckId(1)).unwrap();
    let ids = col
        .storage
        .all_card_ids_of_note_in_template_order(n.id)
        .unwrap();
    assert_eq!(ids.len(), 2);
    let id = ids[0].0;
    let sibling = ids[1].0;
    col.storage
        .db()
        .execute_batch(&format!("UPDATE cards SET flags=168 WHERE id={id};"))
        .unwrap();
    col.close(None).unwrap();
    let backend = init_anki_backend(&[]).unwrap();
    let open = OpenCollectionRequest {
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
    };
    call(&backend, "open_collection", &open.encode_to_vec());
    let original = card(&backend, id);
    let sibling_before = card(&backend, sibling);
    for flag in 0..=7 {
        call(
            &backend,
            "set_flag",
            &SetFlagRequest {
                card_ids: vec![id],
                flag,
            }
            .encode_to_vec(),
        );
        let current = card(&backend, id);
        assert_eq!(current.flags, 168 | flag);
        assert_eq!(current.mtime_secs, original.mtime_secs);
        let mut schedule = current.clone();
        schedule.flags = original.flags;
        schedule.usn = original.usn;
        assert_eq!(schedule, original);
        assert_eq!(card(&backend, sibling), sibling_before);
        assert!(search(&backend, &format!("flag:{flag}")).contains(&id));
    }
    assert_eq!(search(&backend, "flag:0"), vec![sibling]);
    call(&backend, "undo", &[]);
    assert_eq!(card(&backend, id).flags & 7, 6);
    call(&backend, "redo", &[]);
    assert_eq!(card(&backend, id).flags & 7, 7);
    assert!(search(&backend, "tag:re:^marked$").is_empty());
    assert_eq!(search(&backend, "tag:marked").len(), 2);
    let before = note(&backend, n.id.0);
    let mut marked = before.clone();
    marked.tags.push("marked".into());
    call(
        &backend,
        "update_notes",
        &UpdateNotesRequest {
            notes: vec![marked],
            skip_undo_entry: false,
        }
        .encode_to_vec(),
    );
    assert_eq!(search(&backend, "tag:re:^marked$").len(), 2);
    let mut unmarked = note(&backend, n.id.0);
    unmarked
        .tags
        .retain(|tag| !tag.eq_ignore_ascii_case("marked"));
    call(
        &backend,
        "update_notes",
        &UpdateNotesRequest {
            notes: vec![unmarked],
            skip_undo_entry: false,
        }
        .encode_to_vec(),
    );
    assert!(search(&backend, "tag:re:^marked$").is_empty());
    assert!(note(&backend, n.id.0)
        .tags
        .contains(&"marked::child".into()));
    call(&backend, "undo", &[]);
    assert_eq!(search(&backend, "tag:re:^marked$").len(), 2);
    assert_eq!(note(&backend, n.id.0).fields, before.fields);
    assert_eq!(card(&backend, id).flags & 7, 7);
    let labels = json!({"1":"待修改","7":"重点","future":{"nested":[true,7]}});
    call(
        &backend,
        "set_config_json",
        &SetConfigJsonRequest {
            key: "flagLabels".into(),
            value_json: serde_json::to_vec(&labels).unwrap(),
            undoable: true,
        }
        .encode_to_vec(),
    );
    call(&backend, "close_collection", &[]);
    call(&backend, "open_collection", &open.encode_to_vec());
    assert_eq!(card(&backend, id).flags, 175);
    assert_eq!(search(&backend, "tag:re:^marked$").len(), 2);
    let config = Json::decode(
        call(
            &backend,
            "get_config_json",
            &ProtoString {
                val: "flagLabels".into(),
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&config.json).unwrap(),
        labels
    );
    call(&backend, "close_collection", &[]);
    let reopened = CollectionBuilder::new(&path).build().unwrap();
    let reviews: i64 = reopened
        .storage
        .db()
        .query_row("SELECT count(*) FROM revlog", [], |row| row.get(0))
        .unwrap();
    assert_eq!(reviews, 0);
    reopened.close(None).unwrap();
}

#[test]
fn marking_preserves_active_queue_original_answer_states_and_undo() {
    let root = tempfile::tempdir().unwrap();
    let mut col = CollectionBuilder::new(root.path().join("collection.anki2"))
        .build()
        .unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut n = nt.new_note();
    n.set_field(0, "Keep original scheduling states").unwrap();
    n.set_field(1, "Answer").unwrap();
    col.add_note(&mut n, DeckId(1)).unwrap();
    col.close(None).unwrap();
    let peer = SyncPeer::new(root.path(), true);
    let before = queue(&peer.backend);
    let queued = before.cards[0].clone();
    let id = queued.card.as_ref().unwrap().id;
    let nid = queued.card.as_ref().unwrap().note_id;
    let states = queued.states.as_ref().unwrap();
    peer.flag(id, 6);
    call(&peer.backend, "undo", &[]);
    call(&peer.backend, "redo", &[]);
    let mut after = queue(&peer.backend);
    let changed = after.cards[0].card.as_mut().unwrap();
    assert_eq!(changed.flags, 6);
    changed.flags = 0;
    changed.usn = queued.card.as_ref().unwrap().usn;
    assert_eq!(
        after, before,
        "flag edits must not rebuild or invalidate the queue"
    );
    peer.mark(nid, true);
    call(
        &peer.backend,
        "answer_card",
        &CardAnswer {
            card_id: id,
            current_state: states.current.clone(),
            new_state: states.good.clone(),
            rating: 2,
            answered_at_millis: anki::timestamp::TimestampMillis::now().0,
            milliseconds_taken: 750,
        }
        .encode_to_vec(),
    );
    assert_eq!(card(&peer.backend, id).reps, 1);
    assert_eq!(card(&peer.backend, id).flags, 6);
    assert_eq!(search(&peer.backend, "tag:re:^marked$").len(), 1);
    call(&peer.backend, "undo", &[]);
    assert_eq!(card(&peer.backend, id).reps, 0);
    assert_eq!(queue(&peer.backend).cards[0].states, queued.states);
    call(&peer.backend, "undo", &[]);
    assert!(search(&peer.backend, "tag:re:^marked$").is_empty());
    call(&peer.backend, "undo", &[]);
    assert_eq!(card(&peer.backend, id).flags, 0);
    assert_eq!(queue(&peer.backend), before);
}
