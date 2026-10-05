// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::CollectionBuilder;
use anki::services::DecksService;
use anki_proto::cards::Card;
use anki_proto::decks::RenameDeckRequest;

#[test]
fn rename_updates_descendant_paths_preserves_cards_and_revlogs_and_undoes_as_one_operation() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let source = col.get_or_create_normal_deck("English::Words").unwrap().id;
    let child = col
        .get_or_create_normal_deck("English::Words::Week 1")
        .unwrap()
        .id;
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Keep <b>content</b>").unwrap();
    note.set_field(1, "[sound:keep.mp3]").unwrap();
    col.add_note(&mut note, child).unwrap();
    let cid = col
        .storage
        .all_card_ids_of_note_in_template_order(note.id)
        .unwrap()[0];
    col.storage
        .db()
        .execute_batch(&format!(
            "UPDATE cards SET type=2,queue=2,due=12345,ivl=17,reps=9,lapses=2,flags=5 WHERE id={};
         INSERT INTO revlog VALUES (1700000000000,{},-1,3,17,10,2500,1234,1);",
            cid.0, cid.0
        ))
        .unwrap();
    let before: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    let changes = DecksService::rename_deck(
        &mut col,
        RenameDeckRequest {
            deck_id: source.0,
            new_name: "English::新词汇".into(),
        },
    )
    .unwrap();
    assert!(changes.deck);
    assert_eq!(col.get_deck_id("English::新词汇").unwrap(), Some(source));
    assert_eq!(
        col.get_deck_id("English::新词汇::Week 1").unwrap(),
        Some(child)
    );
    assert_eq!(col.get_deck_id("English::Words").unwrap(), None);
    assert_eq!(
        before,
        Card::from(col.storage.get_card(cid).unwrap().unwrap())
    );
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().fields(),
        note.fields()
    );
    let revlog: (i64, i64, i64, i64) = col
        .storage
        .db()
        .query_row("SELECT cid,ease,ivl,time FROM revlog", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap();
    assert_eq!(revlog, (cid.0, 3, 17, 1234));
    col.undo().unwrap();
    assert_eq!(col.get_deck_id("English::Words").unwrap(), Some(source));
    assert_eq!(
        col.get_deck_id("English::Words::Week 1").unwrap(),
        Some(child)
    );
    col.redo().unwrap();
    assert_eq!(
        col.get_deck_id("English::新词汇::Week 1").unwrap(),
        Some(child)
    );
    assert_eq!(
        before,
        Card::from(col.storage.get_card(cid).unwrap().unwrap())
    );
}

#[test]
fn core_normalizes_unicode_and_handles_case_only_rename_with_stable_identity() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let id = col.get_or_create_normal_deck("café").unwrap().id;
    let changes = DecksService::rename_deck(
        &mut col,
        RenameDeckRequest {
            deck_id: id.0,
            new_name: "CAFE\u{301}".into(),
        },
    )
    .unwrap();
    assert!(changes.deck);
    assert_eq!(col.get_deck(id).unwrap().unwrap().human_name(), "CAFÉ");
    col.undo().unwrap();
    assert_eq!(col.get_deck(id).unwrap().unwrap().human_name(), "café");
}
