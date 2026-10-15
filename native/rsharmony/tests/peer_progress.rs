// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::Backend;
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::sync::http_server::{default_ip_header, SimpleServer, SyncServerConfig};
use anki_proto::cards::{Card, CardId};
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::config::SetConfigJsonRequest;
use anki_proto::generic::String as ProtoString;
use anki_proto::scheduler::{CardAnswer, GetQueuedCardsRequest, QueuedCards};
use anki_proto::sync::{
    FullUploadOrDownloadRequest, SyncAuth, SyncCollectionRequest, SyncCollectionResponse,
    SyncLoginRequest,
};
use prost::Message;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn call(backend: &Backend, name: &str, input: &[u8]) -> Vec<u8> {
    let baseline: Value =
        serde_json::from_str(include_str!("../../../tools/rpc-index-baseline.json")).unwrap();
    let (service, method) = baseline["services"]
        .as_object()
        .unwrap()
        .values()
        .find_map(|s| {
            s["methods"]
                .as_object()
                .unwrap()
                .iter()
                .find(|(_, n)| n.as_str() == Some(name))
                .map(|(m, _)| (s["id"].as_u64().unwrap() as u32, m.parse::<u32>().unwrap()))
        })
        .unwrap();
    backend.run_service_method(service, method, input).unwrap()
}

