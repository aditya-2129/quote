//! BREP topology extraction via the narrow OCCT C++ shim.
//!
//! This module provides the `extract_topology` Tauri command that:
//!   1. Passes STEP bytes to the C++ shim (`topo_shim.cpp`).
//!   2. Receives a JSON payload with faces, edges, wires, and adjacency.
//!   3. Deserializes the payload into Rust types.
//!
//! The C++ boundary is intentionally narrow — four C functions — as
//! described in ADR 0003.

use super::serialize::{wrap_topology, TopologyEnvelope};
use super::surfaces::SurfaceClassification;
use schemars::JsonSchema;
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
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopologyPayload {
    /// All faces in the shape, with wire loops.
    pub faces: Vec<TopoFace>,
    /// All edges in the shape.
    pub edges: Vec<TopoEdge>,
    /// Face-edge adjacency: for each face, which edges bound it.
    pub adjacency: Vec<AdjacencyEntry>,
    /// Top-level bodies (solids, or shells when the file has no solids).
    /// Lets the JS feature layer map whole-file topology to individual
    /// CAD mesh bodies for per-body feature recognition.
    #[serde(default)]
    pub bodies: Vec<TopoBody>,
}

/// A single BREP face with its wire loops.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopoFace {
    /// Deterministic ID (stable across re-imports of the same STEP file).
    pub id: String,
    /// 1-based index in the OCCT topology map.
    pub index: u32,
    /// 0-based index of the owning body in `TopologyPayload::bodies`,
    /// or `None` when the face has no body owner.
    #[serde(default)]
    pub body: Option<u32>,
    /// Analytic surface classification for this face.
    pub surface: SurfaceClassification,
    /// Wire loops bounding this face (outer + inner/hole loops).
    pub wires: Vec<TopoWire>,
}

/// A top-level body (solid or shell) with its bounding box. Used to match
/// whole-file topology to individual imported mesh bodies.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopoBody {
    /// 0-based index, matching `TopoFace::body`.
    pub index: u32,
    /// Optimal axis-aligned bounding box, absent only for degenerate bodies.
    #[serde(default)]
    pub bbox: Option<TopoBbox>,
}

/// An axis-aligned bounding box in model space (mm).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopoBbox {
    /// Minimum corner [x, y, z].
    pub min: [f64; 3],
    /// Maximum corner [x, y, z].
    pub max: [f64; 3],
}

/// A wire loop — an ordered sequence of edges forming a closed boundary.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopoWire {
    /// Ordered edge IDs in this wire loop.
    pub edge_ids: Vec<String>,
    /// True if this is the outer boundary wire of the face.
    pub is_outer: bool,
}

/// A single BREP edge.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct TopoEdge {
    /// Deterministic ID (stable across re-imports of the same STEP file).
    pub id: String,
    /// 1-based index in the OCCT topology map.
    pub index: u32,
}

/// Face-edge adjacency entry: one face and all edges bounding it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
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
pub(crate) fn extract_topology_from_bytes(step_bytes: &[u8]) -> Result<TopologyPayload, String> {
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
            let err_msg = CStr::from_ptr(err_ptr).to_string_lossy().into_owned();
            topo_result_free(result);
            return Err(err_msg);
        }

        // Get JSON
        let json_ptr = topo_result_json(result);
        if json_ptr.is_null() {
            topo_result_free(result);
            return Err("Topology extraction produced no JSON output".to_string());
        }

        let json_str = CStr::from_ptr(json_ptr).to_string_lossy().into_owned();
        topo_result_free(result);

        // Deserialize
        serde_json::from_str::<TopologyPayload>(&json_str)
            .map_err(|e| format!("Failed to parse topology JSON: {e}"))
    }
}

// ── Tauri command ──────────────────────────────────────────────────────

