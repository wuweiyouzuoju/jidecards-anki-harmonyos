// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate an isolated package for device verification of single-item audio and flip interruption.
#[cfg(not(feature = "anki-core"))]
fn main() {
    panic!("requires anki-core");
}

#[cfg(feature = "anki-core")]
fn main() {
    use anki::{
        collection::CollectionBuilder,
        decks::{Deck, NativeDeckName},
        import_export::package::ExportAnkiPackageOptions,
        search::SearchNode,
    };
    use std::{fs, path::Path};
    fn tone(seconds: u32, hz: f64) -> Vec<u8> {
        let samples = 8000 * seconds;
        let bytes = samples * 2;
        let mut wave = [
            b"RIFF".as_slice(),
            &(36 + bytes).to_le_bytes(),
            b"WAVEfmt ",
            &16u32.to_le_bytes(),
            &1u16.to_le_bytes(),
            &1u16.to_le_bytes(),
            &8000u32.to_le_bytes(),
            &16000u32.to_le_bytes(),
            &2u16.to_le_bytes(),
            &16u16.to_le_bytes(),
            b"data",
            &bytes.to_le_bytes(),
        ]
        .concat();
        for i in 0..samples {
            wave.extend_from_slice(
                &((f64::sin(i as f64 * hz * std::f64::consts::TAU / 8000.0) * 1200.0) as i16)
                    .to_le_bytes(),
            );
        }
        wave
    }
    fs::create_dir_all("tmp/audio-ui").unwrap();
    let root = tempfile::Builder::new()
        .prefix("run-")
        .tempdir_in("tmp/audio-ui")
        .unwrap()
        .keep();
    let media = root.join("collection.media");
    fs::create_dir_all(&media).unwrap();
    let mut col = CollectionBuilder::new(root.join("collection.anki2"))
        .set_media_paths(&media, &root.join("collection.mdb"))
        .build()
        .unwrap();
    let mut deck = Deck::new_normal();
    deck.name = NativeDeckName::from_human_name("Audio UI synthetic");
    col.add_deck(&mut deck).unwrap();
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let mut note = nt.new_note();
    note.tags = vec!["jidecards::audio-ui".into()];
    note.set_field(0, "<b>Audio UI: question</b><p>First: 30 seconds [sound:audio-ui-q1.wav]</p><p>Second: 2 seconds [sound:audio-ui-q2.wav]</p>").unwrap();
    note.set_field(
        1,
        "<b>Audio UI: answer</b><p>Answer: 2 seconds [sound:audio-ui-a.wav]</p>",
    )
    .unwrap();
    col.add_note(&mut note, deck.id).unwrap();
    for (name, seconds, hz) in [
        ("audio-ui-q1.wav", 30, 220.0),
        ("audio-ui-q2.wav", 2, 440.0),
        ("audio-ui-a.wav", 2, 660.0),
    ] {
        fs::write(media.join(name), tone(seconds, hz)).unwrap();
    }
    let output = root.join("audio-ui.apkg");
    assert_eq!(
        col.export_apkg(
            Path::new(&output),
            ExportAnkiPackageOptions {
                with_scheduling: false,
                with_deck_configs: true,
                with_media: true,
                legacy: false
            },
            SearchNode::WholeCollection,
            None
        )
        .unwrap(),
        1
    );
    col.close(None).unwrap();
    println!("{}", output.display());
}
