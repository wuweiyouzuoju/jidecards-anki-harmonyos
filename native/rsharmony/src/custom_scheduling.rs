// SPDX-License-Identifier: AGPL-3.0-or-later
//! The only state/JSON boundary for custom scheduling. Unchanged wire fields stay opaque.
//! Schema follows UPSTREAM.lock: anki/scheduler.proto and cards.FsrsMemoryState.
use crate::BackendFailure;
use prost::Message;
use serde_json::{json, Map, Value};

pub const SERVICE: u32 = 1004;
const LIMIT: usize = 65_536;

#[derive(Clone, PartialEq, Message)]
pub struct Request {
    #[prost(bytes = "vec", tag = "1")]
    pub states: Vec<u8>,
    #[prost(bytes = "vec", tag = "2")]
    pub context: Vec<u8>,
    #[prost(string, tag = "3")]
    pub custom_data: String,
    #[prost(string, tag = "4")]
    pub result_json: String,
}

#[derive(Clone, PartialEq, Message)]
struct Text {
    #[prost(string, tag = "1")]
    value: String,
}

#[derive(Clone, Copy)]
enum Kind {
    Uint,
    Seed,
    Float,
    Bool,
    Text,
    Node(&'static str),
}
#[derive(Clone, Copy)]
struct Field {
    id: u32,
    name: &'static str,
    kind: Kind,
    optional: bool,
}
fn field(id: u32, name: &'static str, kind: Kind) -> Field {
    Field {
        id,
        name,
        kind,
        optional: false,
    }
}
fn optional(id: u32, name: &'static str, kind: Kind) -> Field {
    Field {
        id,
        name,
        kind,
        optional: true,
    }
}
fn schema(node: &str) -> Vec<Field> {
    use Kind::*;
    match node {
        "states" => vec![
            field(1, "current", Node("state")),
            field(2, "again", Node("state")),
            field(3, "hard", Node("state")),
            field(4, "good", Node("state")),
            field(5, "easy", Node("state")),
        ],
        "state" => vec![
            optional(1, "normal", Node("normal")),
            optional(2, "filtered", Node("filtered")),
            optional(3, "customData", Text),
        ],
        "normal" => vec![
            optional(1, "new", Node("new")),
            optional(2, "learning", Node("learning")),
            optional(3, "review", Node("review")),
            optional(4, "relearning", Node("relearning")),
        ],
        "filtered" => vec![
            optional(1, "preview", Node("preview")),
            optional(2, "rescheduling", Node("rescheduling")),
        ],
        "new" => vec![field(1, "position", Uint)],
        "learning" => vec![
            field(1, "remainingSteps", Uint),
            field(2, "scheduledSecs", Uint),
            field(3, "elapsedSecs", Uint),
            optional(6, "memoryState", Node("memory")),
        ],
        "review" => vec![
            field(1, "scheduledDays", Uint),
            field(2, "elapsedDays", Uint),
            field(3, "easeFactor", Float),
            field(4, "lapses", Uint),
            field(5, "leeched", Bool),
            optional(6, "memoryState", Node("memory")),
        ],
        "relearning" => vec![
            field(1, "review", Node("review")),
            field(2, "learning", Node("learning")),
        ],
        "preview" => vec![field(1, "scheduledSecs", Uint), field(2, "finished", Bool)],
        "rescheduling" => vec![field(1, "originalState", Node("normal"))],
        "memory" => vec![field(1, "stability", Float), field(2, "difficulty", Float)],
        "context" => vec![
            field(1, "deckName", Text),
            field(2, "seed", Seed),
            optional(3, "decay", Float),
            optional(4, "desiredRetention", Float),
        ],
        _ => unreachable!(),
    }
}

struct Wire<'a> {
    id: u32,
    wire: u8,
    raw: &'a [u8],
    payload: &'a [u8],
}
fn varint(bytes: &[u8], pos: &mut usize) -> Result<u64, BackendFailure> {
    let mut value = 0u64;
    for shift in (0..70).step_by(7) {
        let byte = *bytes.get(*pos).ok_or_else(invalid)?;
        *pos += 1;
        if shift == 63 && byte > 1 {
            return Err(invalid());
        }
        value |= u64::from(byte & 127) << shift;
        if byte < 128 {
            return Ok(value);
        }
    }
    Err(invalid())
}
fn fields(bytes: &[u8]) -> Result<Vec<Wire<'_>>, BackendFailure> {
    let mut pos = 0;
    let mut out = vec![];
    while pos < bytes.len() {
        let start = pos;
        let tag = varint(bytes, &mut pos)?;
        let id = u32::try_from(tag >> 3).map_err(|_| invalid())?;
        if id == 0 {
            return Err(invalid());
        }
        let wire = (tag & 7) as u8;
        let payload_start;
        match wire {
            0 => {
                payload_start = pos;
                varint(bytes, &mut pos)?;
            }
            1 | 5 => {
                payload_start = pos;
                pos += if wire == 1 { 8 } else { 4 };
            }
            2 => {
                let len = usize::try_from(varint(bytes, &mut pos)?).map_err(|_| invalid())?;
                payload_start = pos;
                pos = pos.checked_add(len).ok_or_else(invalid)?;
            }
            _ => return Err(invalid()),
        }
        if pos > bytes.len() {
            return Err(invalid());
        }
        out.push(Wire {
            id,
            wire,
            raw: &bytes[start..pos],
            payload: &bytes[payload_start..pos],
        });
    }
    Ok(out)
}
fn default_value(kind: Kind) -> Value {
    match kind {
        Kind::Uint | Kind::Float => json!(0),
        Kind::Seed => json!("0"),
        Kind::Bool => json!(false),
        Kind::Text => json!(""),
        Kind::Node(_) => Value::Null,
    }
}
fn decode(bytes: &[u8], node: &str) -> Result<Value, BackendFailure> {
    let definitions = schema(node);
    let mut object = Map::new();
    for f in &definitions {
        if !f.optional && !matches!(f.kind, Kind::Node(_)) {
            object.insert(f.name.into(), default_value(f.kind));
        }
    }
    for w in fields(bytes)? {
        let Some(f) = definitions.iter().find(|f| f.id == w.id) else {
            continue;
        };
        let expected = match f.kind {
            Kind::Float => 5,
            Kind::Text | Kind::Node(_) => 2,
            _ => 0,
        };
        if w.wire != expected {
            return Err(invalid());
        }
        let value = match f.kind {
            Kind::Uint => {
                let n = varint(w.payload, &mut 0)?;
                if n > u64::from(u32::MAX) {
                    return Err(invalid());
                }
                json!(n)
            }
            Kind::Seed => json!(varint(w.payload, &mut 0)?.to_string()),
            Kind::Bool => json!(varint(w.payload, &mut 0)? != 0),
            Kind::Float => {
                let n = f32::from_le_bytes(w.payload.try_into().map_err(|_| invalid())?);
                if !n.is_finite() {
                    return Err(invalid());
                }
                json!(n)
            }
            Kind::Text => json!(std::str::from_utf8(w.payload).map_err(|_| invalid())?),
            Kind::Node(child) => decode(w.payload, child)?,
        };
        object.insert(f.name.into(), value);
    }
    Ok(Value::Object(object))
}
fn validate(value: &Value, node: &str) -> Result<(), BackendFailure> {
    let object = value.as_object().ok_or_else(invalid)?;
    let definitions = schema(node);
    if object
        .keys()
        .any(|key| !definitions.iter().any(|f| f.name == key))
    {
        return Err(invalid());
    }
    if matches!(node, "state" | "normal" | "filtered")
        && definitions
            .iter()
            .filter(|f| {
                matches!(f.kind, Kind::Node(_)) && object.get(f.name).is_some_and(|v| !v.is_null())
            })
            .count()
            != 1
    {
        return Err(invalid());
    }
    for f in definitions {
        if object.get(f.name).is_some_and(|v| v.is_null()) && !matches!(f.kind, Kind::Node(_)) {
            return Err(invalid());
        }
        let Some(v) = object.get(f.name).filter(|v| !v.is_null()) else {
            if matches!(f.kind, Kind::Node(_)) && !f.optional {
                return Err(invalid());
            }
            continue;
        };
        match f.kind {
            Kind::Node(child) => validate(v, child)?,
            Kind::Uint if v.as_u64().is_some_and(|n| n <= u64::from(u32::MAX)) => (),
            Kind::Float
                if v.as_f64()
                    .is_some_and(|n| n >= 0.0 && (n as f32).is_finite()) => {}
            Kind::Bool if v.is_boolean() => (),
            Kind::Seed if v.as_str().is_some_and(|n| n.parse::<u64>().is_ok()) => (),
            Kind::Text if v.is_string() => {
                if f.name == "customData" {
                    let text = v.as_str().unwrap();
                    if text.is_empty() {
                        continue;
                    }
                    let data: Value = serde_json::from_str(text).map_err(|_| invalid())?;
                    if text.len() > 100
                        || !data
                            .as_object()
                            .is_some_and(|m| m.keys().all(|k| k.len() <= 8))
                    {
                        return Err(invalid());
                    }
                }
            }
            _ => return Err(invalid()),
        }
    }
    Ok(())
}
fn push_varint(mut n: u64, out: &mut Vec<u8>) {
    while n >= 128 {
        out.push((n as u8 & 127) | 128);
        n >>= 7;
    }
    out.push(n as u8);
}
fn encode_field(
    f: Field,
    value: &Value,
    original: &[u8],
    out: &mut Vec<u8>,
) -> Result<(), BackendFailure> {
    match f.kind {
        Kind::Uint | Kind::Bool => {
            push_varint(u64::from(f.id) * 8, out);
            push_varint(
                if matches!(f.kind, Kind::Bool) {
                    u64::from(value.as_bool().ok_or_else(invalid)?)
                } else {
                    value.as_u64().ok_or_else(invalid)?
                },
                out,
            );
        }
        Kind::Float => {
            push_varint(u64::from(f.id) * 8 + 5, out);
            out.extend_from_slice(&(value.as_f64().ok_or_else(invalid)? as f32).to_le_bytes());
        }
        Kind::Text | Kind::Node(_) => {
            let payload = match f.kind {
                Kind::Text => value.as_str().ok_or_else(invalid)?.as_bytes().to_vec(),
                Kind::Node(child) => patch(original, child, value)?,
                _ => unreachable!(),
            };
            push_varint(u64::from(f.id) * 8 + 2, out);
            push_varint(payload.len() as u64, out);
            out.extend(payload);
        }
        Kind::Seed => return Err(invalid()),
    }
    Ok(())
}
/// Replace only changed known fields, preserving all other bytes including unknown nested fields.
fn equal_json(a: &Value, b: &Value) -> bool {
    if a.is_number() && b.is_number() {
        return a.as_f64() == b.as_f64();
    }
    if let (Some(a), Some(b)) = (a.as_object(), b.as_object()) {
        return a.len() == b.len()
            && a.iter()
                .all(|(k, v)| b.get(k).is_some_and(|w| equal_json(v, w)));
    }
    a == b
}
fn patch(bytes: &[u8], node: &str, after: &Value) -> Result<Vec<u8>, BackendFailure> {
    let before = decode(bytes, node)?;
    let wires = fields(bytes)?;
    let definitions = schema(node);
    let changed: Vec<Field> = definitions
        .into_iter()
        .filter(|f| {
            let fallback = if f.optional || matches!(f.kind, Kind::Node(_)) {
                Value::Null
            } else {
                default_value(f.kind)
            };
            !equal_json(
                before.get(f.name).unwrap_or(&fallback),
                after
                    .get(f.name)
                    .filter(|v| !v.is_null())
                    .unwrap_or(&fallback),
            )
        })
        .collect();
    let mut out = vec![];
    for w in &wires {
        if !changed.iter().any(|f| f.id == w.id) {
            out.extend_from_slice(w.raw);
        }
    }
    for f in changed {
        if let Some(v) = after.get(f.name).filter(|v| !v.is_null()) {
            let original = wires
                .iter()
                .rev()
                .find(|w| w.id == f.id)
                .map(|w| w.payload)
                .unwrap_or(&[]);
            encode_field(f, v, original, &mut out)?;
        }
    }
    Ok(out)
}
pub fn call(method: u32, input: &[u8]) -> Result<Vec<u8>, BackendFailure> {
    if input.len() > LIMIT * 3 {
        return Err(invalid());
    }
    let request = Request::decode(input).map_err(|_| invalid())?;
    if request.states.len() > LIMIT
        || request.context.len() > LIMIT
        || request.result_json.len() > LIMIT
    {
        return Err(invalid());
    }
    let mut before = decode(&request.states, "states")?;
    validate(&before, "states")?;
    // Card.custom_data is supplied by Core with the queue; current_state itself stays untouched.
    before["current"]["customData"] = json!(request.custom_data);
    if method == 0 {
        let value = json!({"states":before,"ctx":decode(&request.context,"context")?});
        return Ok(Text {
            value: value.to_string(),
        }
        .encode_to_vec());
    }
    if method != 1 {
        return Err(invalid());
    }
    let after: Value = serde_json::from_str(&request.result_json).map_err(|_| invalid())?;
    validate(&after, "states")?;
    if !equal_json(&after["current"], &before["current"]) {
        return Err(invalid());
    }
    // Do not serialize seeded current customData or round-trip its oneof.
    let mut after = after;
    after["current"] = decode(&request.states, "states")?["current"].clone();
    patch(&request.states, "states", &after)
}
fn invalid() -> BackendFailure {
    BackendFailure::Backend(
        Text {
            value: "custom_scheduling_invalid_state".into(),
        }
        .encode_to_vec(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Request {
        let state = json!({"normal":{"review":{"scheduledDays":10,"elapsedDays":2,
            "easeFactor":2.5,"lapses":0,"leeched":false}}});
        let states = json!({"current":state,"again":state,"hard":state,"good":state,"easy":state});
        let bytes = patch(&[], "states", &states).unwrap();
        Request {
            states: bytes,
            context: vec![16, 255, 255, 255, 255, 255, 255, 255, 255, 255, 1],
            custom_data: r#"{"c":1}"#.into(),
            result_json: String::new(),
        }
    }
    fn input(request: &Request) -> Value {
        let bytes = call(0, &request.encode_to_vec()).unwrap();
        serde_json::from_str(&Text::decode(bytes.as_slice()).unwrap().value).unwrap()
    }
    #[test]
    fn no_op_keeps_all_bytes_and_float_defaults_and_full_uint64_context() {
        let mut request = fixture();
        request.states.extend_from_slice(&[0xf8, 0x07, 42]);
        let value = input(&request);
        assert_eq!(value["ctx"]["seed"], u64::MAX.to_string());
        request.result_json = value["states"].to_string();
        assert_eq!(call(1, &request.encode_to_vec()).unwrap(), request.states);
    }
    #[test]
    fn changed_review_keeps_unknown_nested_bytes_and_other_candidates() {
        let mut request = fixture();
        let review = &decode(&request.states, "states").unwrap()["good"]["normal"]["review"];
        let mut bytes = patch(&[], "review", review).unwrap();
        bytes.extend_from_slice(&[0xf8, 0x07, 42]);
        let mut normal = vec![];
        encode_field(
            field(3, "review", Kind::Node("review")),
            review,
            &bytes,
            &mut normal,
        )
        .unwrap();
        let mut state = vec![];
        encode_field(
            field(1, "normal", Kind::Node("normal")),
            &json!({"review":review}),
            &normal,
            &mut state,
        )
        .unwrap();
        let mut states = vec![];
        for w in fields(&request.states).unwrap() {
            if w.id != 4 {
                states.extend_from_slice(w.raw);
            }
        }
        push_varint(34, &mut states);
        push_varint(state.len() as u64, &mut states);
        states.extend(state);
        request.states = states;
        let mut value = input(&request)["states"].clone();
        value["good"]["normal"]["review"]["scheduledDays"] = json!(123);
        value["good"]["customData"] = json!(r#"{"c":2}"#);
        request.result_json = value.to_string();
        let result = call(1, &request.encode_to_vec()).unwrap();
        assert_eq!(
            decode(&result, "states").unwrap()["good"]["normal"]["review"]["scheduledDays"],
            123
        );
        assert!(result.windows(3).any(|w| w == [0xf8, 0x07, 42]));
        for id in [1, 2, 3, 5] {
            assert_eq!(
                fields(&result)
                    .unwrap()
                    .iter()
                    .find(|w| w.id == id)
                    .unwrap()
                    .raw,
                fields(&request.states)
                    .unwrap()
                    .iter()
                    .find(|w| w.id == id)
                    .unwrap()
                    .raw
            );
        }
    }
    #[test]
    fn invalid_results_fail_atomically_without_changing_inputs() {
        let request = fixture();
        let before = input(&request)["states"].clone();
        for (path, bad) in [
            (vec!["good", "normal", "review", "scheduledDays"], json!(-1)),
            (
                vec!["good", "normal", "review", "scheduledDays"],
                json!(1.5),
            ),
            (vec!["good", "normal", "review", "easeFactor"], json!(1e100)),
            (
                vec!["good", "normal", "review", "scheduledDays"],
                Value::Null,
            ),
            (
                vec!["current", "normal", "review", "scheduledDays"],
                json!(123),
            ),
            (vec!["good", "customData"], json!(r#"{"longkeyxx":1}"#)),
            (vec!["good", "customData"], json!("[]")),
            (vec!["good", "normal", "review", "unknown"], json!(1)),
        ] {
            let mut result = before.clone();
            let mut target = &mut result;
            for key in &path[..path.len() - 1] {
                target = &mut target[*key];
            }
            target[path[path.len() - 1]] = bad;
            let mut bad_request = request.clone();
            bad_request.result_json = result.to_string();
            assert!(call(1, &bad_request.encode_to_vec()).is_err());
            assert_eq!(bad_request.states, request.states);
        }
        assert!(call(0, &Request::default().encode_to_vec()).is_err());
        let mut result = before;
        result["good"]["filtered"] = json!({"preview":{"scheduledSecs":60,"finished":false}});
        let mut bad = request;
        bad.result_json = result.to_string();
        assert!(call(1, &bad.encode_to_vec()).is_err());
    }
    #[test]
    fn filtered_rescheduling_and_preview_use_the_same_patch_boundary() {
        for filtered in [
            json!({"rescheduling":{"originalState":{"learning":{"remainingSteps":2,"scheduledSecs":60,"elapsedSecs":0}}}}),
            json!({"preview":{"scheduledSecs":60,"finished":false}}),
        ] {
            let state = json!({"filtered":filtered});
            let states =
                json!({"current":state,"again":state,"hard":state,"good":state,"easy":state});
            let mut request = Request {
                states: patch(&[], "states", &states).unwrap(),
                ..Default::default()
            };
            let mut result = input(&request)["states"].clone();
            if result["good"]["filtered"]["preview"].is_object() {
                result["good"]["filtered"]["preview"]["scheduledSecs"] = json!(180);
            } else {
                result["good"]["filtered"]["rescheduling"]["originalState"]["learning"]
                    ["scheduledSecs"] = json!(180);
            }
            request.result_json = result.to_string();
            let bytes = call(1, &request.encode_to_vec()).unwrap();
            assert_eq!(decode(&bytes, "states").unwrap()["good"], result["good"]);
        }
    }
}
