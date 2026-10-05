// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::card::CardId;
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::scheduler::answering::{CardAnswer, Rating};
use anki::timestamp::TimestampMillis;
use anki_proto::cards::Card;
use anki_proto::scheduler::bury_or_suspend_cards_request::Mode;

#[test]
fn restore_uses_original_type_and_due_without_resetting_or_touching_other_cards() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut ids = Vec::new();
    // New, intraday learning, interday learning, review, relearning and unselected review.
    for (index, (ctype, due, expected_queue)) in [
        (0, 23, 0),
        (1, 1_800_000_000, 1),
        (1, 123, 3),
        (2, 12_345, 2),
        (3, 1_800_000_000, 1),
        (2, 12_345, -1),
    ]
    .into_iter()
    .enumerate()
    {
        let mut note = nt.new_note();
        note.set_field(0, &format!("Restore fixture {index}"))
            .unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let cid = col
            .storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()[0];
        let queue = if index == 5 || index % 3 == 0 {
            -1
        } else if index % 3 == 1 {
            -2
        } else {
            -3
        };
        col.storage.db().execute_batch(&format!(
            "UPDATE cards SET type={ctype},queue={queue},due={due},ivl=17,reps=9,lapses=2,left=1001,flags=5 WHERE id={};",
            cid.0
        )).unwrap();
        let before: Card = col.storage.get_card(cid).unwrap().unwrap().into();
        ids.push((cid, before, expected_queue));
    }
    let selected: Vec<CardId> = ids[..5].iter().map(|item| item.0).collect();
    col.unbury_or_unsuspend_cards(&selected).unwrap();
    for (cid, before, expected_queue) in &ids {
        let mut after: Card = col.storage.get_card(*cid).unwrap().unwrap().into();
        assert_eq!(after.queue, *expected_queue);
        after.queue = before.queue;
        after.mtime_secs = before.mtime_secs;
        after.usn = before.usn;
        assert_eq!(
            &after, before,
            "schedule, identity and flags must remain unchanged"
        );
    }
    col.undo().unwrap();
    for (cid, before, _) in &ids {
        let after: Card = col.storage.get_card(*cid).unwrap().unwrap().into();
        assert_eq!(&after, before);
    }
}

#[test]
fn restoring_an_answered_card_keeps_real_review_history_and_learning_schedule() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Real learning restore").unwrap();
    col.add_note(&mut note, DeckId(1)).unwrap();
    let queued = col.get_next_card().unwrap().unwrap();
    let cid = queued.card.id();
    col.answer_card(&mut CardAnswer {
        card_id: cid,
        current_state: queued.states.current,
        new_state: queued.states.good,
        rating: Rating::Good,
        answered_at: TimestampMillis::now(),
        milliseconds_taken: 1234,
        custom_data: None,
        from_queue: true,
    })
    .unwrap();
    let before: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    let history = col.get_review_logs(cid).unwrap();
    assert_eq!(history.entries.len(), 1);
    col.bury_or_suspend_cards(&[cid], Mode::Suspend).unwrap();
    col.unbury_or_unsuspend_cards(&[cid]).unwrap();
    let mut after: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    after.mtime_secs = before.mtime_secs;
    after.usn = before.usn;
    assert_eq!(after, before);
    assert_eq!(col.get_review_logs(cid).unwrap(), history);
    col.undo().unwrap();
    let suspended: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    assert_eq!(suspended.queue, -1);
    assert_eq!(col.get_review_logs(cid).unwrap(), history);
}

#[test]
fn burying_a_mixed_selection_keeps_suspended_cards_suspended_and_is_undoable() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut ids = Vec::new();
    for (index, queue) in [-1, -2, 0].into_iter().enumerate() {
        let mut note = nt.new_note();
        note.set_field(0, &format!("Mixed queue fixture {index}"))
            .unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let cid = col
            .storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap()[0];
        col.storage
            .db()
            .execute_batch(&format!(
                "UPDATE cards SET queue={queue} WHERE id={};",
                cid.0
            ))
            .unwrap();
        ids.push(cid);
    }
    col.bury_or_suspend_cards(&ids, Mode::BuryUser).unwrap();
    let queues = |col: &anki::collection::Collection| {
        ids.iter()
            .map(|id| {
                let card: Card = col.storage.get_card(*id).unwrap().unwrap().into();
                card.queue
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(queues(&col), [-1, -3, -3]);
    col.undo().unwrap();
    assert_eq!(queues(&col), [-1, -2, 0]);
}
