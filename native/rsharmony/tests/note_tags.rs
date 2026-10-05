// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::search::SearchNode;

#[test]
fn tag_nodes_use_full_paths_and_escape_literal_search_characters() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Tag search fixture").unwrap();
    note.tags = vec!["Science::quote\"star*slash\\".into()];
    col.add_note(&mut note, DeckId(1)).unwrap();
    assert_eq!(
        col.search_notes_unordered(SearchNode::from_tag_name("Science::quote\"star*slash\\"))
            .unwrap(),
        vec![note.id]
    );
    assert!(col
        .search_notes_unordered(SearchNode::from_tag_name("quote\"star*slash\\"))
        .unwrap()
        .is_empty());
    assert_eq!(
        col.search_notes_unordered(SearchNode::from_tag_name("Science"))
            .unwrap(),
        vec![note.id]
    );
}

#[test]
fn prefix_management_cascades_only_through_the_matching_hierarchy_and_can_undo() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Keep <b>fields</b>").unwrap();
    note.set_field(1, "[sound:keep.mp3]").unwrap();
    note.tags = vec!["Topic".into(), "Topic::Child".into(), "TopicExtra".into()];
    col.add_note(&mut note, DeckId(1)).unwrap();
    let original = col.storage.get_note(note.id).unwrap().unwrap();
    assert_eq!(col.rename_tag("Topic", "New").unwrap().output, 1);
    let changed = col.storage.get_note(note.id).unwrap().unwrap();
    assert!(changed.tags.contains(&"New::Child".into()));
    assert!(changed.tags.contains(&"TopicExtra".into()));
    assert_eq!(changed.fields(), original.fields());
    assert_eq!(changed.guid, original.guid);
    col.undo().unwrap();
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().tags,
        original.tags
    );
    assert_eq!(col.remove_tags("Topic").unwrap().output, 1);
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().tags,
        vec!["TopicExtra"]
    );
    col.undo().unwrap();
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().tags,
        original.tags
    );
}

#[test]
fn tag_tree_collapse_survives_reload_and_unused_cleanup_keeps_note_tags() {
    let mut col = CollectionBuilder::default().build().unwrap();
    let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
    let mut note = nt.new_note();
    note.set_field(0, "Tag tree fixture").unwrap();
    note.tags = vec!["Parent::Child".into()];
    col.add_note(&mut note, DeckId(1)).unwrap();
    col.set_tag_collapsed("Parent", false).unwrap();
    col.set_tag_collapsed("Unused", true).unwrap();
    let tree = col.tag_tree().unwrap();
    let parent = tree
        .children
        .iter()
        .find(|node| node.name == "Parent")
        .unwrap();
    assert!(!parent.collapsed);
    assert_eq!(parent.children[0].name, "Child");
    col.set_tag_collapsed("Parent", true).unwrap();
    assert!(
        col.tag_tree()
            .unwrap()
            .children
            .iter()
            .find(|node| node.name == "Parent")
            .unwrap()
            .collapsed
    );
    col.clear_unused_tags().unwrap();
    assert!(!col
        .tag_tree()
        .unwrap()
        .children
        .iter()
        .any(|node| node.name == "Unused"));
    assert_eq!(
        col.storage.get_note(note.id).unwrap().unwrap().tags,
        vec!["Parent::Child"]
    );
}
