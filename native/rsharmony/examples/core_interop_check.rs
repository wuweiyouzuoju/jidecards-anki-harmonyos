// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks only the explicitly marked, runner-generated recovery corpus.
use std::fs;
use std::path::PathBuf;

use anki::collection::CollectionBuilder;

fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(
        args.len(),
        2,
        "requires runner-generated artifact directory"
    );
    let root = PathBuf::from(&args[1]);
    assert_eq!(
        fs::read_to_string(root.join(".interop-owned")).unwrap(),
        "synthetic-only\n"
    );
    for name in ["process-death", "retry-rollback", "committed-cleanup"] {
        let recovered = root.join("recovered").join(name);
        assert_eq!(
            fs::read_to_string(recovered.join(".recovery-owned")).unwrap(),
            "synthetic-only\n"
        );
        let mut col = CollectionBuilder::new(recovered.join("collection.anki2"))
            .set_media_paths(
                recovered.join("collection.media"),
                recovered.join("collection.mdb"),
            )
            .set_check_integrity(true)
            .build()
            .unwrap();
        let ids = col.storage.get_all_note_ids().unwrap();
        assert_eq!(ids.len(), 7);
        let mut cards = 0;
        let mut reviews = 0;
        for nid in ids {
            let note = col.storage.get_note(nid).unwrap().unwrap();
            assert!(note.guid.starts_with("interop-"));
            for card in col.storage.all_cards_of_note(nid).unwrap() {
                assert_eq!(card.note_id(), nid);
                cards += 1;
                reviews += col.get_review_logs(card.id()).unwrap().entries.len();
            }
        }
        assert_eq!(cards, 11);
        assert_eq!(reviews, 3);
        col.close(None).unwrap();
        println!("{name}: Core integrity and 7 notes / 11 cards / 3 reviews passed");
    }
}
