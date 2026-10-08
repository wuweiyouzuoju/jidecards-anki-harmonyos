// SPDX-License-Identifier: AGPL-3.0-or-later
//! Application-owned preview RPC, separate from the locked upstream service IDs.
#[cfg(feature = "anki-core")]
use prost::Message;

pub const SERVICE: u32 = crate::private_rpc_ids::DECK_PREVIEW;

pub use crate::protocol_generated::JideDeckPreviewRequest as Request;

pub use crate::protocol_generated::JideDeckPreviewResponse as Response;

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &anki::backend::Backend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, crate::BackendFailure> {
    let request = Request::decode(input).map_err(|_| invalid())?;
    if method != crate::private_rpc_ids::DECK_PREVIEW_IDS
        || request.deck_id <= 0
        || request.scope > 3
    {
        return Err(invalid());
    }
    let card_ids = backend
        .deck_preview_ids(request.deck_id, request.scope)
        .map_err(crate::BackendFailure::Backend)?;
    Ok(Response { card_ids }.encode_to_vec())
}

#[cfg(feature = "anki-core")]
fn invalid() -> crate::BackendFailure {
    use crate::protocol_generated::BackendBackendError as Error;
    crate::BackendFailure::Backend(
        Error {
            message: "Invalid deck preview request".to_owned(),
            ..Default::default()
        }
        .encode_to_vec(),
    )
}
