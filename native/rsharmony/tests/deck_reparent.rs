// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::CollectionBuilder;
use anki_proto::cards::Card;

#[test]
fn reparent_and_promote_preserve_subtree_ids_cards_history_and_support_undo() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let source = col.get_or_create_normal_deck("A::B").unwrap().id;
    let child = col.get_or_create_normal_deck("A::B::C").unwrap().id;
    let target = col.get_or_create_normal_deck("D").unwrap().id;
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
    assert_eq!(
        col.reparent_decks(&[source], Some(target)).unwrap().output,
        1
    );
    assert_eq!(col.get_deck_id("D::B").unwrap(), Some(source));
    assert_eq!(col.get_deck_id("D::B::C").unwrap(), Some(child));
    assert_eq!(col.get_deck_id("A::B").unwrap(), None);
    assert_eq!(col.reparent_decks(&[source], None).unwrap().output, 1);
    assert_eq!(col.get_deck_id("B::C").unwrap(), Some(child));
    let after: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    assert_eq!(before, after);
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
    assert_eq!(col.get_deck_id("D::B::C").unwrap(), Some(child));
    col.undo().unwrap();
    assert_eq!(col.get_deck_id("A::B").unwrap(), Some(source));
    assert_eq!(col.get_deck_id("A::B::C").unwrap(), Some(child));
    let restored: Card = col.storage.get_card(cid).unwrap().unwrap().into();
    assert_eq!(before, restored);
}
