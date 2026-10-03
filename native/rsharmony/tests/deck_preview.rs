// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::{Collection, CollectionBuilder};
use anki::decks::DeckId;
use jidecards_core::deck_preview::{call, Request, Response};
use prost::Message;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, PartialEq, Message)]
struct Open {
    #[prost(string, tag = "1")]
    collection: String,
    #[prost(string, tag = "2")]
    media: String,
    #[prost(string, tag = "3")]
    media_db: String,
}

#[derive(Clone, PartialEq, Message)]
struct Id {
    #[prost(int64, tag = "1")]
    id: i64,
}

#[derive(Clone, PartialEq, Message)]
struct Queued {
    #[prost(message, repeated, tag = "1")]
    cards: Vec<QueuedCard>,
}

#[derive(Clone, PartialEq, Message)]
struct QueuedCard {
    #[prost(message, optional, tag = "1")]
    card: Option<Id>,
}

struct Fixture {
    root: PathBuf,
    backend: Backend,
    new_ids: Vec<i64>,
    review: i64,
    soon: i64,
    later: i64,
    suspended: i64,
    buried: i64,
    child: i64,
    outside: i64,
    outside_deck: i64,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.backend.run_service_method(3, 1, &[]).unwrap();
        assert_eq!(self.root.parent().unwrap(), std::env::temp_dir());
        assert!(self
            .root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("jidecards-preview-test-"));
        std::fs::remove_dir_all(&self.root).unwrap();
    }
}

fn add(col: &mut Collection, deck: DeckId, text: &str) -> i64 {
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut note = nt.new_note();
    note.set_field(0, text).unwrap();
    note.set_field(1, "Answer").unwrap();
    col.add_note(&mut note, deck).unwrap();
    col.storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap()[0]
        .0
}

fn fixture() -> Fixture {
    fixture_with_rollover(false)
}