struct Peer {
    backend: Backend,
    root: PathBuf,
    open: OpenCollectionRequest,
}
impl Peer {
    fn new(root: &Path) -> Self {
        std::fs::create_dir_all(root).unwrap();
        let open = OpenCollectionRequest {
            collection_path: root.join("collection.anki2").to_string_lossy().into(),
            media_folder_path: root.join("collection.media").to_string_lossy().into(),
            media_db_path: root.join("collection.mdb").to_string_lossy().into(),
        };
        let backend = jidecards_core::init_anki_backend(&[]).unwrap();
        call(&backend, "open_collection", &open.encode_to_vec());
        Self {
            backend,
            root: root.into(),
            open,
        }
    }
    fn query(&self, sql: &str) -> Value {
        let bytes = self
            .backend
            .run_db_command_bytes(
                json!({"kind":"query", "sql":sql,"args":[],"first_row_only":false})
                    .to_string()
                    .as_bytes(),
            )
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
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
    fn answer(&self, easy: bool, at: i64) -> i64 {
        let queue = QueuedCards::decode(
            call(
                &self.backend,
                "get_queued_cards",
                &GetQueuedCardsRequest {
                    fetch_limit: 1,
                    intraday_learning_only: false,
                }
                .encode_to_vec(),
            )
            .as_slice(),
        )
        .unwrap();
        let item = &queue.cards[0];
        let id = item.card.as_ref().unwrap().id;
        let states = item.states.as_ref().unwrap();
        call(
            &self.backend,
            "answer_card",
            &CardAnswer {
                card_id: id,
                current_state: states.current.clone(),
                new_state: if easy {
                    states.easy.clone()
                } else {
                    states.good.clone()
                },
                rating: if easy { 3 } else { 2 },
                answered_at_millis: at,
                milliseconds_taken: 1250,
            }
            .encode_to_vec(),
        );
        id
    }
    fn progress(&self, name: &str, merge: bool) -> Result<Value, jidecards_core::BackendFailure> {
        let result = jidecards_core::peer_progress::call(
            &self.backend,
            u32::from(merge),
            &ProtoString { val: name.into() }.encode_to_vec(),
        )?;
        Ok(serde_json::from_str(&ProtoString::decode(result.as_slice()).unwrap().val).unwrap())
    }
    fn file(&self, name: &str) -> PathBuf {
        self.root
            .join(".device-progress")
            .join(format!("{name}.jsonl"))
    }
    fn reopen(&self) {
        call(&self.backend, "close_collection", &[]);
        call(&self.backend, "open_collection", &self.open.encode_to_vec());
    }
    fn sync(&self, auth: &SyncAuth) -> i32 {
        SyncCollectionResponse::decode(
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
        .unwrap()
        .required
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
}

fn seed(root: &Path) {
    std::fs::create_dir_all(root).unwrap();
    let mut col = CollectionBuilder::new(root.join("collection.anki2"))
        .build()
        .unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    for text in [
        "shared review card",
        "second review card",
        "third review card",
    ] {
        let mut note = nt.new_note();
        note.set_field(0, text).unwrap();
        note.set_field(1, "peer review history").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
    }
    col.close(None).unwrap();
}
fn peers(root: &Path) -> (Peer, Peer) {
    let a = root.join("a");
    let b = root.join("b");
    seed(&a);
    std::fs::create_dir_all(&b).unwrap();
    std::fs::copy(a.join("collection.anki2"), b.join("collection.anki2")).unwrap();
    (Peer::new(&a), Peer::new(&b))
}
fn send(a: &Peer, b: &Peer, name: &str) -> Value {
    a.progress(name, false).unwrap();
    std::fs::create_dir_all(b.root.join(".device-progress")).unwrap();
    std::fs::copy(a.file(name), b.file(name)).unwrap();
    b.progress(name, true).unwrap()
}
fn histories(peer: &Peer) -> Value {
    peer.query("select id,cid,ease,ivl,lastIvl,factor,time,type from revlog order by id")
}

#[test]
fn three_same_second_answers_keep_all_histories_and_the_latest_answer_state() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let c_root = root.path().join("c");
    std::fs::create_dir_all(&c_root).unwrap();
    call(&a.backend, "close_collection", &[]);
    std::fs::copy(
        a.root.join("collection.anki2"),
        c_root.join("collection.anki2"),
    )
    .unwrap();
    call(&a.backend, "open_collection", &a.open.encode_to_vec());
    let c = Peer::new(&c_root);
    let at = anki::timestamp::TimestampMillis::now().0;
    let id = a.answer(false, at);
    assert_eq!(b.answer(true, at + 20), id);
    assert_eq!(c.answer(false, at + 40), id);
    let expected = c.card(id);
    send(&a, &b, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    send(&b, &a, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    send(&c, &a, "cccccccccccccccccccccccccccccccc");
    send(&a, &b, "dddddddddddddddddddddddddddddddd");
    send(&b, &c, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
    assert_eq!(histories(&a), histories(&b));
    assert_eq!(histories(&a), histories(&c));
    assert_eq!(histories(&a).as_array().unwrap().len(), 3);
    assert_eq!(a.card(id).interval, expected.interval);
    assert_eq!(a.card(id).queue, expected.queue);
    assert_eq!(a.card(id), b.card(id));
    assert_eq!(a.card(id), c.card(id));
}
fn baseline(peer: &Peer) -> Value {
    peer.query("select usn,ls,scm from col")
}

#[test]
fn offline_reviews_merge_both_histories_and_schedule_without_duplicates_after_reopen() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let at = anki::timestamp::TimestampMillis::now().0;
    let id = a.answer(false, at);
    assert_eq!(b.answer(true, at + 20), id);
    let other = a.answer(true, at + 40);
    assert_ne!(other, id);
    let a_base = baseline(&a);
    let b_base = baseline(&b);
    let result = send(&a, &b, "11111111111111111111111111111111");
    assert_eq!(result["added_reviews"], 2);
    send(&b, &a, "22222222222222222222222222222222");
    assert_eq!(histories(&a), histories(&b));
    assert_eq!(histories(&a).as_array().unwrap().len(), 3);
    assert_eq!(a.card(id), b.card(id));
    assert_eq!(a.card(other), b.card(other));
    assert_eq!(baseline(&a), a_base);
    assert_eq!(baseline(&b), b_base);
    a.reopen();
    b.reopen();
    let repeat = send(&a, &b, "33333333333333333333333333333333");
    assert_eq!(repeat["added_reviews"], 0);
    assert_eq!(repeat["updated_cards"], 0);
    assert_eq!(histories(&a), histories(&b));
}

#[test]
fn truncated_conflicting_and_unrelated_snapshots_roll_back_all_changes() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let at = anki::timestamp::TimestampMillis::now().0;
    a.answer(true, at);
    let name = "44444444444444444444444444444444";
    a.progress(name, false).unwrap();
    std::fs::create_dir_all(b.root.join(".device-progress")).unwrap();
    let original = std::fs::read_to_string(a.file(name)).unwrap();
    let before = b.query("select * from cards order by id");
    let base = baseline(&b);
    let truncated = original
        .lines()
        .filter(|s| !s.contains("\"kind\":\"end\""))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    std::fs::write(b.file(name), truncated).unwrap();
    assert!(b.progress(name, true).is_err());
    assert_eq!(b.query("select * from cards order by id"), before);
    assert_eq!(baseline(&b), base);
    assert_eq!(histories(&b), json!([]));
    let mismatch = original
        .lines()
        .map(|line| {
            let mut row: Value = serde_json::from_str(line).unwrap();
            if row["kind"] == "card" {
                row["guid"] = json!("unrelated-note");
            }
            row.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    std::fs::write(b.file(name), mismatch).unwrap();
    assert!(b.progress(name, true).is_err());
    assert_eq!(histories(&b), json!([]));
    std::fs::write(b.file(name), &original).unwrap();
    b.progress(name, true).unwrap();
    let changed = original
        .lines()
        .map(|line| {
            let mut row: Value = serde_json::from_str(line).unwrap();
            if row["kind"] == "review" {
                row["review"][3] = json!(1);
            }
            row.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    let logs = histories(&b);
    std::fs::write(b.file(name), changed).unwrap();
    assert!(b.progress(name, true).is_err());
    assert_eq!(histories(&b), logs);
    assert!(b.progress("../collection.anki2", true).is_err());
}

#[test]
fn received_reviews_remain_pending_and_survive_alternating_core_cloud_sync() {
    let root = tempfile::tempdir().unwrap();
    let a_folder = root.path().join("a");
    seed(&a_folder);
    let a = Peer::new(&a_folder);
    call(
        &a.backend,
        "set_config_json",
        &SetConfigJsonRequest {
            key: "fsrs".into(),
            value_json: b"true".to_vec(),
            undoable: false,
        }
        .encode_to_vec(),
    );
    let b = Peer::new(&root.path().join("b"));
    let c = Peer::new(&root.path().join("c"));
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let old_user = std::env::var_os("SYNC_USER1");
    std::env::set_var("SYNC_USER1", "progress-test:temporary-password");
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
    let (address, future) = server.unwrap();
    let task = runtime.spawn(future);
    let auth = SyncAuth::decode(
        call(
            &a.backend,
            "sync_login",
            &SyncLoginRequest {
                username: "progress-test".into(),
                password: "temporary-password".into(),
                endpoint: Some(format!("http://{address}/")),
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(a.sync(&auth), 4);
    a.full(&auth, true);
    for peer in [&b, &c] {
        assert_eq!(peer.sync(&auth), 3);
        peer.full(&auth, false);
    }
    let at = anki::timestamp::TimestampMillis::now().0;
    let id = a.answer(false, at);
    assert_eq!(b.answer(true, at + 20), id);
    assert!(a.card(id).memory_state.is_some());
    assert!(b.card(id).memory_state.is_some());
    let baseline_a = baseline(&a);
    let baseline_b = baseline(&b);
    send(&a, &b, "55555555555555555555555555555555");
    send(&b, &a, "66666666666666666666666666666666");
    assert_eq!(baseline(&a), baseline_a);
    assert_eq!(baseline(&b), baseline_b);
    assert_eq!(
        a.query("select count(*) from revlog where usn=-1"),
        json!([[2]])
    );
    for peer in [&a, &b, &c, &a, &b] {
        assert_eq!(peer.sync(&auth), 0);
    }
    assert_eq!(histories(&a), histories(&b));
    assert_eq!(histories(&a), histories(&c));
    assert_eq!(histories(&c).as_array().unwrap().len(), 2);
    assert_eq!(a.card(id), b.card(id));
    assert_eq!(a.card(id), c.card(id));
    c.answer(true, at + 40);
    send(&c, &a, "77777777777777777777777777777777");
    send(&a, &b, "88888888888888888888888888888888");
    send(&b, &c, "99999999999999999999999999999999");
    for peer in [&b, &a, &c, &b, &a] {
        assert_eq!(peer.sync(&auth), 0);
    }
    assert_eq!(histories(&a), histories(&b));
    assert_eq!(histories(&a), histories(&c));
    assert_eq!(histories(&a).as_array().unwrap().len(), 3);
    for peer in [&a, &b, &c] {
        peer.reopen();
    }
    assert_eq!(histories(&a), histories(&c));
    task.abort();
    runtime.block_on(async {
        let _ = task.await;
    });
}
