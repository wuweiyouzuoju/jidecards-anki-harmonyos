// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::backend::Backend;
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::sync::http_server::{default_ip_header, SimpleServer, SyncServerConfig};
use anki_proto::cards::{Card, CardId};
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::generic::String as ProtoString;
use anki_proto::scheduler::{CardAnswer, GetQueuedCardsRequest, QueuedCards};
use anki_proto::sync::{
    FullUploadOrDownloadRequest, MediaSyncStatusResponse, SyncAuth, SyncCollectionRequest,
    SyncCollectionResponse, SyncLoginRequest,
};
use prost::Message;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

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
fn token() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!("{:032x}", NEXT.fetch_add(1, Ordering::Relaxed))
}
struct Peer {
    root: PathBuf,
    backend: Backend,
    own: String,
}
impl Peer {
    fn new(root: &Path, own: u64) -> Self {
        std::fs::create_dir_all(root).unwrap();
        let backend = jidecards_core::init_anki_backend(&[]).unwrap();
        call(
            &backend,
            "open_collection",
            &OpenCollectionRequest {
                collection_path: root.join("collection.anki2").to_string_lossy().into(),
                media_folder_path: root.join("collection.media").to_string_lossy().into(),
                media_db_path: root.join("collection.mdb").to_string_lossy().into(),
            }
            .encode_to_vec(),
        );
        Self {
            root: root.into(),
            backend,
            own: format!("{own:032x}"),
        }
    }
    fn query(&self, sql: &str) -> Value {
        self.query_args(sql, &[])
    }
    fn query_args(&self, sql: &str, args: &[Value]) -> Value {
        serde_json::from_slice(
            &self
                .backend
                .run_db_command_bytes(
                    json!({"kind":"query","sql":sql,"args":args,"first_row_only":false})
                        .to_string()
                        .as_bytes(),
                )
                .unwrap(),
        )
        .unwrap()
    }
    fn rpc(&self, method: u32, mut value: Value) -> Result<Value, String> {
        value["own"] = json!(self.own);
        let result = jidecards_core::peer_collection::call(
            &self.backend,
            method,
            &ProtoString {
                val: value.to_string(),
            }
            .encode_to_vec(),
        )
        .map_err(|err| match err {
            jidecards_core::BackendFailure::Backend(bytes) => {
                let error = anki_proto::backend::BackendError::decode(bytes.as_slice()).unwrap();
                format!("{}: {}", error.message, error.context)
            }
            err => format!("{err:?}"),
        })?;
        Ok(serde_json::from_str(&ProtoString::decode(result.as_slice()).unwrap().val).unwrap())
    }
    fn file(&self, token: &str) -> PathBuf {
        self.root
            .join(".device-collection")
            .join(format!("{token}.bin"))
    }
    fn capture(&self) -> String {
        let t = token();
        self.rpc(0, json!({"token":t})).unwrap();
        t
    }
    fn edit(&self, action: impl FnOnce(&mut anki::collection::Collection)) {
        call(&self.backend, "close_collection", &[]);
        let mut col = CollectionBuilder::new(self.root.join("collection.anki2"))
            .build()
            .unwrap();
        action(&mut col);
        col.close(None).unwrap();
        call(
            &self.backend,
            "open_collection",
            &OpenCollectionRequest {
                collection_path: self.root.join("collection.anki2").to_string_lossy().into(),
                media_folder_path: self.root.join("collection.media").to_string_lossy().into(),
                media_db_path: self.root.join("collection.mdb").to_string_lossy().into(),
            }
            .encode_to_vec(),
        );
    }
    fn receive(&self, source: &Peer, from: &str) -> String {
        let t = token();
        self.rpc(2, json!({"token":t})).unwrap();
        std::fs::copy(source.file(from), self.file(&t)).unwrap();
        t
    }
    fn media(&self, name: &str, bytes: &[u8]) {
        std::fs::create_dir_all(self.root.join("collection.media")).unwrap();
        std::fs::write(self.root.join("collection.media").join(name), bytes).unwrap();
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
                milliseconds_taken: 1000,
            }
            .encode_to_vec(),
        );
        id
    }
    fn cloud(&self, auth: &SyncAuth) -> i32 {
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
    fn cloud_media(&self, auth: &SyncAuth) {
        call(&self.backend, "sync_media", &auth.encode_to_vec());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        loop {
            let status = MediaSyncStatusResponse::decode(
                call(&self.backend, "media_sync_status", &[]).as_slice(),
            )
            .unwrap();
            if !status.active {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "local media sync timed out"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}
fn peers(root: &Path) -> (Peer, Peer) {
    let a = root.join("a");
    let b = root.join("b");
    std::fs::create_dir_all(&a).unwrap();
    std::fs::create_dir_all(&b).unwrap();
    let mut col = CollectionBuilder::new(a.join("collection.anki2"))
        .build()
        .unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    for front in ["first", "second", "third"] {
        let mut note = nt.new_note();
        note.set_field(0, front).unwrap();
        note.set_field(1, "back").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
    }
    col.close(None).unwrap();
    std::fs::copy(a.join("collection.anki2"), b.join("collection.anki2")).unwrap();
    (Peer::new(&a, 10), Peer::new(&b, 20))
}
fn payload(sender: &Peer, receiver: &Peer, source: &str, remote: &str, local: &str) -> String {
    let wanted = token();
    receiver
        .rpc(3, json!({"token":remote,"local":local,"out":wanted}))
        .unwrap();
    let requested = sender.receive(receiver, &wanted);
    let packed = token();
    sender
        .rpc(4, json!({"token":requested,"local":source,"out":packed}))
        .unwrap();
    receiver.receive(sender, &packed)
}
fn sync(a: &Peer, b: &Peer, mode: &str) -> (Value, Value) {
    let left = a.capture();
    let right = b.capture();
    let incoming = b.receive(a, &left);
    let data = payload(a, b, &left, &incoming, &right);
    let remote_mode = if mode == "push" {
        "replace"
    } else if mode == "pull" {
        "media"
    } else {
        "merge"
    };
    let rb = b
        .rpc(
            1,
            json!({"token":incoming,"payload":data,"mode":remote_mode}),
        )
        .unwrap();
    let merged = b.capture();
    let incoming = a.receive(b, &merged);
    let data = payload(b, a, &merged, &incoming, &left);
    let ra = a.rpc(1, json!({"token":incoming,"payload":data,"mode":if mode == "pull" {"replace"} else {"final"}})).unwrap();
    b.rpc(5, json!({"token":merged})).unwrap();
    (ra, rb)
}

#[test]
fn public_core_api_merges_content_flags_and_deletions_without_advancing_cloud_baseline() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    let stamps_a = a.query("select usn,ls,scm from col");
    let stamps_b = b.query("select usn,ls,scm from col");
    let id = a.query("select id from notes order by id limit 1")[0][0]
        .as_i64()
        .unwrap();
    a.query(&format!("update notes set flds='changed front'||char(31)||'changed back',mod=mod+3,usn=-1 where id={id}"));
    b.query("update cards set flags=3,mod=mod+4,usn=-1 where id=(select max(id) from cards)");
    let deleted = a.query("select min(id) from cards")[0][0].as_i64().unwrap();
    a.query(&format!("delete from cards where id={deleted}"));
    sync(&a, &b, "merge");
    sync(&a, &b, "merge");
    assert_eq!(
        a.query("select id,flds,tags from notes order by id"),
        b.query("select id,flds,tags from notes order by id")
    );
    assert_eq!(
        a.query("select id,flags from cards order by id"),
        b.query("select id,flags from cards order by id")
    );
    assert_eq!(
        b.query(&format!("select count(*) from cards where id={deleted}")),
        json!([[0]])
    );
    assert_eq!(a.query("select usn,ls,scm from col"), stamps_a);
    assert_eq!(b.query("select usn,ls,scm from col"), stamps_b);
    assert_eq!(
        b.query(&format!("select usn from notes where id={id}")),
        json!([[-1]])
    );
    let result = sync(&a, &b, "merge");
    assert_eq!(result.0["updated_objects"], 0);
    assert_eq!(result.1["updated_objects"], 0);
}

#[test]
fn media_transfers_changed_files_and_retains_deletion_history_after_cloud_acknowledgement() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    a.media("图像.png", b"first image");
    b.media("sound.mp3", b"first audio");
    sync(&a, &b, "merge");
    assert_eq!(
        std::fs::read(a.root.join("collection.media/sound.mp3")).unwrap(),
        b"first audio"
    );
    assert_eq!(
        std::fs::read(b.root.join("collection.media/图像.png")).unwrap(),
        b"first image"
    );
    a.media("图像.png", b"replacement image");
    std::fs::remove_file(b.root.join("collection.media/sound.mp3")).unwrap();
    let (_, result) = sync(&a, &b, "merge");
    assert_eq!(result["updated_media"], 1);
    assert_eq!(
        std::fs::read(b.root.join("collection.media/图像.png")).unwrap(),
        b"replacement image"
    );
    assert!(!a.root.join("collection.media/sound.mp3").exists());
    let db = rusqlite::Connection::open(b.root.join("collection.mdb")).unwrap();
    let dirty: i64 = db
        .query_row(
            "select dirty from media where fname='图像.png'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(dirty, 1);
    drop(db);
    sync(&b, &a, "merge");
    assert!(!a.root.join("collection.media/sound.mp3").exists());
}

#[test]
fn schema_mismatch_rejects_without_writes_and_explicit_replace_creates_a_backup() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    a.query("update col set scm=scm+100");
    let before = b.query("select * from notes order by id");
    let source = a.capture();
    let remote = b.receive(&a, &source);
    let local = b.capture();
    let data = payload(&a, &b, &source, &remote, &local);
    let error = b
        .rpc(1, json!({"token":remote,"payload":data,"mode":"merge"}))
        .unwrap_err();
    assert!(error.contains("device_collection_full_required"), "{error}");
    assert_eq!(b.query("select * from notes order by id"), before);
    sync(&a, &b, "push");
    assert!(std::fs::read_dir(b.root.join(".device-collection/backups"))
        .unwrap()
        .next()
        .is_some());
    assert!(std::fs::read_dir(b.root.join("backups"))
        .unwrap()
        .any(|entry| entry
            .unwrap()
            .path()
            .extension()
            .is_some_and(|ext| ext == "colpkg")));
    assert_eq!(b.query("select ls from col"), json!([[0]]));
    assert_eq!(
        b.query("select id,flds from notes order by id"),
        a.query("select id,flds from notes order by id")
    );
}

#[test]
fn corrupt_media_packet_never_starts_collection_writes_and_backend_is_reopened() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    a.media("photo.png", b"verified image");
    let source = a.capture();
    let local = b.capture();
    let remote = b.receive(&a, &source);
    let data = payload(&a, &b, &source, &remote, &local);
    let mut bytes = std::fs::read(b.file(&data)).unwrap();
    *bytes.last_mut().unwrap() ^= 1;
    std::fs::write(b.file(&data), bytes).unwrap();
    let before = b.query("select * from notes order by id");
    assert!(b
        .rpc(1, json!({"token":remote,"payload":data,"mode":"merge"}))
        .is_err());
    assert_eq!(b.query("select * from notes order by id"), before);
    assert!(!b.root.join("collection.media/photo.png").exists());
}

