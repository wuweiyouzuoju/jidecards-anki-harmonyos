// SPDX-License-Identifier: AGPL-3.0-or-later
//! Line protocol for production ArkTS codec/Core integration; owns only a temporary fixture.
#[cfg(feature = "anki-core")]
fn main() {
    use anki::{backend::init_backend, collection::CollectionBuilder, decks::DeckId};
    use anki_proto::collection::OpenCollectionRequest;
    use prost::Message;
    use serde_json::{json, Value};
    use std::io::{BufRead, Write};
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("protocol.anki2");
    let (note_id, card_id, notetype_id) = {
        let mut col = CollectionBuilder::new(&path).build().unwrap();
        let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
        let mut note = nt.new_note();
        note.set_field(0, "协议探针 😀").unwrap();
        note.set_field(1, "Answer").unwrap();
        col.add_note(&mut note, DeckId(1)).unwrap();
        let card = col.storage.all_cards_of_note(note.id).unwrap()[0].id();
        (note.id.0, card.0, nt.id.0)
    };
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            3,
            0,
            &OpenCollectionRequest {
                collection_path: path.to_string_lossy().into(),
                media_folder_path: root.path().join("media").to_string_lossy().into(),
                media_db_path: root.path().join("media.db").to_string_lossy().into(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    println!(
        "{}",
        json!({"noteId":note_id,"cardId":card_id,"notetypeId":notetype_id,"directory":root.path()})
    );
    std::io::stdout().flush().unwrap();
    for line in std::io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let input = request["input"].as_str().unwrap();
        let bytes: Vec<u8> = (0..input.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&input[i..i + 2], 16).unwrap())
            .collect();
        let result = backend.run_service_method(
            request["service"].as_u64().unwrap() as u32,
            request["method"].as_u64().unwrap() as u32,
            &bytes,
        );
        let (bytes, error) = match result {
            Ok(bytes) => (bytes, false),
            Err(bytes) => (bytes, true),
        };
        let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        println!("{}", json!({"output":hex,"error":error}));
        std::io::stdout().flush().unwrap();
    }
    // ExportCollectionPackage may have already closed Core's collection. Backend drop owns cleanup.
}
#[cfg(not(feature = "anki-core"))]
fn main() {
    panic!("protocol_probe requires anki-core");
}
