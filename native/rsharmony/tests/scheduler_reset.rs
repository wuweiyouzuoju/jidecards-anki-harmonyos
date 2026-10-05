// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::scheduler::answering::{CardAnswer, Rating};
use anki::timestamp::TimestampMillis;
use anki_proto::cards::Card;
use anki_proto::scheduler::schedule_cards_as_new_request::Context;

#[test]
fn reset_keeps_identity_and_review_history_and_undo_redo_restores_both_options() {
    for reset_counts in [false, true] {
        let mut col = CollectionBuilder::default().build().unwrap();
        let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "Reset fixture").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let queued = col.get_next_card().unwrap().unwrap();
        let id = queued.card.id();
        let new_card: Card = col.storage.get_card(id).unwrap().unwrap().into();
        let original_position = new_card.due;
        col.answer_card(&mut CardAnswer {
            card_id: id,
            current_state: queued.states.current,
            new_state: queued.states.good,
            rating: Rating::Good,
            answered_at: TimestampMillis::now(),
            milliseconds_taken: 1000,
            custom_data: None,
            from_queue: true,
        })
        .unwrap();
        let before: Card = col.storage.get_card(id).unwrap().unwrap().into();
        let history = col.get_review_logs(id).unwrap();
        col.reschedule_cards_as_new(&[id], true, true, reset_counts, Some(Context::Browser))
            .unwrap();
        let after: Card = col.storage.get_card(id).unwrap().unwrap().into();
        assert_eq!(after.id, before.id);
        assert_eq!(after.note_id, before.note_id);
        assert_eq!(after.ctype, 0);
        assert_eq!(after.queue, 0);
        assert_eq!(after.due, original_position);
        assert_eq!(after.reps, if reset_counts { 0 } else { before.reps });
        let defaults = col.reschedule_cards_as_new_defaults(Context::Browser);
        assert!(defaults.restore_position);
        assert_eq!(defaults.reset_counts, reset_counts);
        let after_history = col.get_review_logs(id).unwrap();
        assert_eq!(after_history.entries.len(), history.entries.len() + 1);
        for entry in &history.entries {
            assert!(after_history.entries.contains(entry));
        }
        col.undo().unwrap();
        let undone: Card = col.storage.get_card(id).unwrap().unwrap().into();
        assert_eq!(undone, before);
        assert_eq!(col.get_review_logs(id).unwrap(), history);
        col.redo().unwrap();
        let redone: Card = col.storage.get_card(id).unwrap().unwrap().into();
        assert_eq!(redone, after);
        assert_eq!(col.get_review_logs(id).unwrap(), after_history);
    }
}