#[test]
fn full_peer_sync_preserves_same_second_reviews_and_alternates_with_standard_cloud_sync() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let c = Peer::new(&root.path().join("c"), 30);
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    let old = std::env::var_os("SYNC_USER1");
    std::env::set_var("SYNC_USER1", "collection-test:password");
    let server = runtime.block_on(SimpleServer::make_server(SyncServerConfig {
        host: "127.0.0.1".parse().unwrap(),
        port: 0,
        base_folder: root.path().join("server"),
        ip_header: default_ip_header(),
    }));
    match old {
        Some(value) => std::env::set_var("SYNC_USER1", value),
        None => std::env::remove_var("SYNC_USER1"),
    };
    let (address, future) = server.unwrap();
    let task = runtime.spawn(future);
    let auth = SyncAuth::decode(
        call(
            &a.backend,
            "sync_login",
            &SyncLoginRequest {
                username: "collection-test".into(),
                password: "password".into(),
                endpoint: Some(format!("http://{address}/")),
            }
            .encode_to_vec(),
        )
        .as_slice(),
    )
    .unwrap();
    assert_eq!(a.cloud(&auth), 4);
    a.full(&auth, true);
    for peer in [&b, &c] {
        peer.full(&auth, false);
    }
    sync(&a, &b, "merge");
    sync(&a, &c, "merge");
    let at = anki::timestamp::TimestampMillis::now().0;
    let id = a.answer(false, at);
    assert_eq!(b.answer(true, at + 20), id);
    let expected = b.card(id);
    sync(&a, &b, "merge");
    assert_eq!(a.card(id).interval, expected.interval);
    assert_eq!(a.card(id).due, expected.due);
    assert_eq!(a.query("select count(*) from revlog"), json!([[2]]));
    let note = a.query("select min(id) from notes")[0][0].as_i64().unwrap();
    a.query(&format!(
        "update notes set flds='peer content'||char(31)||'back',mod=mod+5,usn=-1 where id={note}"
    ));
    sync(&a, &b, "merge");
    for peer in [&a, &b, &c, &a, &b] {
        assert_eq!(peer.cloud(&auth), 0);
    }
    assert_eq!(
        a.query("select id,flds from notes order by id"),
        c.query("select id,flds from notes order by id")
    );
    assert_eq!(
        a.query("select id,cid,ease from revlog order by id"),
        c.query("select id,cid,ease from revlog order by id")
    );
    sync(&c, &a, "merge");
    sync(&a, &b, "merge");
    for peer in [&c, &b, &a] {
        assert_eq!(peer.cloud(&auth), 0);
    }
    assert_eq!(a.card(id), b.card(id));
    assert_eq!(a.card(id), c.card(id));
    a.media("cloud-peer.png", b"first image");
    sync(&a, &b, "merge");
    b.cloud_media(&auth);
    c.cloud_media(&auth);
    a.cloud_media(&auth);
    assert_eq!(
        std::fs::read(c.root.join("collection.media/cloud-peer.png")).unwrap(),
        b"first image"
    );
    a.media("cloud-peer.png", b"changed image");
    sync(&a, &b, "merge");
    b.cloud_media(&auth);
    c.cloud_media(&auth);
    a.cloud_media(&auth);
    assert_eq!(
        std::fs::read(c.root.join("collection.media/cloud-peer.png")).unwrap(),
        b"changed image"
    );
    std::fs::remove_file(a.root.join("collection.media/cloud-peer.png")).unwrap();
    sync(&a, &b, "merge");
    b.cloud_media(&auth);
    c.cloud_media(&auth);
    a.cloud_media(&auth);
    assert!(!c.root.join("collection.media/cloud-peer.png").exists());
    sync(&c, &a, "merge");
    sync(&b, &c, "merge");
    for peer in [&a, &b, &c] {
        assert!(!peer.root.join("collection.media/cloud-peer.png").exists());
    }
    task.abort();
    runtime.block_on(async {
        let _ = task.await;
    });
}

