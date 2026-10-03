// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki::scheduler::answering::{CardAnswer, Rating};
use anki::timestamp::TimestampMillis;

#[test]
fn io_shape_edits_preserve_card_identity_schedule_and_real_review_history() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    col.add_image_occlusion_notetype().unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 6)
        .unwrap();
    let mut note = nt.new_note();
    note.set_field(
        0,
        concat!(
            "{{c6::image-occlusion:ellipse:left=0.1:top=0.2:rx=0.15:ry=0.1:angle=1250:oi=1}}",
            "{{c9::image-occlusion:polygon:left=0.5:top=0.5:points=-0.1,0 0.2,0 0.2,0.2:oi=1}}",
            "{{c0::image-occlusion:text:left=0.1:top=0.1:text=Label\\: 中文:fs=0.04:scale=1.5}}"
        ),
    )
    .unwrap();
    note.set_field(1, "<img src=\"kept.png\">").unwrap();
    note.set_field(2, "Header").unwrap();
    note.set_field(3, "<b>Extra</b> [sound:kept.mp3]").unwrap();
    col.add_note(&mut note, DeckId(1)).unwrap();
    let queued = col.get_next_card().unwrap().unwrap();
    col.answer_card(&mut CardAnswer {
        card_id: queued.card.id(),
        current_state: queued.states.current,
        new_state: queued.states.good,
        rating: Rating::Good,
        answered_at: TimestampMillis::now(),
        milliseconds_taken: 1234,
        custom_data: Some("{\"io\":true}".into()),
        from_queue: true,
    })
    .unwrap();
    let before = col.storage.all_cards_of_note(note.id).unwrap();
    assert_eq!(before.len(), 2, "c0 annotations must not create cards");
    let history = col.get_review_logs(queued.card.id()).unwrap();
    assert_eq!(history.entries.len(), 1);
    note.set_field(
        0,
        concat!(
            "{{c6::image-occlusion:ellipse:left=0.3:top=0.2:rx=0.12:ry=0.1:angle=2500:oi=0}}",
            "{{c9::image-occlusion:polygon:left=0.4:top=0.4:points=-0.1,0 0.2,0 0.2,0.2:oi=0}}",
            "{{c0::image-occlusion:text:left=0.1:top=0.1:text=Changed\\: 中文:fs=0.04:scale=1.5}}"
        ),
    )
    .unwrap();
    col.update_note(&mut note).unwrap();
    assert_eq!(col.storage.all_cards_of_note(note.id).unwrap(), before);
    assert_eq!(col.get_review_logs(queued.card.id()).unwrap(), history);
    let stored = col.storage.get_note(note.id).unwrap().unwrap();
    assert_eq!(stored.guid, note.guid);
    assert_eq!(stored.fields(), note.fields());
    let rendered = col
        .render_existing_card(before[0].id(), false, false)
        .unwrap();
    let question = rendered.question();
    assert!(question.contains("data-shape=\"ellipse\""));
    assert!(question.contains("data-rx=\"0.12\""));
    assert!(question.contains("data-angle=\"2500\""));
    assert!(question.contains("data-shape=\"polygon\""));
    assert!(question.contains("data-shape=\"text\""));
    assert!(anki::text::decode_entities(&question).contains("Changed: 中文"));
}
