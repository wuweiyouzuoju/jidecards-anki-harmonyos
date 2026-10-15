// SPDX-License-Identifier: AGPL-3.0-or-later
//! Local file tokens only; the Core adapter owns review/state validation and transactions.
pub const SERVICE: u32 = crate::private_rpc_ids::PEER_PROGRESS;

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &anki::backend::Backend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, crate::BackendFailure> {
    use crate::protocol_generated::{BackendBackendError, GenericString};
    use prost::Message;
    let invalid = || {
        crate::BackendFailure::Backend(
            BackendBackendError {
                message: "device_progress_invalid".into(),
                ..Default::default()
            }
            .encode_to_vec(),
        )
    };
    let request = GenericString::decode(input).map_err(|_| invalid())?;
    if method > 2 {
        return Err(invalid());
    }
    let val = backend
        .peer_progress_file(&request.val, method)
        .map_err(crate::BackendFailure::Backend)?;
    Ok(GenericString { val }.encode_to_vec())
}