#[test]
fn third_peer_cannot_resurrect_deleted_records_after_graves_are_acknowledged() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    call(&a.backend, "close_collection", &[]);
    let croot = root.path().join("c");
    std::fs::create_dir_all(&croot).unwrap();
    std::fs::copy(
        a.root.join("collection.anki2"),
        croot.join("collection.anki2"),
    )
    .unwrap();
    call(
        &a.backend,
        "open_collection",
        &OpenCollectionRequest {
            collection_path: a.root.join("collection.anki2").to_string_lossy().into(),
            media_folder_path: a.root.join("collection.media").to_string_lossy().into(),
            media_db_path: a.root.join("collection.mdb").to_string_lossy().into(),
        }
        .encode_to_vec(),
    );
    let c = Peer::new(&croot, 30);
    sync(&a, &b, "merge");
    sync(&a, &c, "merge");
    let id = a.query("select min(id) from cards")[0][0].as_i64().unwrap();
    a.query(&format!("delete from cards where id={id}"));
    sync(&a, &b, "merge");
    a.query("delete from graves");
    b.query("delete from graves");
    sync(&b, &c, "merge");
    sync(&c, &a, "merge");
    for peer in [&a, &b, &c] {
        assert_eq!(
            peer.query(&format!("select count(*) from cards where id={id}")),
            json!([[0]])
        );
    }
}

