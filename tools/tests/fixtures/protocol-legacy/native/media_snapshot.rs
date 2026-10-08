// SPDX-License-Identifier: AGPL-3.0-or-later
//! Application-owned media RPC; upstream service 41 and its wire format stay unchanged.
//! A backend owns one snapshot. Closing/rechecking invalidates its token. Only bounded
//! pages cross FFI; Core's scan and complete native response still cost O(collection).
use crate::rpc_ids::{ADD_NOTE_TAGS, CHECK_MEDIA, MEDIA_SERVICE, TAGS_SERVICE, TRASH_MEDIA_FILES};
use crate::{BackendFailure, RawBackend};
use prost::Message;
use std::collections::HashSet;

pub const SERVICE: u32 = 1000;
const FILES_PER_BATCH: usize = 256;
const REPORT_PAGE_BYTES: usize = 16 * 1024;

#[derive(Clone, PartialEq, Message)]
struct CheckResponse {
    #[prost(string, repeated, tag = "1")]
    unused: Vec<String>,
    #[prost(string, repeated, tag = "2")]
    missing: Vec<String>,
    #[prost(int64, repeated, tag = "3")]
    missing_media_notes: Vec<i64>,
    #[prost(string, tag = "4")]
    report: String,
    #[prost(bool, tag = "5")]
    have_trash: bool,
}

#[derive(Clone, PartialEq, Message)]
struct Request {
    #[prost(uint32, tag = "1")]
    token: u32,
    #[prost(uint32, tag = "2")]
    offset: u32,
}

#[derive(Clone, PartialEq, Message)]
struct Page {
    #[prost(uint32, tag = "1")]
    token: u32,
    #[prost(uint32, tag = "2")]
    unused_count: u32,
    #[prost(uint32, tag = "3")]
    missing_count: u32,
    #[prost(bool, tag = "4")]
    have_trash: bool,
    #[prost(string, tag = "5")]
    report: String,
    #[prost(uint32, tag = "6")]
    next_offset: u32,
    #[prost(string, repeated, tag = "7")]
    files: Vec<String>,
    #[prost(int64, repeated, tag = "8")]
    note_ids: Vec<i64>,
    #[prost(uint32, tag = "9")]
    missing_note_count: u32,
    #[prost(uint32, tag = "10")]
    tagged_count: u32,
}

#[derive(Clone, PartialEq, Message)]
struct NoteTags {
    #[prost(int64, repeated, tag = "1")]
    ids: Vec<i64>,
    #[prost(string, tag = "2")]
    tags: String,
}

#[derive(Clone, PartialEq, Message)]
struct ChangesWithCount {
    #[prost(uint32, tag = "2")]
    count: u32,
}

#[derive(Clone, PartialEq, Message)]
struct Strings {
    #[prost(string, repeated, tag = "1")]
    values: Vec<String>,
}

fn invalid(message: &str) -> BackendFailure {
    // BackendError.localized = 1; preserve the existing typed error channel.
    BackendFailure::Backend(
        Strings {
            values: vec![message.to_owned()],
        }
        .encode_to_vec(),
    )
}

#[derive(Default)]
pub struct MediaSnapshot {
    token: u32,
    response: Option<CheckResponse>,
    missing_count: u32,
}

impl MediaSnapshot {
    pub fn clear(&mut self) {
        self.response = None;
        self.token = self.token.wrapping_add(1).max(1);
    }

    fn check(raw: &mut dyn RawBackend) -> Result<CheckResponse, BackendFailure> {
        let bytes = raw.run_method_raw(MEDIA_SERVICE, CHECK_MEDIA, &[])?;
        CheckResponse::decode(bytes.as_slice()).map_err(|_| invalid("Invalid Core media response"))
    }

