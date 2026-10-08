// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]
use prost::Message;

#[test]
fn core_signed_int32_and_mixed_repeated_segments_authorize_documented_corrections() {
    let deck = anki_proto::decks::Deck {
        usn: -1,
        ..Default::default()
    };
    assert_eq!(
        deck.encode_to_vec(),
        vec![32, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1]
    );
    let counts = anki_proto::stats::graphs_response::buttons::ButtonCounts::decode(
        [10, 2, 1, 2, 8, 3, 10, 2, 4, 5].as_slice(),
    )
    .unwrap();
    assert_eq!(counts.learning, vec![1, 2, 3, 4, 5]);
    assert!(anki_proto::cards::Card::decode([10, 0].as_slice()).is_err());
    assert!(
        anki_proto::generic::Bool::decode(
            [8, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1].as_slice()
        )
        .unwrap()
        .val
    );
}

#[test]
fn core_csv_oneof_merges_same_branch_and_resets_after_switching_branch() {
    use anki_proto::import_export::{csv_metadata::Notetype, CsvMetadata};
    // global_notetype(id=7, field_columns=[1]), then same branch(columns=[2,3]).
    let first = [66, 4, 8, 7, 16, 1, 66, 4, 18, 2, 2, 3];
    let Notetype::GlobalNotetype(mapped) = CsvMetadata::decode(first.as_slice())
        .unwrap()
        .notetype
        .unwrap()
    else {
        panic!("expected global notetype");
    };
    assert_eq!(mapped.id, 7);
    assert_eq!(mapped.field_columns, vec![1, 2, 3]);
    let switched = [first.as_slice(), &[72, 5, 66, 2, 16, 4]].concat();
    let Notetype::GlobalNotetype(mapped) = CsvMetadata::decode(switched.as_slice())
        .unwrap()
        .notetype
        .unwrap()
    else {
        panic!("expected global notetype");
    };
    assert_eq!(mapped.id, 0);
    assert_eq!(mapped.field_columns, vec![4]);
}

#[test]
fn core_integer_wire_limits_and_narrowing_are_explicit() {
    // prost narrows to u32 before sint32 zigzag decoding.
    let wide32 = [128, 128, 128, 128, 16]; // 2^32
    let mut card = vec![72];
    card.extend(wide32);
    assert_eq!(
        anki_proto::cards::Card::decode(card.as_slice())
            .unwrap()
            .due,
        0
    );
    let mut addon = vec![8];
    addon.extend(wide32);
    assert_eq!(
        anki_proto::ankiweb::AddonInfo::decode(addon.as_slice())
            .unwrap()
            .id,
        0
    );
    let overflow = [8, 128, 128, 128, 128, 128, 128, 128, 128, 128, 2]; // 2^64
    assert!(anki_proto::cards::CardId::decode(overflow.as_slice()).is_err());
    let illegal_tag = [128, 128, 128, 128, 16, 0]; // field 2^29
    assert!(anki_proto::cards::CardId::decode(illegal_tag.as_slice()).is_err());
    let config = anki_proto::deck_config::DeckConfig {
        usn: -1,
        ..Default::default()
    };
    assert_eq!(
        config.encode_to_vec(),
        [vec![32], vec![255; 9], vec![1]].concat()
    );
}