#[test]
fn interrupted_media_commit_replays_on_recovery_without_collection_changes() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    a.media("recovered.png", b"recovery bytes");
    let source = a.capture();
    let snapshot: Value = serde_json::from_slice(&std::fs::read(a.file(&source)).unwrap()).unwrap();
    let record = &snapshot["media"]["recovered.png"];
    let hash = record["version"]["hash"].as_str().unwrap();
    let folder = b.root.join(".device-collection");
    std::fs::create_dir_all(folder.join("blobs")).unwrap();
    std::fs::write(folder.join("blobs").join(hash), b"recovery bytes").unwrap();
    std::fs::write(folder.join("media-commit.json"),json!({"entries":{"recovered.png":record},"changes":["recovered.png"],"clock":record["version"]["clock"]}).to_string()).unwrap();
    let before = b.query("select * from notes order by id");
    jidecards_core::peer_collection::recover(&b.backend).unwrap();
    assert_eq!(
        std::fs::read(b.root.join("collection.media/recovered.png")).unwrap(),
        b"recovery bytes"
    );
    assert!(!folder.join("media-commit.json").exists());
    assert_eq!(b.query("select * from notes order by id"), before);
    jidecards_core::peer_collection::recover(&b.backend).unwrap();
}

#[test]
fn new_decks_notetypes_templates_and_notes_are_created_through_core_merge() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    call(&a.backend, "close_collection", &[]);
    let mut col = CollectionBuilder::new(a.root.join("collection.anki2"))
        .build()
        .unwrap();
    let deck = col.get_or_create_normal_deck("New::媒体牌组").unwrap().id;
    let mut nt = (*col.get_notetype_by_name("Basic").unwrap().unwrap()).clone();
    nt.id = Default::default();
    nt.name = "Peer template".into();
    nt.templates[0].config.q_format = "<b>{{Front}}</b>".into();
    nt.config.css.push_str("\n.peer {color: red;}");
    col.add_notetype(&mut nt, false).unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "新笔记 <img src=\"new.png\">").unwrap();
    note.set_field(1, "[sound:new.mp3]").unwrap();
    note.tags = vec!["Peer::Tag".into()];
    col.add_note(&mut note, deck).unwrap();
    col.close(None).unwrap();
    call(
        &a.backend,
        "open_collection",
        &OpenCollectionRequest {
            collection_path: a.root.join("collection.anki2").to_string_lossy().into(),
            media_folder_path: a.root.join("collection.media").to_string_lossy().into(),
            media_db_path: a.root.join("collection.mdb").to_string_lossy().into(),
        }
        .encode_to_vec(),
    );
    a.media("new.png", b"image");
    a.media("new.mp3", b"audio");
    sync(&a, &b, "merge");
    assert_eq!(
        a.query("select id,flds,tags from notes order by id"),
        b.query("select id,flds,tags from notes order by id")
    );
    assert_eq!(
        a.query("select id,name from decks order by id"),
        b.query("select id,name from decks order by id")
    );
    assert_eq!(
        a.query("select id,name from notetypes order by id"),
        b.query("select id,name from notetypes order by id")
    );
    assert_eq!(
        a.query("select ntid,ord,config from templates order by ntid,ord"),
        b.query("select ntid,ord,config from templates order by ntid,ord")
    );
    assert_eq!(
        a.query("select id,nid,did,ord from cards order by id"),
        b.query("select id,nid,did,ord from cards order by id")
    );
    assert_eq!(
        std::fs::read(b.root.join("collection.media/new.png")).unwrap(),
        b"image"
    );
}

