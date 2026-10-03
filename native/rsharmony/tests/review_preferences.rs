// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki_proto::collection::OpenCollectionRequest;
use anki_proto::config::Preferences;
use anki_proto::scheduler::{GetQueuedCardsRequest, QueuedCards, SchedTimingTodayResponse};
use prost::Message;
use std::time::{SystemTime, UNIX_EPOCH};

fn read(backend: &Backend) -> Preferences {
    Preferences::decode(backend.run_service_method(9, 9, &[]).unwrap().as_slice()).unwrap()
}

fn write(backend: &Backend, prefs: &Preferences) {
    backend
        .run_service_method(9, 10, &prefs.encode_to_vec())
        .unwrap();
}

fn queue(backend: &Backend) -> QueuedCards {
    let request = GetQueuedCardsRequest {
        fetch_limit: 1,
        intraday_learning_only: false,
    };
    QueuedCards::decode(
        backend
            .run_service_method(13, 3, &request.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap()
}

fn timing(backend: &Backend) -> SchedTimingTodayResponse {
    SchedTimingTodayResponse::decode(backend.run_service_method(13, 5, &[]).unwrap().as_slice())
        .unwrap()
}

#[test]
fn preferences_roundtrip_and_drive_real_rollover_and_learning_queue() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Learning ahead preference test").unwrap();
    note.set_field(1, "Answer").unwrap();
    col.add_note(&mut note, DeckId(1)).unwrap();
    let card = col
        .storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap()[0]
        .0;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    col.storage
        .db()
        .execute_batch(&format!(
            "UPDATE cards SET type=1,queue=1,due={},left=1001,reps=1 WHERE id={card};",
            now + 120
        ))
        .unwrap();
    col.close(None).unwrap();
    let backend = init_backend(&[]).unwrap();
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
    backend
        .run_service_method(3, 0, &open.encode_to_vec())
        .unwrap();
    let original = read(&backend);
    let mut prefs = original.clone();
    prefs.scheduling.as_mut().unwrap().rollover = 0;
    prefs.scheduling.as_mut().unwrap().learn_ahead_secs = 0;
    prefs.reviewing.as_mut().unwrap().time_limit_secs = 61;
    prefs.reviewing.as_mut().unwrap().show_remaining_due_counts = false;
    prefs.reviewing.as_mut().unwrap().show_intervals_on_buttons = false;
    write(&backend, &prefs);
    assert_eq!(read(&backend), prefs);
    assert_eq!(read(&backend).editing, original.editing);
    assert_eq!(read(&backend).backups, original.backups);
    let midnight = timing(&backend);
    assert!(queue(&backend).cards.is_empty());

    prefs.scheduling.as_mut().unwrap().rollover = 4;
    prefs.scheduling.as_mut().unwrap().learn_ahead_secs = 1201;
    write(&backend, &prefs);
    let four_am = timing(&backend);
    // The next cutoff moves four hours on the same day, or twenty hours across midnight.
    assert!(matches!(
        four_am.next_day_at - midnight.next_day_at,
        14400 | -72000
    ));
    assert_eq!(queue(&backend).cards[0].card.as_ref().unwrap().id, card);

    // Rebuilding the queue after preferences change obeys the new Core cutoff.
    prefs.scheduling.as_mut().unwrap().learn_ahead_secs = 0;
    prefs.reviewing.as_mut().unwrap().time_limit_secs = 0;
    prefs.reviewing.as_mut().unwrap().show_remaining_due_counts = true;
    prefs.reviewing.as_mut().unwrap().show_intervals_on_buttons = true;
    write(&backend, &prefs);
    assert!(queue(&backend).cards.is_empty());
    backend.run_service_method(3, 1, &[]).unwrap();
    backend
        .run_service_method(3, 0, &open.encode_to_vec())
        .unwrap();
    assert_eq!(read(&backend), prefs, "Core preferences survive reopening");
    backend.run_service_method(3, 1, &[]).unwrap();
}
