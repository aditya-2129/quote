//! Versioned JSON wire format for topology payloads.

use super::topology::TopologyPayload;
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};

pub const TOPOLOGY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopologyEnvelope {
    pub version: u32,
    pub topology: TopologyPayload,
}

pub fn wrap_topology(topology: TopologyPayload) -> TopologyEnvelope {
    TopologyEnvelope {
        version: TOPOLOGY_SCHEMA_VERSION,
        topology,
    }
}

#[cfg(test)]
pub fn serialize_topology(topology: &TopologyPayload) -> Result<String, serde_json::Error> {
    serde_json::to_string(&TopologyEnvelope {
        version: TOPOLOGY_SCHEMA_VERSION,
        topology: topology.clone(),
    })
}

#[cfg(test)]
pub fn deserialize_topology(json: &str) -> Result<TopologyPayload, String> {
    let envelope: TopologyEnvelope =
        serde_json::from_str(json).map_err(|e| format!("Invalid topology envelope JSON: {e}"))?;
    if envelope.version != TOPOLOGY_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported topology schema version {}; expected {}",
            envelope.version, TOPOLOGY_SCHEMA_VERSION
        ));
    }
    Ok(envelope.topology)
}

pub fn topology_schema_json() -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(&schema_for!(TopologyEnvelope))
}

#[tauri::command]
pub fn topology_payload_schema() -> Result<String, String> {
    topology_schema_json().map_err(|e| format!("Failed to generate topology schema: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cad::topology::extract_topology_from_bytes;
    use std::path::Path;

    fn public_fixture_path(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("public")
            .join("test_files")
            .join(name)
    }

    fn load_fixture(name: &str) -> Vec<u8> {
        let path = public_fixture_path(name);
        std::fs::read(&path)
            .unwrap_or_else(|e| panic!("Cannot read fixture {}: {e}", path.display()))
    }

    #[test]
    fn envelope_round_trips_without_payload_loss() {
        let topology =
            extract_topology_from_bytes(&load_fixture("Pump Manifold v3.step")).expect("topology");
        let json = serialize_topology(&topology).expect("serialize");
        let parsed = deserialize_topology(&json).expect("deserialize");

        assert_eq!(topology, parsed);
    }

    #[test]
    fn ignores_unknown_future_fields() {
        let topology =
            extract_topology_from_bytes(&load_fixture("Pump Manifold v3.step")).expect("topology");
        let mut value =
            serde_json::to_value(wrap_topology(topology.clone())).expect("serialize value");
        value["future_root"] = serde_json::json!({ "ignored": true });
        value["topology"]["future_topology_field"] = serde_json::json!("ignored");
        value["topology"]["faces"][0]["future_face_field"] = serde_json::json!(123);

        let parsed = deserialize_topology(&value.to_string()).expect("unknown fields ignored");

        assert_eq!(topology, parsed);
    }

    #[test]
    fn rejects_unsupported_schema_version() {
        let topology =
            extract_topology_from_bytes(&load_fixture("Pump Manifold v3.step")).expect("topology");
        let mut value = serde_json::to_value(wrap_topology(topology)).expect("serialize value");
        value["version"] = serde_json::json!(999);

        let err = deserialize_topology(&value.to_string()).expect_err("version should reject");

        assert!(err.contains("Unsupported topology schema version"));
    }

    #[test]
    fn generated_schema_contains_versioned_envelope() {
        let schema = topology_schema_json().expect("schema");

        assert!(schema.contains("\"version\""));
        assert!(schema.contains("\"topology\""));
        assert!(schema.contains("TopologyEnvelope"));
    }

    #[test]
    fn payload_size_stays_under_typical_part_target() {
        let fixture_names = [
            "FIXTURE PS_1250 ROUND BLOCKS.stp",
            "LOCUS SYSTEMS MACHINE FIXTURE.stp",
            "PS_1250_FIXTURE BLOCKS.stp",
            "Pump Manifold v3.step",
            "TEST BUTTON_9 CAVITY_29X12 (1).stp",
        ];
        let mut sizes = Vec::new();

        for fixture_name in fixture_names {
            let topology =
                extract_topology_from_bytes(&load_fixture(fixture_name)).expect(fixture_name);
            let json = serialize_topology(&topology).expect("serialize");
            sizes.push((fixture_name, json.len()));
        }

        for (fixture_name, size) in &sizes {
            eprintln!("topology envelope size: {fixture_name}: {size} bytes");
            assert!(
                *size < 2_000_000,
                "{fixture_name} topology payload should stay under 2 MB, got {size}"
            );
        }
    }
}