#[test]
fn audit_delete_and_concurrent_review_do_not_resurrect_or_block_the_collection() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    for _ in 0..5 {
        b.query(
            "update notes set flds=flds||'x',mod=mod+1,usn=-1 where id=(select max(id) from notes)",
        );
        b.capture();
    }
    let cid = b.answer(true, anki::timestamp::TimestampMillis::now().0);
    let nid = a.query(&format!("select nid from cards where id={cid}"))[0][0]
        .as_i64()
        .unwrap();
    a.query(&format!("delete from cards where nid={nid}"));
    a.query(&format!("delete from notes where id={nid}"));
    sync(&a, &b, "merge");
    for peer in [&a, &b] {
        assert_eq!(
            peer.query(&format!("select count(*) from notes where id={nid}")),
            json!([[0]])
        );
        assert_eq!(
            peer.query(&format!("select count(*) from cards where nid={nid}")),
            json!([[0]])
        );
    }
}

#[test]
fn audit_later_manual_suspend_and_flag_survive_an_earlier_remote_review() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    let at = anki::timestamp::TimestampMillis::now().0;
    let cid = a.answer(false, at);
    assert_eq!(b.answer(true, at + 20), cid);
    a.query(&format!(
        "update cards set queue=-1,flags=6,mod=mod+30,usn=-1 where id={cid}"
    ));
    sync(&a, &b, "merge");
    for peer in [&a, &b] {
        assert_eq!(
            peer.query(&format!("select queue,flags from cards where id={cid}")),
            json!([[-1, 6]])
        );
    }
    assert_eq!(a.query("select count(*) from revlog"), json!([[2]]));
}