/// Extract BREP topology from a STEP file.
///
/// Takes raw STEP file bytes and returns a versioned topology envelope.
///
/// This runs on a blocking thread to avoid holding the async runtime.
#[tauri::command]
pub async fn extract_topology(step_bytes: Vec<u8>) -> Result<TopologyEnvelope, String> {
    let topology =
        tauri::async_runtime::spawn_blocking(move || extract_topology_from_bytes(&step_bytes))
            .await
            .map_err(|e| format!("Topology extraction task panicked: {e}"))??;
    Ok(wrap_topology(topology))
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::surfaces::SurfaceKind;
    use super::*;
    use std::collections::BTreeSet;
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
        std::fs::read(&path)
            .unwrap_or_else(|e| panic!("Cannot read fixture {}: {e}", path.display()))
    }

    fn load_step_fixture(name: &str) -> Vec<u8> {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = Path::new(manifest_dir)
            .parent()
            .unwrap()
            .join("tests")
            .join("fixtures")
            .join("step")
            .join(name);
        std::fs::read(&path)
            .unwrap_or_else(|e| panic!("Cannot read fixture {}: {e}", path.display()))
    }

    #[test]
    fn extract_pump_manifold() {
        let bytes = load_fixture("Pump Manifold v3.step");
        let payload = extract_topology_from_bytes(&bytes).expect("extraction should succeed");

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
        let payload = extract_topology_from_bytes(&bytes).expect("extraction should succeed");

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
        let round_tripped: TopologyPayload = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(payload.faces.len(), round_tripped.faces.len());
        assert_eq!(payload.edges.len(), round_tripped.edges.len());
        assert_eq!(payload.adjacency.len(), round_tripped.adjacency.len());
    }

    #[test]
    fn classifies_analytic_surfaces_across_fixture_suite() {
        let fixture_names = [
            "FIXTURE PS_1250 ROUND BLOCKS.stp",
            "LOCUS SYSTEMS MACHINE FIXTURE.stp",
            "PS_1250_FIXTURE BLOCKS.stp",
            "PS_8671_SINGLE CAVITY TRANSFER MOULD.stp",
            "Pump Manifold v3.step",
            "TEST BUTTON_9 CAVITY_29X12 (1).stp",
        ];
        let mut kinds = BTreeSet::new();

        for fixture_name in fixture_names {
            let bytes = load_fixture(fixture_name);
            let payload = extract_topology_from_bytes(&bytes)
                .unwrap_or_else(|e| panic!("{fixture_name} should extract topology: {e}"));

            for face in payload.faces {
                kinds.insert(face.surface.kind.clone());
            }
        }

        assert!(
            kinds.contains(&SurfaceKind::Plane),
            "should classify planes"
        );
        assert!(
            kinds.contains(&SurfaceKind::Cylinder),
            "should classify cylinders"
        );
        assert!(kinds.contains(&SurfaceKind::Cone), "should classify cones");
        assert!(
            kinds.contains(&SurfaceKind::Sphere),
            "should classify spheres"
        );
        assert!(kinds.contains(&SurfaceKind::Torus), "should classify tori");
        assert!(
            kinds.contains(&SurfaceKind::BSpline),
            "should classify B-spline fallback surfaces"
        );
    }

    #[test]
    fn cylinder_parameters_are_normalized() {
        let bytes = load_fixture("Pump Manifold v3.step");
        let payload = extract_topology_from_bytes(&bytes).expect("extraction");
        let cylinder = payload
            .faces
            .iter()
            .find(|face| face.surface.kind == SurfaceKind::Cylinder)
            .expect("fixture should contain at least one cylinder");

        let axis = cylinder
            .surface
            .axis_direction
            .expect("cylinder should include axis direction");
        let axis_len = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
        assert!(
            (axis_len - 1.0).abs() < 0.001,
            "axis should be unit length, got {axis_len}"
        );
        assert!(
            cylinder.surface.radius.unwrap_or_default() > 0.0,
            "cylinder radius should be positive"
        );
        assert!(
            cylinder.surface.angular_span.unwrap_or_default() > 0.0,
            "cylinder angular span should be positive"
        );
    }

    #[test]
    fn cylinder_radius_matches_nominal_cad_value() {
        let bytes = load_step_fixture("self_round_shaft.step");
        let payload = extract_topology_from_bytes(&bytes).expect("extraction");
        let cylinder = payload
            .faces
            .iter()
            .find(|face| face.surface.kind == SurfaceKind::Cylinder)
            .expect("round shaft should contain a cylindrical side face");
        let radius = cylinder
            .surface
            .radius
            .expect("cylinder should include radius");

        assert!(
            (radius - 15.0).abs() <= 0.01,
            "D30 shaft should have radius 15 mm, got {radius}"
        );
    }

    #[test]
    fn extracts_per_body_grouping_for_multi_body_fixtures() {
        for name in [
            "local_ps_220129_single_cavity_transfer_tool.stp",
            "local_single_cavity_transfer_mould.stp",
        ] {
            let bytes = load_step_fixture(name);
            let payload = extract_topology_from_bytes(&bytes)
                .unwrap_or_else(|e| panic!("{name} should extract topology: {e}"));

            // Body grouping must be populated for a multi-body file.
            assert!(
                payload.bodies.len() >= 2,
                "{name} is multi-body and should yield >= 2 bodies, got {}",
                payload.bodies.len()
            );

            // Body indices form a contiguous 0-based range, each with a
            // non-degenerate bounding box for mesh matching.
            for (i, body) in payload.bodies.iter().enumerate() {
                assert_eq!(
                    body.index as usize, i,
                    "{name} body indices must be sequential"
                );
                let bbox = body
                    .bbox
                    .as_ref()
                    .unwrap_or_else(|| panic!("{name} body {i} should have a bbox"));
                let span = [
                    bbox.max[0] - bbox.min[0],
                    bbox.max[1] - bbox.min[1],
                    bbox.max[2] - bbox.min[2],
                ];
                assert!(
                    span.iter().all(|d| *d > 0.0),
                    "{name} body {i} bbox should be non-degenerate, got {span:?}"
                );
            }

            // Every face's body index, when present, references a real body.
            let mut bodies_seen = BTreeSet::new();
            for face in &payload.faces {
                if let Some(b) = face.body {
                    assert!(
                        (b as usize) < payload.bodies.len(),
                        "{name} face {} references body {b} out of range",
                        face.id
                    );
                    bodies_seen.insert(b);
                }
            }

            // Faces must be distributed across multiple bodies — a single
            // bucket would mean the grouping is not actually working.
            assert!(
                bodies_seen.len() >= 2,
                "{name} faces should span >= 2 bodies, got {}",
                bodies_seen.len()
            );

            eprintln!(
                "{name}: {} bodies, {} faces grouped across {} bodies",
                payload.bodies.len(),
                payload.faces.len(),
                bodies_seen.len()
            );
        }
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
        assert!(!err.contains("panicked"), "error should be readable: {err}");
    }
}
