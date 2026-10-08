// SPDX-License-Identifier: AGPL-3.0-or-later
use prost_reflect::{DescriptorPool, DynamicMessage, Kind};
use serde_json::{json, Value};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let pool = DescriptorPool::decode(std::fs::read(&args[1])?.as_ref())?;
    let (_, services) = anki_proto_gen::get_services(&pool);
    let services: Vec<Value> = services.iter().map(|s| json!({
        "name": s.name, "id": s.index, "ownMethodCount": s.trait_methods.len(),
        "methods": s.all_methods().map(|m| json!({"name": m.name, "id": m.index,
            "input": m.proto.input().full_name(), "output": m.proto.output().full_name(),
            "protoIndex": m.proto.index(), "declaringService": m.proto.parent_service().full_name(),
            "delegated": s.delegating_methods.iter().any(|d| d.index == m.index)})).collect::<Vec<_>>()
    })).collect();
    let messages: Vec<Value> = pool.all_messages().map(|m| json!({
        "name": m.full_name(), "file": m.parent_file().name(), "mapEntry": m.is_map_entry(),
        "fields": m.fields().map(|f| {
            let (kind, target) = match f.kind() {
                Kind::Message(m) => ("message".to_string(), Some(m.full_name().to_string())),
                Kind::Enum(e) => ("enum".to_string(), Some(e.full_name().to_string())),
                k => (format!("{k:?}").to_lowercase(), None),
            };
            json!({"name": f.name(), "jsonName": f.json_name(), "id": f.number(),
                "kind": kind, "target": target, "list": f.is_list(), "map": f.is_map(),
                "packed": f.is_packed(), "presence": f.supports_presence(),
                "optional": f.field_descriptor_proto().proto3_optional(),
                "oneof": f.containing_oneof().filter(|_| !f.field_descriptor_proto().proto3_optional()).map(|o| o.name().to_string()),
                "explicitDefault": f.field_descriptor_proto().default_value.clone(),
                "default": format!("{:?}", DynamicMessage::new(m.clone()).get_field(&f).as_ref())})
        }).collect::<Vec<_>>()
    })).collect();
    let enums: Vec<Value> = pool.all_enums().map(|e| json!({"name": e.full_name(),
        "values": e.values().map(|v| json!({"name": v.name(), "number": v.number()})).collect::<Vec<_>>()
    })).collect();
    std::fs::write(
        &args[2],
        serde_json::to_string_pretty(&json!({"services": services,
        "files": pool.file_descriptor_protos().map(|f| f.name()).collect::<Vec<_>>(),
        "messages": messages, "enums": enums}))?
            + "\n",
    )?;
    Ok(())
}
