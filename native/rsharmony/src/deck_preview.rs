// SPDX-License-Identifier: AGPL-3.0-or-later
//! Application-owned preview RPC, separate from the locked upstream service IDs.
use prost::Message;

pub const SERVICE: u32 = 1001;

#[derive(Clone, PartialEq, Message)]
pub struct Request {
    #[prost(int64, tag = "1")]
    pub deck_id: i64,
    // 0 remaining today, 1 due now, 2 answered today, 3 all.
    #[prost(uint32, tag = "2")]
    pub scope: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct Response {
    #[prost(int64, repeated, packed = "true", tag = "1")]
    pub card_ids: Vec<i64>,
}

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &anki::backend::Backend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, crate::BackendFailure> {
    let request = Request::decode(input).map_err(|_| invalid())?;
    if method != 0 || request.deck_id <= 0 || request.scope > 3 {
        return Err(invalid());
    }
    let card_ids = backend
        .deck_preview_ids(request.deck_id, request.scope)
        .map_err(crate::BackendFailure::Backend)?;
    Ok(Response { card_ids }.encode_to_vec())
}

#[cfg(feature = "anki-core")]
fn invalid() -> crate::BackendFailure {
    #[derive(Clone, PartialEq, Message)]
    struct Error {
        #[prost(string, tag = "1")]
        localized: String,
    }
    crate::BackendFailure::Backend(
        Error {
            localized: "Invalid deck preview request".to_owned(),
        }
        .encode_to_vec(),
    )
}