fn fixture_with_rollover(rollover: bool) -> Fixture {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let root = std::env::temp_dir().join(format!(
        "jidecards-preview-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let new_ids = (0..25)
        .map(|index| add(&mut col, DeckId(1), &format!("New {index}")))
        .collect();
    let review = add(&mut col, DeckId(1), "Review");
    let soon = add(&mut col, DeckId(1), "Learning now");
    let later = add(&mut col, DeckId(1), "Learning later today");
    let suspended = add(&mut col, DeckId(1), "Suspended");
    let buried = add(&mut col, DeckId(1), "Buried");
    let child_deck = col.get_or_create_normal_deck("Default::Child").unwrap().id;
    let child = add(&mut col, child_deck, "Child");
    let outside_deck = col.get_or_create_normal_deck("Outside").unwrap().id;
    let outside = add(&mut col, outside_deck, "Outside");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let timing = col.timing_today().unwrap();
    let later_at = (now + 3600).min(timing.next_day_at.0 - 1);
    assert!(
        later_at > now,
        "now={now} next_day={} later={later_at}",
        timing.next_day_at.0
    );
    col.storage
        .db()
        .execute_batch(&format!(
            "UPDATE cards SET type=2,queue=2,due={},ivl=10,reps=2 WHERE id={review};
         INSERT OR REPLACE INTO config (key,usn,mtime_secs,val) VALUES ('collapseTime',-1,0,x'30');
         UPDATE cards SET type=1,queue=1,due={now},left=1001,reps=1 WHERE id={soon};
         UPDATE cards SET type=1,queue=1,due={later_at},left=1001,reps=1 WHERE id={later};
         UPDATE cards SET queue=-1 WHERE id={suspended};
         UPDATE cards SET queue=-3 WHERE id={buried};
         INSERT INTO revlog VALUES ({}, {review}, -1, 3, 10, 5, 2500, 1234, 1);
         INSERT INTO revlog VALUES ({}, {review}, -1, 1, 0, 10, 2500, 2345, 1);
         INSERT INTO revlog VALUES ({}, {child}, -1, 0, 1, 0, 2500, 0, 4);",
            timing.days_elapsed as i64 - 1,
            now * 1000 - 3,
            now * 1000 - 2,
            now * 1000 - 1
        ))
        .unwrap();
    if rollover {
        col.storage
            .db()
            .execute_batch(&format!(
                "UPDATE col SET crt=crt-172800;
             UPDATE cards SET type=2,queue=-3,due=0,ivl=10,reps=2 WHERE id={buried};"
            ))
            .unwrap();
    }
    col.close(None).unwrap();
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            3,
            0,
            &Open {
                collection: path.to_string_lossy().into_owned(),
                media: root.join("collection.media").to_string_lossy().into_owned(),
                media_db: root.join("collection.mdb").to_string_lossy().into_owned(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    Fixture {
        root,
        backend,
        new_ids,
        review,
        soon,
        later,
        suspended,
        buried,
        child,
        outside,
        outside_deck: outside_deck.0,
    }
}

#[test]
fn day_rollover_restores_buried_due_cards_only_inside_the_snapshot() {
    let f = fixture_with_rollover(true);
    let before = data(&f.backend);
    assert!(preview(&f, 1, 0).contains(&f.buried));
    assert!(preview(&f, 1, 1).contains(&f.buried));
    assert_eq!(
        before,
        data(&f.backend),
        "rollover cannot unbury live cards or write live config"
    );
}

fn preview(f: &Fixture, deck_id: i64, scope: u32) -> Vec<i64> {
    Response::decode(
        call(&f.backend, 0, &Request { deck_id, scope }.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap()
    .card_ids
}

fn query(backend: &Backend, sql: &str) -> Vec<u8> {
    backend
        .run_db_command_bytes(
            format!(r#"{{"kind":"query","sql":"{sql}","args":[],"first_row_only":false}}"#)
                .as_bytes(),
        )
        .unwrap()
}

fn data(backend: &Backend) -> Vec<Vec<u8>> {
    [
        "select * from cards order by id",
        "select * from notes order by id",
        "select * from revlog order by id",
        "select * from decks order by id",
        "select * from deck_config order by id",
        "select * from col",
        "select * from config order by key",
    ]
    .iter()
    .map(|sql| query(backend, sql))
    .collect()
}

fn next_id(backend: &Backend) -> i64 {
    // GetQueuedCardsRequest.fetch_limit = 1.
    let bytes = backend.run_service_method(13, 3, &[8, 1]).unwrap();
    Queued::decode(bytes.as_slice()).unwrap().cards[0]
        .card
        .as_ref()
        .unwrap()
        .id
}

#[test]
fn four_scopes_respect_limits_due_time_history_and_subdecks_without_source_changes() {
    let f = fixture();
    let before = data(&f.backend);
    let remaining = preview(&f, 1, 0);
    assert_eq!(
        remaining.iter().filter(|id| f.new_ids.contains(id)).count(),
        20
    );
    for id in [f.review, f.soon, f.later] {
        assert!(remaining.contains(&id));
    }
    assert!(!remaining.contains(&f.outside));
    assert!(!remaining.contains(&f.suspended));
    assert!(!remaining.contains(&f.buried));
    let due = preview(&f, 1, 1);
    assert!(due.contains(&f.review) && due.contains(&f.soon));
    assert!(
        !due.contains(&f.later),
        "later: {:?}, config: {:?}",
        query(
            &f.backend,
            &format!("select due from cards where id={}", f.later)
        ),
        query(
            &f.backend,
            "select key,cast(val as text) from config where key='collapseTime'"
        )
    );
    assert!(!due.iter().any(|id| f.new_ids.contains(id)));
    assert_eq!(
        preview(&f, 1, 2),
        vec![f.review],
        "repeat answers deduplicate; manual reschedule isn't an answer"
    );
    let all = preview(&f, 1, 3);
    assert_eq!(all.len(), 31);
    assert!(all.contains(&f.child) && all.contains(&f.buried) && all.contains(&f.suspended));
    assert!(!all.contains(&f.outside));
    assert_eq!(
        before,
        data(&f.backend),
        "all scheduling, history, deck counters and metadata must remain unchanged"
    );
    assert_eq!(
        std::fs::read_dir(&f.root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with(".tmp"))
            .count(),
        0
    );
}

#[test]
fn preview_preserves_selected_deck_existing_queue_and_undo_even_when_reading_other_decks() {
    let f = fixture();
    f.backend
        .run_service_method(7, 22, &Id { id: f.outside_deck }.encode_to_vec())
        .unwrap();
    assert_eq!(next_id(&f.backend), f.outside);
    let undo = f.backend.run_service_method(3, 7, &[]).unwrap();
    let before = data(&f.backend);
    for scope in 0..4 {
        preview(&f, 1, scope);
    }
    assert_eq!(before, data(&f.backend));
    assert_eq!(undo, f.backend.run_service_method(3, 7, &[]).unwrap());
    assert_eq!(next_id(&f.backend), f.outside);
    for request in [
        Request {
            deck_id: 0,
            scope: 0,
        },
        Request {
            deck_id: 1,
            scope: 9,
        },
        Request {
            deck_id: i64::MAX,
            scope: 0,
        },
    ] {
        assert!(call(&f.backend, 0, &request.encode_to_vec()).is_err());
    }
    assert!(call(
        &f.backend,
        1,
        &Request {
            deck_id: 1,
            scope: 0
        }
        .encode_to_vec()
    )
    .is_err());
    assert!(call(&f.backend, 0, &[255]).is_err());
    assert_eq!(before, data(&f.backend));
    assert_eq!(next_id(&f.backend), f.outside);
}