#[test]
fn audit_card_id_collision_with_a_different_note_is_rejected_before_writes() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    b.query("update cards set nid=(select max(id) from notes),mod=mod+5,usn=-1 where id=(select min(id) from cards)");
    let left = a.capture();
    let right = b.capture();
    let incoming = a.receive(&b, &right);
    let data = payload(&b, &a, &right, &incoming, &left);
    let before = a.query("select * from cards order by id");
    let result = a.rpc(1, json!({"token":incoming,"payload":data,"mode":"merge"}));
    assert!(
        result.is_err(),
        "a reused card ID must not silently change note identity"
    );
    assert!(result
        .unwrap_err()
        .contains("device_collection_record_conflict"));
    assert_eq!(a.query("select * from cards order by id"), before);
}

#[test]
fn audit_unconfirmed_media_deletion_preserves_the_other_devices_complete_file() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    a.media("not-synced.png", b"partial local copy");
    b.media("not-synced.png", b"complete remote copy");
    a.capture(); // An export or an interrupted first transfer is not a completed media sync.
    std::fs::remove_file(a.root.join("collection.media/not-synced.png")).unwrap();
    sync(&a, &b, "merge");
    for peer in [&a, &b] {
        assert_eq!(
            std::fs::read(peer.root.join("collection.media/not-synced.png")).unwrap(),
            b"complete remote copy"
        );
    }
}

#[test]
fn audit_committed_collection_recovers_its_media_after_a_ledger_disk_failure() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    a.media("durable.png", b"durable received media");
    a.query("update notes set flds='durable edit'||char(31)||'back',mod=mod+5,usn=-1 where id=(select min(id) from notes)");
    let source = a.capture();
    let local = b.capture();
    let incoming = b.receive(&a, &source);
    let data = payload(&a, &b, &source, &incoming, &local);
    let obstruction = b.root.join(".device-collection/collection-state.pending");
    std::fs::create_dir(&obstruction).unwrap();
    assert!(b
        .rpc(1, json!({"token":incoming,"payload":data,"mode":"merge"}))
        .is_err());
    assert!(b
        .root
        .join(".device-collection/collection-commit.json")
        .exists());
    assert!(
        b.rpc(0, json!({"token":token()})).is_err(),
        "pending recovery blocks subsequent peer work"
    );
    std::fs::remove_dir(&obstruction).unwrap();
    jidecards_core::peer_collection::recover(&b.backend).unwrap();
    let updated = b.query("select count(*) from notes where flds like 'durable edit%'")[0][0]
        .as_i64()
        .unwrap();
    if updated == 1 {
        assert_eq!(
            std::fs::read(b.root.join("collection.media/durable.png")).unwrap(),
            b"durable received media"
        );
    } else {
        assert!(
            !b.root.join("collection.media/durable.png").exists(),
            "a rolled back collection must not apply staged media"
        );
    }
}

