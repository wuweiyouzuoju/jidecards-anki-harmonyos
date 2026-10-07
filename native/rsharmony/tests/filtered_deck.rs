// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use anki::{collection::CollectionBuilder, decks::DeckId};

#[test]
fn existing_filtered_empty_rebuild_update_and_undo_preserve_notes_and_home_deck() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut ids = vec![];
    for i in 0..4 {
        let mut note = nt.new_note();
        note.set_field(0, format!("Synthetic filtered {i}"))
            .unwrap();
        note.set_field(1, "Answer").unwrap();
        note.tags = vec!["filtered-proof".into()];
        col.add_note(&mut note, DeckId(1)).unwrap();
        ids.push(col.storage.all_cards_of_note(note.id).unwrap()[0].id());
    }
    let mut draft = col.get_or_create_filtered_deck(DeckId(0)).unwrap();
    draft.config.search_terms.truncate(1);
    draft.human_name = "Synthetic filtered maintenance".into();
    draft.config.search_terms[0].search = "tag:filtered-proof".into();
    draft.config.search_terms[0].limit = 2;
    let id = col.add_or_update_filtered_deck(draft).unwrap().output;
    assert_eq!(
        col.search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
            .unwrap()
            .len(),
        2
    );
    col.empty_filtered_deck(id).unwrap();
    assert!(col
        .search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
        .unwrap()
        .is_empty());
    for cid in &ids {
        let card = col.storage.get_card(*cid).unwrap().unwrap();
        assert_eq!(card.deck_id(), DeckId(1));
    }
    assert_eq!(col.get_or_create_filtered_deck(id).unwrap().id, id);
    col.undo().unwrap();
    assert_eq!(
        col.search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
            .unwrap()
            .len(),
        2
    );
    col.redo().unwrap();
    assert!(col
        .search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
        .unwrap()
        .is_empty());
    assert_eq!(col.rebuild_filtered_deck(id).unwrap().output, 2);
    let mut update = col.get_or_create_filtered_deck(id).unwrap();
    update.config.search_terms[0].limit = 4;
    update.config.reschedule = false;
    update.config.preview_hard_secs = 180;
    assert_eq!(col.add_or_update_filtered_deck(update).unwrap().output, id);
    assert_eq!(
        col.search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
            .unwrap()
            .len(),
        4
    );
    col.undo().unwrap();
    assert_eq!(
        col.search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
            .unwrap()
            .len(),
        2
    );
    let mut empty = col.get_or_create_filtered_deck(id).unwrap();
    empty.config.search_terms[0].search = "tag:missing-synthetic".into();
    empty.allow_empty = true;
    col.add_or_update_filtered_deck(empty).unwrap();
    assert!(col
        .search_cards(&format!("did:{}", id.0), anki::search::SortMode::NoOrder)
        .unwrap()
        .is_empty());
    assert_eq!(
        col.search_cards("did:1", anki::search::SortMode::NoOrder)
            .unwrap()
            .len(),
        4
    );
    for cid in ids {
        assert!(col.storage.get_card(cid).unwrap().is_some());
    }
    assert!(col.empty_filtered_deck(DeckId(1)).is_err());
    assert!(col.rebuild_filtered_deck(DeckId(1)).is_err());
}
