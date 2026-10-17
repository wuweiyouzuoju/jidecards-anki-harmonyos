// SPDX-License-Identifier: AGPL-3.0-or-later
//! JideCards extension over the public Anki API. No upstream patches or scheduler changes.
//! Peer revisions live outside the collection; cloud USNs are never used as peer acknowledgements.
#[cfg(feature = "anki-core")]
mod media;
#[cfg(feature = "anki-core")]
mod snapshot;

#[cfg(feature = "anki-core")]
use anki::backend::Backend;
#[cfg(feature = "anki-core")]
use prost::Message;
#[cfg(feature = "anki-core")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "anki-core")]
use serde_json::Value;
#[cfg(feature = "anki-core")]
use std::path::{Path, PathBuf};
#[cfg(feature = "anki-core")]
use std::{fs, io};

pub const SERVICE: u32 = crate::private_rpc_ids::PEER_COLLECTION;
#[cfg(feature = "anki-core")]
const MAX_METADATA: u64 = 64 * 1024 * 1024;
#[cfg(feature = "anki-core")]
const MAX_PACKET: u64 = 4 * 1024 * 1024 * 1024;

#[cfg(feature = "anki-core")]
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[cfg(feature = "anki-core")]
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub token: String,
    #[serde(default)]
    pub local: String,
    #[serde(default)]
    pub out: String,
    #[serde(default)]
    pub payload: String,
    #[serde(default)]
    pub own: String,
    #[serde(default)]
    pub mode: String,
}

#[cfg(feature = "anki-core")]
#[derive(Default, Serialize, Deserialize, Debug)]
pub struct Summary {
    pub bytes: u64,
    pub updated_objects: u64,
    pub added_reviews: u64,
    pub updated_media: u64,
    pub deleted_media: u64,
}

#[cfg(feature = "anki-core")]
fn fail(message: &str) -> Box<dyn std::error::Error + Send + Sync> {
    io::Error::other(message).into()
}

#[cfg(feature = "anki-core")]
fn valid_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

#[cfg(feature = "anki-core")]
fn packet(root: &Path, token: &str) -> Result<PathBuf> {
    if !valid_id(token) {
        return Err(fail("device_collection_invalid"));
    }
    Ok(root.join(".device-collection").join(format!("{token}.bin")))
}

#[cfg(feature = "anki-core")]
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    use std::io::Write;
    let temporary = path.with_extension("pending");
    let mut file = fs::File::create(&temporary)?;
    serde_json::to_writer(&mut file, value)?;
    file.flush()?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, path)?;
    sync_directory(
        path.parent()
            .ok_or_else(|| fail("device_collection_invalid"))?,
    )?;
    Ok(())
}

#[cfg(feature = "anki-core")]
fn sync_directory(path: &Path) -> Result<()> {
    #[cfg(unix)]
    fs::File::open(path)?.sync_all()?;
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

#[cfg(feature = "anki-core")]
fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > MAX_METADATA {
        return Err(fail("device_collection_too_large"));
    }
    Ok(serde_json::from_reader(io::BufReader::new(
        fs::File::open(path)?,
    ))?)
}

#[cfg(feature = "anki-core")]
fn root_for(backend: &Backend) -> Result<PathBuf> {
    let bytes = backend
        .run_db_command_bytes(
            br#"{"kind":"query","sql":"pragma database_list","args":[],"first_row_only":false}"#,
        )
        .map_err(|_| fail("device_collection_failed"))?;
    let rows: Value = serde_json::from_slice(&bytes)?;
    let path = rows
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row[1] == "main"))
        .and_then(|row| row[2].as_str())
        .ok_or_else(|| fail("device_collection_invalid"))?;
    let path = Path::new(path);
    if path.file_name().and_then(|s| s.to_str()) != Some("collection.anki2") {
        return Err(fail("device_collection_invalid"));
    }
    Ok(path
        .parent()
        .ok_or_else(|| fail("device_collection_invalid"))?
        .to_path_buf())
}