    pub fn call(
        &mut self,
        raw: &mut dyn RawBackend,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        let request =
            Request::decode(input).map_err(|_| invalid("Invalid media snapshot request"))?;
        if method == 0 {
            self.clear();
            let mut response = Self::check(raw)?;
            self.missing_count = response.missing.len() as u32;
            response.missing = Vec::new();
            response.missing_media_notes.sort_unstable();
            response.missing_media_notes.dedup();
            self.response = Some(response);
            return self.report_page(0);
        }
        if request.token != self.token || self.response.is_none() {
            return Err(invalid("Media snapshot expired; check media again"));
        }
        match method {
            1 => self.report_page(request.offset as usize),
            2 => {
                let response = self.response.as_ref().unwrap();
                let offset = request.offset as usize;
                if offset > response.unused.len() {
                    return Err(invalid("Invalid media file offset"));
                }
                let end = (offset + FILES_PER_BATCH).min(response.unused.len());
                Ok(Page {
                    token: self.token,
                    files: response.unused[offset..end].to_vec(),
                    next_offset: if end < response.unused.len() {
                        end as u32
                    } else {
                        0
                    },
                    ..Page::default()
                }
                .encode_to_vec())
            }
            3 => {
                // The user confirmed the old snapshot. Only trash names still unused now.
                let current = Self::check(raw)?;
                let confirmed: HashSet<&str> = self
                    .response
                    .as_ref()
                    .unwrap()
                    .unused
                    .iter()
                    .map(String::as_str)
                    .collect();
                let safe: Vec<String> = current
                    .unused
                    .into_iter()
                    .filter(|name| confirmed.contains(name.as_str()))
                    .collect();
                self.clear(); // Never allow retrying a partially completed action with a stale token.
                for batch in safe.chunks(FILES_PER_BATCH) {
                    raw.run_method_raw(
                        MEDIA_SERVICE,
                        TRASH_MEDIA_FILES,
                        &Strings {
                            values: batch.to_vec(),
                        }
                        .encode_to_vec(),
                    )?;
                }
                Ok(Vec::new())
            }
            4 => {
                self.clear();
                Ok(Vec::new())
            }
            5 => {
                let ids = &self.response.as_ref().unwrap().missing_media_notes;
                let offset = request.offset as usize;
                if offset > ids.len() {
                    return Err(invalid("Invalid missing note offset"));
                }
                let end = (offset + FILES_PER_BATCH).min(ids.len());
                Ok(Page {
                    token: self.token,
                    note_ids: ids[offset..end].to_vec(),
                    next_offset: if end < ids.len() { end as u32 } else { 0 },
                    missing_note_count: ids.len() as u32,
                    ..Page::default()
                }
                .encode_to_vec())
            }
            6 => {
                // Recheck and write under one registry lock. Newly missing notes were not confirmed.
                let current = Self::check(raw)?;
                let confirmed: HashSet<i64> = self
                    .response
                    .as_ref()
                    .unwrap()
                    .missing_media_notes
                    .iter()
                    .copied()
                    .collect();
                let mut ids: Vec<i64> = current
                    .missing_media_notes
                    .into_iter()
                    .filter(|id| confirmed.contains(id))
                    .collect();
                ids.sort_unstable();
                ids.dedup();
                self.clear();
                let count = if ids.is_empty() {
                    0
                } else {
                    // One Core transaction and one undo step; IDs never cross FFI as an unbounded list.
                    let bytes = raw.run_method_raw(
                        TAGS_SERVICE,
                        ADD_NOTE_TAGS,
                        &NoteTags {
                            ids,
                            tags: "missing-media".into(),
                        }
                        .encode_to_vec(),
                    )?;
                    ChangesWithCount::decode(bytes.as_slice())
                        .map_err(|_| invalid("Invalid tag response"))?
                        .count
                };
                Ok(Page {
                    tagged_count: count,
                    ..Page::default()
                }
                .encode_to_vec())
            }
            _ => Err(invalid("Unknown media snapshot method")),
        }
    }