#[test]
fn audit_restoring_deleted_identities_requires_direction_and_explicit_replace_converges() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    sync(&a, &b, "merge");
    let restored = a.query("select * from cards order by id limit 1")[0].clone();
    let cid = restored[0].as_i64().unwrap();
    a.query(&format!("delete from cards where id={cid}"));
    sync(&a, &b, "merge");
    // Restore one real stored row as a local backup/undo would, keeping Core schema/creation stamps.
    a.query_args(
        "insert into cards values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        restored.as_array().unwrap(),
    );
    a.query(&format!("delete from graves where oid={cid}"));
    let source = a.capture();
    let local = b.capture();
    let remote = b.receive(&a, &source);
    let before = b.query("select * from cards order by id");
    assert!(b
        .rpc(
            3,
            json!({"token":remote,"local":local,"out":token(),"mode":"merge"})
        )
        .unwrap_err()
        .contains("device_collection_full_required"));
    assert!(b
        .rpc(1, json!({"token":remote,"payload":token(),"mode":"merge"}))
        .unwrap_err()
        .contains("device_collection_full_required"));
    assert_eq!(b.query("select * from cards order by id"), before);
    sync(&b, &a, "pull");
    sync(&a, &b, "merge");
    for peer in [&a, &b] {
        assert_eq!(peer.query("select count(*) from cards"), json!([[3]]));
    }
}

#[test]
fn audit_filtered_state_is_preserved_and_missing_original_decks_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let mut filtered_id = 0;
    a.edit(|col| {
        let mut filtered = anki::decks::Deck::new_filtered();
        filtered.name = anki::decks::NativeDeckName::from_human_name("Peer filtered");
        col.add_deck(&mut filtered).unwrap();
        filtered_id = filtered.id.0;
    });
    a.query(&format!("update cards set did={filtered_id},odid=1,odue=42,due=-1000,queue=2,type=2,mod=mod+3,usn=-1 where id=(select min(id) from cards)"));
    sync(&a, &b, "merge");
    let cid = a.query("select min(id) from cards")[0][0].as_i64().unwrap();
    assert_eq!(
        a.query(&format!(
            "select did,odid,odue,due,queue,type from cards where id={cid}"
        )),
        b.query(&format!(
            "select did,odid,odue,due,queue,type from cards where id={cid}"
        ))
    );
    a.query(&format!(
        "update cards set odid=9223372036854775,mod=mod+10,usn=-1 where id={cid}"
    ));
    let source = a.capture();
    let local = b.capture();
    let remote = b.receive(&a, &source);
    let data = payload(&a, &b, &source, &remote, &local);
    let before = b.query("select * from cards order by id");
    assert!(b
        .rpc(1, json!({"token":remote,"payload":data,"mode":"merge"}))
        .unwrap_err()
        .contains("device_collection_filtered"));
    assert_eq!(b.query("select * from cards order by id"), before);
}

#[test]
fn audit_malformed_metadata_is_rejected_before_collection_writes() {
    let root = tempfile::tempdir().unwrap();
    let (a, b) = peers(root.path());
    let source = a.capture();
    let local = b.capture();
    let remote = b.receive(&a, &source);
    let data = payload(&a, &b, &source, &remote, &local);
    let snapshot: Value = serde_json::from_slice(&std::fs::read(a.file(&source)).unwrap()).unwrap();
    let card = snapshot["objects"]
        .as_object()
        .unwrap()
        .keys()
        .find(|k| k.starts_with("cards:"))
        .unwrap()
        .clone();
    let before = b.query("select * from cards order by id");
    for kind in 0..5 {
        let mut invalid = snapshot.clone();
        match kind {
            0 => {
                invalid["objects"]
                    .as_object_mut()
                    .unwrap()
                    .remove("config:0");
            }
            1 => {
                invalid["objects"]
                    .as_object_mut()
                    .unwrap()
                    .remove("decks:1");
            }
            2 => {
                invalid["objects"][&card]["value"] = json!({"id":1});
            }
            3 => {
                invalid["objects"][&card]["time"] = json!(0);
            }
            _ => {
                let object = invalid["objects"]
                    .as_object_mut()
                    .unwrap()
                    .remove(&card)
                    .unwrap();
                invalid["objects"][card.replace("cards:", "cards:0")] = object;
            }
        }
        std::fs::write(b.file(&remote), invalid.to_string()).unwrap();
        assert!(
            b.rpc(1, json!({"token":remote,"payload":data,"mode":"replace"}))
                .unwrap_err()
                .contains("device_collection_invalid"),
            "malformed case {kind}"
        );
        assert_eq!(b.query("select * from cards order by id"), before);
    }
}
