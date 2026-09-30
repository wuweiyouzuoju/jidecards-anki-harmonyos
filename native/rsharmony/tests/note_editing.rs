// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::notetype::NoteField;

#[test]
fn optional_reverse_switch_generates_cards_but_does_not_delete_existing_history() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 3)
        .unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Question").unwrap();
    note.set_field(1, "Answer").unwrap();
    col.add_note(&mut note, DeckId(1)).unwrap();
    assert_eq!(col.storage.all_cards_of_note(note.id).unwrap().len(), 1);
    note.set_field(2, "1").unwrap();
    col.update_note(&mut note).unwrap();
    let ids = col
        .storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap();
    assert_eq!(ids.len(), 2);
    note.set_field(2, "").unwrap();
    col.update_note(&mut note).unwrap();
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap(),
        ids
    );
}

#[test]
fn ordinary_add_note_creates_io_cards_in_explicit_deck_without_changing_current_deck() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let target = col.get_or_create_normal_deck("Editing target").unwrap();
    col.set_current_deck(DeckId(1)).unwrap();
    col.add_image_occlusion_notetype().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 6)
        .unwrap();
    let mut note = nt.new_note();
    // Same standard fields and ordinary add-note route used by AnkiNoteCreation.
    note.set_field(0, "{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}} {{c6::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}").unwrap();
    note.set_field(1, "<img src=\"permanent.png\">").unwrap();
    note.set_field(2, "Header 中文").unwrap();
    note.set_field(3, "<b>Extra</b>").unwrap();
    col.add_note(&mut note, target.id).unwrap();
    let cards = col.storage.all_cards_of_note(note.id).unwrap();
    assert_eq!(cards.len(), 2);
    assert!(cards.iter().all(|card| card.deck_id() == target.id));
    let mut ords: Vec<_> = cards.iter().map(|card| card.template_idx()).collect();
    ords.sort();
    assert_eq!(ords, vec![0, 5]);
    assert_eq!(col.get_current_deck().unwrap().id, DeckId(1));
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().fields(),
        note.fields()
    );
}

#[test]
fn old_field_ordinals_preserve_content_on_reorder_delete_and_insert() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let mut nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.fields.len() == 2 && nt.config.kind == 0)
        .unwrap()
        .as_ref()
        .clone();
    nt.fields.push(NoteField::new("Third"));
    col.update_notetype(&mut nt, false).unwrap();
    nt = col.get_notetype(nt.id).unwrap().unwrap().as_ref().clone();
    let mut note = nt.new_note();
    for (index, text) in ["A <b>中文</b>", "B", "C [sound:keep.mp3]"]
        .iter()
        .enumerate()
    {
        note.set_field(index, *text).unwrap();
    }
    col.add_note(&mut note, DeckId(1)).unwrap();
    let card_ids = col
        .storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap();
    nt.fields.swap(0, 1);
    col.update_notetype(&mut nt, false).unwrap();
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().fields(),
        &vec!["B", "A <b>中文</b>", "C [sound:keep.mp3]"]
    );
    nt = col.get_notetype(nt.id).unwrap().unwrap().as_ref().clone();
    // Delete the unreferenced third field, keep both template fields and add a new identity.
    nt.fields.remove(2);
    nt.fields.push(NoteField::new("New"));
    col.update_notetype(&mut nt, false).unwrap();
    let stored = col.storage.get_note(note.id).unwrap().unwrap();
    assert_eq!(stored.fields(), &vec!["B", "A <b>中文</b>", ""]);
    assert_eq!(stored.guid, note.guid);
    assert_eq!(
        col.storage
            .all_card_ids_of_note_in_template_order(note.id)
            .unwrap(),
        card_ids
    );
}
