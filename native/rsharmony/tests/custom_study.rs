// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::{Collection, CollectionBuilder};
use anki::config::BoolKey;
use anki::deckconfig::{DeckConfigId, UpdateDeckConfigsRequest};
use anki::decks::DeckId;
use anki::scheduler::answering::{CardAnswer, Rating};
use anki::timestamp::{TimestampMillis, TimestampSecs};
use anki_proto::scheduler::{custom_study_request::Value, CustomStudyRequest};

// Only fresh, synthetic collections are used; never discover or open a user's profile.
fn fixture(new_limit: u32, review_limit: u32, new_cards: usize, reviews: usize) -> Collection {
    let mut col = CollectionBuilder::default().build().unwrap();
    let deck = DeckId(1);
    let mut config = col
        .get_deck_config(DeckConfigId(1), false)
        .unwrap()
        .unwrap();
    config.inner.new_per_day = new_limit;
    config.inner.reviews_per_day = review_limit;
    col.update_deck_configs(UpdateDeckConfigsRequest {
        target_deck_id: deck,
        configs: vec![config],
        removed_config_ids: vec![],
        mode: anki_proto::deck_config::UpdateDeckConfigsMode::Normal,
        card_state_customizer: String::new(),
        limits: Default::default(),
        new_cards_ignore_review_limit: false,
        apply_all_parent_limits: false,
        fsrs: false,
        fsrs_reschedule: false,
        fsrs_health_check: false,
    })
    .unwrap();
    let notetype = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut due_ids = vec![];
    for index in 0..new_cards + reviews {
        let mut note = notetype.new_note();
        note.set_field(0, format!("Synthetic custom study {index}"))
            .unwrap();
        note.set_field(1, "Synthetic answer").unwrap();
        col.add_note(&mut note, deck).unwrap();
        if index >= new_cards {
            due_ids.push(col.storage.all_cards_of_note(note.id).unwrap()[0].id());
        }
    }
    if !due_ids.is_empty() {
        col.set_due_date(&due_ids, "0", None).unwrap();
    }
    col.set_current_deck(deck).unwrap();
    col
}

fn counts(col: &mut Collection) -> (usize, usize) {
    let tree = col.deck_tree(Some(TimestampSecs::now())).unwrap();
    let deck = tree.children.iter().find(|deck| deck.deck_id == 1).unwrap();
    let queued = col.get_queued_cards(0, false).unwrap();
    assert_eq!(deck.new_count as usize, queued.new_count);
    assert_eq!(deck.review_count as usize, queued.review_count);
    (queued.new_count, queued.review_count)
}

fn extend(col: &mut Collection, value: Value) {
    col.custom_study(CustomStudyRequest {
        deck_id: 1,
        value: Some(value),
    })
    .unwrap();
}

#[test]
fn zero_daily_new_limit_can_be_extended() {
    let mut col = fixture(0, 200, 12, 0);
    assert_eq!(counts(&mut col), (0, 0));
    assert_eq!(
        col.custom_study_defaults(DeckId(1)).unwrap().available_new,
        12
    );
    extend(&mut col, Value::NewLimitDelta(10));
    assert_eq!(counts(&mut col), (10, 0));
}

#[test]
fn exhausted_daily_new_limit_can_be_extended_after_a_real_answer() {
    let mut col = fixture(1, 200, 12, 0);
    let queued = col.get_next_card().unwrap().unwrap();
    col.answer_card(&mut CardAnswer {
        card_id: queued.card.id(),
        current_state: queued.states.current,
        new_state: queued.states.easy,
        rating: Rating::Easy,
        answered_at: TimestampMillis::now(),
        milliseconds_taken: 1000,
        custom_data: None,
        from_queue: true,
    })
    .unwrap();
    assert_eq!(counts(&mut col), (0, 0));
    extend(&mut col, Value::NewLimitDelta(10));
    assert_eq!(counts(&mut col), (10, 0));
}

#[test]
fn due_reviews_can_keep_new_count_zero_after_successful_new_limit_extension() {
    for review_limit in [0, 200] {
        let mut col = fixture(0, review_limit, 12, review_limit as usize + 20);
        assert_eq!(counts(&mut col), (0, review_limit as usize));
        extend(&mut col, Value::NewLimitDelta(10));
        assert_eq!(counts(&mut col), (0, review_limit as usize + 10));
        assert_eq!(col.custom_study_defaults(DeckId(1)).unwrap().extend_new, 10);
        // Increasing review capacity releases the existing new-card extension.
        extend(&mut col, Value::ReviewLimitDelta(20));
        assert_eq!(counts(&mut col), (10, review_limit as usize + 20));
    }
}

#[test]
fn configured_review_limit_bypass_allows_new_card_extension() {
    let mut col = fixture(0, 0, 12, 20);
    col.set_config_bool(BoolKey::NewCardsIgnoreReviewLimit, true, false)
        .unwrap();
    extend(&mut col, Value::NewLimitDelta(10));
    assert_eq!(counts(&mut col), (10, 0));
}

#[test]
fn extending_a_deck_without_new_cards_succeeds_but_keeps_new_count_zero() {
    let mut col = fixture(0, 200, 0, 3);
    assert_eq!(
        col.custom_study_defaults(DeckId(1)).unwrap().available_new,
        0
    );
    extend(&mut col, Value::NewLimitDelta(10));
    assert_eq!(counts(&mut col), (0, 3));
    assert_eq!(col.custom_study_defaults(DeckId(1)).unwrap().extend_new, 10);
}
