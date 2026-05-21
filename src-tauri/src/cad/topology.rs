//! BREP topology extraction via the narrow OCCT C++ shim.
//!
//! This module provides the `extract_topology` Tauri command that:
//!   1. Passes STEP bytes to the C++ shim (`topo_shim.cpp`).
//!   2. Receives a JSON payload with faces, edges, wires, and adjacency.
//!   3. Deserializes the payload into Rust types.
//!
//! The C++ boundary is intentionally narrow — four C functions — as
//! described in ADR 0003.

use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::os::raw::c_char;

// ── FFI declarations matching topo_shim.h ──────────────────────────────

#[repr(C)]
struct TopoResult {
    _opaque: [u8; 0],
}

extern "C" {
    fn topo_extract(step_data: *const u8, step_len: usize) -> *mut TopoResult;
    fn topo_result_json(result: *const TopoResult) -> *const c_char;
    fn topo_result_error(result: *const TopoResult) -> *const c_char;
    fn topo_result_free(result: *mut TopoResult);
}

// ── Public types ───────────────────────────────────────────────────────

/// Complete BREP topology payload returned by `extract_topology`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyPayload {
    /// All faces in the shape, with wire loops.
    pub faces: Vec<TopoFace>,
    /// All edges in the shape.
    pub edges: Vec<TopoEdge>,
    /// Face-edge adjacency: for each face, which edges bound it.
    pub adjacency: Vec<AdjacencyEntry>,
}

/// A single BREP face with its wire loops.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopoFace {
    /// Deterministic ID (stable across re-imports of the same STEP file).
    pub id: String,
    /// 1-based index in the OCCT topology map.
    pub index: u32,
    /// Wire loops bounding this face (outer + inner/hole loops).
    pub wires: Vec<TopoWire>,
}

/// A wire loop — an ordered sequence of edges forming a closed boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopoWire {
    /// Ordered edge IDs in this wire loop.
    pub edge_ids: Vec<String>,
    /// True if this is the outer boundary wire of the face.
    pub is_outer: bool,
}

/// A single BREP edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopoEdge {
    /// Deterministic ID (stable across re-imports of the same STEP file).
    pub id: String,
    /// 1-based index in the OCCT topology map.
    pub index: u32,
}

/// Face-edge adjacency entry: one face and all edges bounding it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdjacencyEntry {
    /// Face ID.
    pub face_id: String,
    /// All edge IDs that bound this face.
    pub adjacent_edge_ids: Vec<String>,
}

// ── Safe FFI wrapper ───────────────────────────────────────────────────

/// Extract BREP topology from STEP file bytes.
///
/// Calls the C++ shim, which uses OCCT to parse the STEP data and
/// extract faces, edges, wires, and adjacency with deterministic IDs.
fn extract_topology_from_bytes(step_bytes: &[u8]) -> Result<TopologyPayload, String> {
    if step_bytes.is_empty() {
        return Err("STEP data is empty".to_string());
    }

    unsafe {
        let result = topo_extract(step_bytes.as_ptr(), step_bytes.len());
        if result.is_null() {
            return Err("Topology extraction returned null (allocation failure)".to_string());
        }

        // Check for error
        let err_ptr = topo_result_error(result);
        if !err_ptr.is_null() {
            let err_msg = CStr::from_ptr(err_ptr)
                .to_string_lossy()
                .into_owned();
            topo_result_free(result);
            return Err(err_msg);
        }

        // Get JSON
        let json_ptr = topo_result_json(result);
        if json_ptr.is_null() {
            topo_result_free(result);
            return Err("Topology extraction produced no JSON output".to_string());
        }

        let json_str = CStr::from_ptr(json_ptr)
            .to_string_lossy()
            .into_owned();
        topo_result_free(result);

        // Deserialize
        serde_json::from_str::<TopologyPayload>(&json_str)
            .map_err(|e| format!("Failed to parse topology JSON: {e}"))
    }
}

// ── Tauri command ──────────────────────────────────────────────────────

