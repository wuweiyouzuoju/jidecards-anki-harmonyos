// SPDX-License-Identifier: AGPL-3.0-or-later
//! Read-only GUID resolution and metadata inventory. Writes remain Core UpdateNotes operations.
#[cfg(feature = "anki-core")]
use prost::Message;
pub const SERVICE: u32 = crate::private_rpc_ids::NOTE_LINKS;

#[cfg(feature = "anki-core")]
pub fn call(
    backend: &anki::backend::Backend,
    method: u32,
    input: &[u8],
) -> Result<Vec<u8>, crate::BackendFailure> {
    use crate::protocol_generated::GenericString;
    let request = GenericString::decode(input).map_err(|_| invalid())?;
    // Do not serialize every field and its derived mirror just to read a small
    // graph. Extract the first-field title and metadata inside SQLite.
    let title = "case when instr(n.flds,char(31))>0 then substr(n.flds,1,instr(n.flds,char(31))-1) else n.flds end";
    let tail = "substr(n.flds,instr(n.flds,'<!--jide-links:'))";
    let (sql, args) = match method {
        crate::private_rpc_ids::NOTE_LINKS_GRAPH => (
            format!("select n.id,n.guid,{title},substr({tail},1,instr({tail},'-->')+2),(length(n.flds)-length(replace(n.flds,'<!--jide-links:','')))/length('<!--jide-links:') from notes n where instr(n.flds,'<!--jide-links:')>0 order by n.id"),
            serde_json::json!([]),
        ),
        crate::private_rpc_ids::NOTE_LINKS_RESOLVE => {
            let guids: Vec<String> = serde_json::from_str(&request.val).map_err(|_| invalid())?;
            if guids.is_empty()
                || guids.len() > 200
                || guids.iter().any(|g| g.is_empty() || g.len() > 128)
            {
                return Err(invalid());
            }
            (format!("select n.id,n.guid,{title},coalesce((select group_concat(id) from (select c.id from cards c where c.nid=n.id order by c.ord,c.id)),'') from notes n where n.guid in ({}) order by n.id", vec!["?";guids.len()].join(",")), serde_json::json!(guids))
        }
        _ => return Err(invalid()),
    };
    let query = serde_json::json!({"kind":"query","sql":sql,"args":args,"first_row_only":false});
    let bytes = backend
        .run_db_command_bytes(query.to_string().as_bytes())
        .map_err(crate::BackendFailure::Backend)?;
    let rows: Vec<Vec<serde_json::Value>> =
        serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    let mut items = Vec::new();
    for row in rows {
        let title =
            anki::text::strip_html_preserving_media_filenames(row[2].as_str().ok_or_else(invalid)?)
                .into_owned();
        let mut item = serde_json::json!({"noteId":row[0],"guid":row[1],"title":title});
        if method == crate::private_rpc_ids::NOTE_LINKS_GRAPH {
            let metadata = row[3].as_str().ok_or_else(invalid)?;
            if row[4].as_i64() != Some(1) || !metadata.ends_with("-->") {
                return Err(invalid());
            }
            item["metadata"] = serde_json::json!(metadata);
        } else {
            let ids = row[3]
                .as_str()
                .unwrap_or("")
                .split(',')
                .filter(|id| !id.is_empty())
                .map(str::parse::<i64>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| invalid())?;
            item["cardIds"] = serde_json::json!(ids);
        }
        items.push(item);
    }
    Ok(GenericString {
        val: serde_json::to_string(&items).map_err(|_| invalid())?,
    }
    .encode_to_vec())
}
#[cfg(feature = "anki-core")]
fn invalid() -> crate::BackendFailure {
    use crate::protocol_generated::BackendBackendError;
    crate::BackendFailure::Backend(
        BackendBackendError {
            message: "Invalid note link request or damaged metadata".into(),
            ..Default::default()
        }
        .encode_to_vec(),
    )
}