    fn report_page(&self, offset: usize) -> Result<Vec<u8>, BackendFailure> {
        let response = self
            .response
            .as_ref()
            .ok_or_else(|| invalid("Media snapshot unavailable"))?;
        if offset > response.report.len() || !response.report.is_char_boundary(offset) {
            return Err(invalid("Invalid media report offset"));
        }
        let mut end = (offset + REPORT_PAGE_BYTES).min(response.report.len());
        while !response.report.is_char_boundary(end) {
            end -= 1;
        }
        // Keep ordinary report lines intact when appending Text chunks during scrolling.
        if end < response.report.len() {
            if let Some(newline) = response.report[offset..end].rfind('\n') {
                end = offset + newline + 1;
            }
        }
        Ok(Page {
            token: self.token,
            unused_count: response.unused.len() as u32,
            missing_count: self.missing_count,
            have_trash: response.have_trash,
            report: response.report[offset..end].to_owned(),
            next_offset: if end < response.report.len() {
                end as u32
            } else {
                0
            },
            files: Vec::new(),
            missing_note_count: response.missing_media_notes.len() as u32,
            ..Page::default()
        }
        .encode_to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "anki-core")]
    #[test]
    fn real_core_snapshot_checks_and_trashes_media_without_changing_upstream_rpc() {
        use crate::{AnkiBackend, BackendRegistry};
        use std::time::{SystemTime, UNIX_EPOCH};
        #[derive(Clone, PartialEq, Message)]
        struct Open {
            #[prost(string, tag = "1")]
            collection: String,
            #[prost(string, tag = "2")]
            media: String,
            #[prost(string, tag = "3")]
            media_db: String,
        }
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let folder = temp.join(format!("jidecards-media-test-{unique}"));
        std::fs::create_dir(&folder).unwrap();
        let note_id = {
            let mut col = anki::collection::CollectionBuilder::default()
                .set_collection_path(folder.join("collection.anki2"))
                .with_desktop_media_paths()
                .build()
                .unwrap();
            let nt = col.get_notetype_by_name("Basic").unwrap().unwrap();
            let mut note = nt.new_note();
            note.set_field(0, "<img src=\"missing-test.png\">").unwrap();
            note.tags = vec!["existing".into()];
            col.add_note(&mut note, anki::decks::DeckId(1)).unwrap();
            note.id
        };
        let registry = BackendRegistry::new();
        let handle = registry.insert(AnkiBackend(anki::backend::init_backend(&[]).unwrap()));
        let media = folder.join("collection.media");
        let open = Open {
            collection: folder.join("collection.anki2").to_str().unwrap().into(),
            media: media.to_str().unwrap().into(),
            media_db: folder.join("collection.mdb").to_str().unwrap().into(),
        };
        registry.call(handle, 3, 0, &open.encode_to_vec()).unwrap();
        std::fs::create_dir_all(&media).unwrap();
        std::fs::write(media.join("orphan.png"), b"media fixture").unwrap();
        let bytes = registry.call(handle, SERVICE, 0, &[]).unwrap();
        let page = Page::decode(bytes.as_slice()).unwrap();
        assert_eq!(page.unused_count, 1);
        registry
            .call(
                handle,
                SERVICE,
                3,
                &Request {
                    token: page.token,
                    offset: 0,
                }
                .encode_to_vec(),
            )
            .unwrap();
        assert!(!media.join("orphan.png").exists());
        let bytes = registry.call(handle, SERVICE, 0, &[]).unwrap();
        let page = Page::decode(bytes.as_slice()).unwrap();
        assert_eq!(page.unused_count, 0);
        assert!(page.have_trash);
        // The unmodified Core endpoint still uses its original response schema.
        let bytes = registry.call(handle, 41, 0, &[]).unwrap();
        assert!(CheckResponse::decode(bytes.as_slice()).unwrap().have_trash);
        assert_eq!(page.missing_note_count, 1);
        let request = Request {
            token: page.token,
            offset: 0,
        }
        .encode_to_vec();
        let bytes = registry.call(handle, SERVICE, 5, &request).unwrap();
        assert_eq!(
            Page::decode(bytes.as_slice()).unwrap().note_ids,
            vec![note_id.0]
        );
        let bytes = registry.call(handle, SERVICE, 6, &request).unwrap();
        assert_eq!(Page::decode(bytes.as_slice()).unwrap().tagged_count, 1);
        assert!(registry.call(handle, SERVICE, 6, &request).is_err());
        use crate::rpc_ids::{COLLECTION_SERVICE, GET_UNDO_STATUS};
        let status = registry
            .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
            .unwrap();
        registry
            .call(handle, crate::collection_history::SERVICE, 0, &status)
            .unwrap();
        let status = registry
            .call(handle, COLLECTION_SERVICE, GET_UNDO_STATUS, &[])
            .unwrap();
        registry
            .call(handle, crate::collection_history::SERVICE, 1, &status)
            .unwrap();
        registry.call(handle, 3, 1, &[]).unwrap();
        registry.close(handle);
        {
            let col = anki::collection::CollectionBuilder::default()
                .set_collection_path(folder.join("collection.anki2"))
                .with_desktop_media_paths()
                .build()
                .unwrap();
            let note = col.storage.get_note(note_id).unwrap().unwrap();
            assert!(note.tags.contains(&"existing".into()));
            assert!(note.tags.contains(&"missing-media".into()));
        }
        let resolved = folder.canonicalize().unwrap();
        assert!(resolved.starts_with(&temp) && resolved != temp);
        std::fs::remove_dir_all(resolved).unwrap();
    }
    struct Core {
        response: CheckResponse,
        batches: Vec<usize>,
        fail: bool,
        tagged: Vec<i64>,
    }
    impl RawBackend for Core {
        fn run_method_raw(
            &mut self,
            service: u32,
            method: u32,
            input: &[u8],
        ) -> Result<Vec<u8>, BackendFailure> {
            if service == TAGS_SERVICE {
                assert_eq!(method, ADD_NOTE_TAGS);
                let tags = NoteTags::decode(input).unwrap();
                assert_eq!(tags.tags, "missing-media");
                self.tagged = tags.ids;
                return Ok(ChangesWithCount {
                    count: self.tagged.len() as u32,
                }
                .encode_to_vec());
            }
            assert_eq!(service, 41);
            if method == 0 {
                return Ok(self.response.encode_to_vec());
            }
            let names = Strings::decode(input).unwrap();
            self.batches.push(names.values.len());
            if self.fail {
                return Err(invalid("IO failed"));
            }
            Ok(Vec::new())
        }
    }
    fn core() -> Core {
        Core {
            response: CheckResponse {
                unused: (0..100_000).map(|n| format!("{n}.png")).collect(),
                missing: vec!["missing.png".into()],
                missing_media_notes: vec![],
                report: "媒体😀\n".repeat(100_000),
                have_trash: true,
            },
            batches: vec![],
            fail: false,
            tagged: vec![],
        }
    }
    #[test]
    fn large_report_pages_are_bounded_and_lossless() {
        let mut core = core();
        let mut snapshot = MediaSnapshot::default();
        let bytes = snapshot.call(&mut core, 0, &[]).unwrap();
        assert!(bytes.len() < 17_000);
        let mut page = Page::decode(bytes.as_slice()).unwrap();
        assert_eq!(page.unused_count, 100_000);
        assert_eq!(page.missing_count, 1);
        assert!(page.files.is_empty());
        let token = page.token;
        let mut report = page.report;
        while page.next_offset != 0 {
            let bytes = snapshot
                .call(
                    &mut core,
                    1,
                    &Request {
                        token,
                        offset: page.next_offset,
                    }
                    .encode_to_vec(),
                )
                .unwrap();
            assert!(bytes.len() < 17_000);
            page = Page::decode(bytes.as_slice()).unwrap();
            report.push_str(&page.report);
        }
        assert_eq!(report, core.response.report);
        let bytes = snapshot
            .call(&mut core, 2, &Request { token, offset: 0 }.encode_to_vec())
            .unwrap();
        assert_eq!(
            Page::decode(bytes.as_slice()).unwrap().files.len(),
            FILES_PER_BATCH
        );
        snapshot.clear();
        assert!(snapshot
            .call(&mut core, 1, &Request { token, offset: 0 }.encode_to_vec())
            .is_err());
    }
    #[test]
    fn cleanup_revalidates_and_batches_and_invalidates_partial_failure() {
        let mut core = core();
        let mut snapshot = MediaSnapshot::default();
        snapshot.call(&mut core, 0, &[]).unwrap();
        let request = Request {
            token: snapshot.token,
            offset: 0,
        }
        .encode_to_vec();
        core.response.unused.truncate(600);
        core.response.unused.push("new-unconfirmed.png".into());
        snapshot.call(&mut core, 3, &request).unwrap();
        assert_eq!(core.batches, vec![256, 256, 88]);
        assert!(snapshot.call(&mut core, 3, &request).is_err());
        snapshot.call(&mut core, 0, &[]).unwrap();
        core.fail = true;
        let request = Request {
            token: snapshot.token,
            offset: 0,
        }
        .encode_to_vec();
        assert!(snapshot.call(&mut core, 3, &request).is_err());
        assert!(snapshot.response.is_none());
    }
    #[test]
    fn missing_notes_are_paged_deduplicated_and_tagging_revalidates_only_confirmed_notes() {
        let mut core = core();
        core.response.missing_media_notes = (1..=600).chain([1, 2]).collect();
        let mut snapshot = MediaSnapshot::default();
        snapshot.call(&mut core, 0, &[]).unwrap();
        let request = Request {
            token: snapshot.token,
            offset: 0,
        }
        .encode_to_vec();
        let page = Page::decode(snapshot.call(&mut core, 5, &request).unwrap().as_slice()).unwrap();
        assert_eq!(page.note_ids.len(), 256);
        assert_eq!(page.missing_note_count, 600);
        assert_eq!(page.next_offset, 256);
        core.response.missing_media_notes = vec![2, 2, 700];
        let page = Page::decode(snapshot.call(&mut core, 6, &request).unwrap().as_slice()).unwrap();
        assert_eq!(page.tagged_count, 1);
        assert_eq!(core.tagged, vec![2]);
        assert!(snapshot.call(&mut core, 5, &request).is_err());
    }
}
