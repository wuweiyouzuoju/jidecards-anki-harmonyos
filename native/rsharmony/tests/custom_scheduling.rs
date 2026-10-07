// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::{collection::CollectionBuilder, decks::DeckId, scheduler::answering::CardAnswer};
use anki_proto::scheduler::{
    queued_cards::QueuedCard, CardAnswer as ProtoAnswer, SchedulingStates,
};
use jidecards_core::custom_scheduling::{call, Request};
use prost::Message;
use serde_json::{json, Value};

#[derive(Clone, PartialEq, Message)]
struct Text {
    #[prost(string, tag = "1")]
    value: String,
}

#[test]
fn custom_review_is_saved_by_locked_core_and_undo_restores_interval_and_custom_data() {
    for filtered in [false, true] {
        let mut col = CollectionBuilder::default().build().unwrap();
        let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "Custom scheduling fixture").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let id = col.storage.all_cards_of_note(note.id).unwrap()[0].id();
        col.set_due_date(&[id], "0", None).unwrap();
        let original: anki_proto::cards::Card = col.storage.get_card(id).unwrap().unwrap().into();
        if filtered {
            let mut deck = col.get_or_create_filtered_deck(DeckId(0)).unwrap();
            deck.human_name = "Custom filtered fixture".into();
            deck.config.search_terms[0].search = "".into();
            let did = col.add_or_update_filtered_deck(deck).unwrap().output;
            col.set_current_deck(did).unwrap();
        }
        let queued: QueuedCard = col.get_next_card().unwrap().unwrap().into();
        let mut request = Request {
            states: queued.states.unwrap().encode_to_vec(),
            context: queued.context.unwrap().encode_to_vec(),
            custom_data: original.custom_data.clone(),
            result_json: String::new(),
        };
        let bytes = call(0, &request.encode_to_vec()).unwrap();
        let input: Value =
            serde_json::from_str(&Text::decode(bytes.as_slice()).unwrap().value).unwrap();
        let mut states = input["states"].clone();
        let diagnostic = states.to_string();
        if filtered {
            assert!(states["current"]["filtered"].is_object());
        }
        let review = if states["good"]["normal"].is_object() {
            &mut states["good"]["normal"]["review"]
        } else {
            &mut states["good"]["filtered"]["rescheduling"]["originalState"]["review"]
        };
        assert!(
            review.is_object(),
            "filtered={filtered}, states={diagnostic}"
        );
        review["scheduledDays"] = json!(123);
        review["easeFactor"] = json!(3);
        states["good"]["customData"] = json!(r#"{"c":2}"#);
        request.result_json = states.to_string();
        let modified =
            SchedulingStates::decode(call(1, &request.encode_to_vec()).unwrap().as_slice())
                .unwrap();
        let mut answer: CardAnswer = ProtoAnswer {
            card_id: id.0,
            current_state: modified.current,
            new_state: modified.good,
            rating: 2,
            answered_at_millis: anki::timestamp::TimestampMillis::now().0,
            milliseconds_taken: 1000,
        }
        .into();
        col.answer_card(&mut answer).unwrap();
        let after: anki_proto::cards::Card = col.storage.get_card(id).unwrap().unwrap().into();
        assert_eq!(after.interval, 123);
        assert_eq!(after.ease_factor, 3000);
        assert_eq!(after.custom_data, r#"{"c":2}"#);
        col.undo().unwrap();
        let undone: anki_proto::cards::Card = col.storage.get_card(id).unwrap().unwrap().into();
        assert_eq!(undone.interval, original.interval);
        assert_eq!(undone.custom_data, original.custom_data);
    }
}