/// Extract BREP topology from a STEP file.
///
/// Takes raw STEP file bytes and returns a `TopologyPayload` containing
/// faces, edges, wire loops, and face-edge adjacency with deterministic IDs.
///
/// This runs on a blocking thread to avoid holding the async runtime.
#[tauri::command]
pub async fn extract_topology(step_bytes: Vec<u8>) -> Result<TopologyPayload, String> {
    tauri::async_runtime::spawn_blocking(move || extract_topology_from_bytes(&step_bytes))
        .await
        .map_err(|e| format!("Topology extraction task panicked: {e}"))?
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fixture_path(name: &str) -> std::path::PathBuf {
        // Walk up from src-tauri/src/cad/ to project root, then into public/test_files
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        Path::new(manifest_dir)
            .parent() // project root
            .unwrap()
            .join("public")
            .join("test_files")
            .join(name)
    }

    fn load_fixture(name: &str) -> Vec<u8> {
        let path = fixture_path(name);
        std::fs::read(&path).unwrap_or_else(|e| {
            panic!("Cannot read fixture {}: {e}", path.display())
        })
    }

    #[test]
    fn extract_pump_manifold() {
        let bytes = load_fixture("Pump Manifold v3.step");
        let payload = extract_topology_from_bytes(&bytes)
            .expect("extraction should succeed");

        assert!(!payload.faces.is_empty(), "should have faces");
        assert!(!payload.edges.is_empty(), "should have edges");
        assert_eq!(
            payload.adjacency.len(),
            payload.faces.len(),
            "adjacency entries should match face count"
        );

        // Every face should have at least one wire
        for face in &payload.faces {
            assert!(!face.wires.is_empty(), "face {} should have wires", face.id);
        }

        eprintln!(
            "Pump Manifold: {} faces, {} edges",
            payload.faces.len(),
            payload.edges.len()
        );
    }

    #[test]
    fn extract_locus_fixture() {
        let bytes = load_fixture("LOCUS SYSTEMS MACHINE FIXTURE.stp");
        let payload = extract_topology_from_bytes(&bytes)
            .expect("extraction should succeed");

        assert!(!payload.faces.is_empty(), "should have faces");
        assert!(!payload.edges.is_empty(), "should have edges");

        eprintln!(
            "LOCUS fixture: {} faces, {} edges",
            payload.faces.len(),
            payload.edges.len()
        );
    }

    #[test]
    fn deterministic_ids() {
        let bytes = load_fixture("Pump Manifold v3.step");
        let p1 = extract_topology_from_bytes(&bytes).expect("first extraction");
        let p2 = extract_topology_from_bytes(&bytes).expect("second extraction");

        assert_eq!(p1.faces.len(), p2.faces.len(), "face count should match");
        assert_eq!(p1.edges.len(), p2.edges.len(), "edge count should match");

        for (f1, f2) in p1.faces.iter().zip(p2.faces.iter()) {
            assert_eq!(f1.id, f2.id, "face IDs should be deterministic");
        }
        for (e1, e2) in p1.edges.iter().zip(p2.edges.iter()) {
            assert_eq!(e1.id, e2.id, "edge IDs should be deterministic");
        }
    }

    #[test]
    fn json_round_trip() {
        let bytes = load_fixture("Pump Manifold v3.step");
        let payload = extract_topology_from_bytes(&bytes).expect("extraction");

        let json = serde_json::to_string(&payload).expect("serialize");
        let round_tripped: TopologyPayload =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(payload.faces.len(), round_tripped.faces.len());
        assert_eq!(payload.edges.len(), round_tripped.edges.len());
        assert_eq!(payload.adjacency.len(), round_tripped.adjacency.len());
    }

    #[test]
    fn empty_input_error() {
        let result = extract_topology_from_bytes(&[]);
        assert!(result.is_err(), "empty input should error");
    }

    #[test]
    fn invalid_step_error() {
        let result = extract_topology_from_bytes(b"this is not a STEP file");
        assert!(result.is_err(), "invalid STEP should error");
        let err = result.unwrap_err();
        // Should be a readable message, not a panic
        assert!(
            !err.contains("panicked"),
            "error should be readable: {err}"
        );
    }
}