/// Accepted native work owns collection close/open, including restoration on failure.
#[cfg(feature = "anki-core")]
fn with_collection<T>(
    backend: &Backend,
    root: &Path,
    operation: impl FnOnce(&mut anki::collection::Collection) -> Result<T>,
) -> Result<T> {
    use crate::protocol_generated::CollectionOpenCollectionRequest;
    use crate::rpc_ids::{CLOSE_COLLECTION, COLLECTION_SERVICE, OPEN_COLLECTION};
    backend
        .run_service_method(COLLECTION_SERVICE, CLOSE_COLLECTION, &[])
        .map_err(|_| fail("device_collection_failed"))?;
    let open = CollectionOpenCollectionRequest {
        collection_path: root.join("collection.anki2").to_string_lossy().into(),
        media_folder_path: root.join("collection.media").to_string_lossy().into(),
        media_db_path: root.join("collection.mdb").to_string_lossy().into(),
    }
    .encode_to_vec();
    // A panic must still reopen the public Backend before the outer FFI boundary catches it.
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut col = anki::collection::CollectionBuilder::new(root.join("collection.anki2"))
            .set_media_paths(root.join("collection.media"), root.join("collection.mdb"))
            .build()?;
        let result = operation(&mut col);
        if !col.storage.db().is_autocommit() {
            col.storage.db().execute_batch("rollback")?;
        }
        col.close(None)?;
        result
    }));
    backend
        .run_service_method(COLLECTION_SERVICE, OPEN_COLLECTION, &open)
        .map_err(|_| fail("device_collection_recovery"))?;
    if has_pending(root) {
        recover_pending(backend)?;
    }
    match outcome {
        Ok(result) => result,
        Err(panic) => std::panic::resume_unwind(panic),
    }
}

/// Called before normal cloud synchronization and after opening a collection.
#[cfg(feature = "anki-core")]
pub fn recover(backend: &Backend) -> std::result::Result<(), crate::BackendFailure> {
    recover_pending(backend).map_err(native_error)
}

#[cfg(feature = "anki-core")]
pub fn has_pending(root: &Path) -> bool {
    root.join(".device-collection/collection-commit.json")
        .exists()
        || root.join(".device-collection/media-commit.json").exists()
}

#[cfg(feature = "anki-core")]
fn recover_pending(backend: &Backend) -> Result<()> {
    let Ok(root) = root_for(backend) else {
        return Ok(());
    };
    if root
        .join(".device-collection/collection-commit.json")
        .exists()
    {
        let rows = backend
            .run_db_command_bytes(
                br#"{"kind":"query","sql":"select mod from col","args":[],"first_row_only":false}"#,
            )
            .map_err(|_| fail("device_collection_recovery"))?;
        let rows: Value = serde_json::from_slice(&rows)?;
        let modified = rows[0][0]
            .as_i64()
            .ok_or_else(|| fail("device_collection_recovery"))?;
        snapshot::recover(&root, modified)?;
    }
    media::recover(&root)?;
    Ok(())
}

#[cfg(feature = "anki-core")]
fn native_error(error: Box<dyn std::error::Error + Send + Sync>) -> crate::BackendFailure {
    let message = error.to_string();
    let keys = [
        "device_collection_invalid",
        "device_collection_too_large",
        "device_collection_full_required",
        "device_collection_filtered",
        "device_collection_record_conflict",
        "device_collection_recovery",
    ];
    let key = keys
        .iter()
        .find(|key| message.contains(**key))
        .copied()
        .unwrap_or("device_collection_failed");
    crate::BackendFailure::Backend(
        crate::protocol_generated::BackendBackendError {
            message: key.into(),
            context: message,
            ..Default::default()
        }
        .encode_to_vec(),
    )
}

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &Backend,
    method: u32,
    input: &[u8],
) -> std::result::Result<Vec<u8>, crate::BackendFailure> {
    let result = (|| -> Result<Vec<u8>> {
        use crate::protocol_generated::GenericString;
        let value = GenericString::decode(input)?;
        if value.val.len() > 4096 {
            return Err(fail("device_collection_invalid"));
        }
        let request: Request = serde_json::from_str(&value.val)?;
        let root = root_for(backend)?;
        let folder = root.join(".device-collection");
        fs::create_dir_all(&folder)?;
        recover_pending(backend)?;
        let path = packet(&root, &request.token)?;
        let summary = match method {
            0 => {
                if !valid_id(&request.own) {
                    return Err(fail("device_collection_invalid"));
                }
                with_collection(backend, &root, |col| {
                    snapshot::export(col, &root, &request, &path)
                })?
            }
            1 => {
                if !valid_id(&request.own) {
                    return Err(fail("device_collection_invalid"));
                }
                with_collection(backend, &root, |col| snapshot::apply(col, &root, &request))?
            }
            2 => {
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)?;
                Summary::default()
            }
            3 => media::plan(&root, &request)?,
            4 => media::pack(&root, &request)?,
            5 => media::confirm(&root, &snapshot::read_snapshot(&path)?)?,
            _ => return Err(fail("device_collection_invalid")),
        };
        Ok(GenericString {
            val: serde_json::to_string(&summary)?,
        }
        .encode_to_vec())
    })();
    result.map_err(native_error)
}
