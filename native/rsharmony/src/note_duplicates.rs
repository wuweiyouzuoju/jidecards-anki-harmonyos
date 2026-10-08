// SPDX-License-Identifier: AGPL-3.0-or-later
//! Bounded, read-only field batches over the locked Core DB proxy.
#[cfg(feature = "anki-core")]
use prost::Message;

pub const SERVICE: u32 = crate::private_rpc_ids::NOTE_DUPLICATES;
pub const BATCH_SIZE: usize = 200;

pub use crate::protocol_generated::JideNoteDuplicateRequest as Request;

pub use crate::protocol_generated::JideDuplicateField as Field;

pub use crate::protocol_generated::JideNoteDuplicateResponse as Response;

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &anki::backend::Backend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, crate::BackendFailure> {
    let request = Request::decode(input).map_err(|_| invalid())?;
    if method != crate::private_rpc_ids::NOTE_DUPLICATES_FIELDS
        || request.note_ids.is_empty()
        || request.note_ids.len() > BATCH_SIZE
        || request.notetype_id <= 0
        || request.note_ids.iter().any(|id| *id <= 0)
        || request
            .note_ids
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != request.note_ids.len()
    {
        return Err(invalid());
    }
    // Only validated numeric IDs enter this fixed SELECT. No caller-provided SQL.
    let ids = request
        .note_ids
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let query = serde_json::json!({
        "kind": "query",
        "sql": format!("select id, mid, flds from notes where id in ({ids}) order by id"),
        "args": [], "first_row_only": false
    });
    let bytes = backend
        .run_db_command_bytes(query.to_string().as_bytes())
        .map_err(crate::BackendFailure::Backend)?;
    let rows: Vec<(i64, i64, String)> = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if rows.len() != request.note_ids.len() {
        return Err(invalid());
    }
    let mut fields = Vec::with_capacity(rows.len());
    for (note_id, mid, contents) in rows {
        if mid != request.notetype_id {
            return Err(invalid());
        }
        let field = contents
            .split('\u{1f}')
            .nth(request.field_ord as usize)
            .ok_or_else(invalid)?;
        fields.push(Field {
            note_id,
            value: anki::text::strip_html_preserving_media_filenames(field).into_owned(),
        });
    }
    Ok(Response { fields }.encode_to_vec())
}

#[cfg(feature = "anki-core")]
fn invalid() -> crate::BackendFailure {
    use crate::protocol_generated::BackendBackendError as Error;
    crate::BackendFailure::Backend(
        Error {
            message: "Duplicate scan failed: invalid batch or notes changed; retry the search"
                .to_owned(),
            ..Default::default()
        }
        .encode_to_vec(),
    )
}
