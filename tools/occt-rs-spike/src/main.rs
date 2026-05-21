use std::{env, fs, path::PathBuf, time::Instant};

use anyhow::{Context, Result};
use occt_wasm::{OcctKernel, ShapeHandle};
use serde::Serialize;

#[derive(Debug, Serialize)]
struct FixtureReport {
    file: String,
    bytes: u64,
    import_ms: u128,
    query_ms: u128,
    shape_type: String,
    face_count: usize,
    edge_count: usize,
    surface_counts: Vec<(String, usize)>,
    sample_faces: Vec<FaceReport>,
}

#[derive(Debug, Serialize)]
struct FaceReport {
    index: usize,
    hash: i32,
    surface_type: String,
    area: f64,
    uv_bounds: Vec<f64>,
    center_of_mass: Vec<f64>,
    cylinder_data: Option<Vec<f64>>,
    adjacent_face_count: Option<usize>,
}

fn main() -> Result<()> {
    let paths: Vec<PathBuf> = env::args_os().skip(1).map(PathBuf::from).collect();
    if paths.is_empty() {
        anyhow::bail!("usage: occt-rs-spike <file.step> [more.step ...]");
    }

    let mut kernel = OcctKernel::new().context("initialize occt-wasm kernel")?;
    let mut reports = Vec::new();

    for path in paths {
        reports.push(inspect_file(&mut kernel, path)?);
    }

    println!("{}", serde_json::to_string_pretty(&reports)?);
    Ok(())
}

fn inspect_file(kernel: &mut OcctKernel, path: PathBuf) -> Result<FixtureReport> {
    let data = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    let bytes = data.len() as u64;

    let import_start = Instant::now();
    let shape = kernel
        .import_step(&data)
        .with_context(|| format!("import STEP {}", path.display()))?;
    let import_ms = import_start.elapsed().as_millis();

    let query_start = Instant::now();
    let shape_type = kernel.get_shape_type(shape).context("query shape type")?;
    let face_ids = get_sub_shapes(kernel, shape, "FACE")?;
    let edge_ids = get_sub_shapes(kernel, shape, "EDGE")?;

    let mut sample_faces = Vec::new();
    let mut surface_counts: Vec<(String, usize)> = Vec::new();

    for (index, face) in face_ids.iter().copied().enumerate() {
        let face = shape_handle_from_raw(face);
        let surface_type = kernel
            .surface_type(face)
            .with_context(|| format!("surface type for face {index}"))?;

        increment_count(&mut surface_counts, &surface_type);

        if sample_faces.len() < 12 {
            let cylinder_data = if surface_type.to_ascii_lowercase().contains("cylinder") {
                kernel.get_face_cylinder_data(face).ok()
            } else {
                None
            };

            sample_faces.push(FaceReport {
                index,
                hash: kernel.hash_code(face, 1_000_000).unwrap_or_default(),
                surface_type,
                area: kernel.get_surface_area(face).unwrap_or_default(),
                uv_bounds: kernel.uv_bounds(face).unwrap_or_default(),
                center_of_mass: kernel.get_surface_center_of_mass(face).unwrap_or_default(),
                cylinder_data,
                adjacent_face_count: kernel.adjacent_faces(shape, face).ok().map(|v| v.len()),
            });
        }
    }

    surface_counts.sort_by(|a, b| a.0.cmp(&b.0));
    let query_ms = query_start.elapsed().as_millis();

    Ok(FixtureReport {
        file: path.display().to_string(),
        bytes,
        import_ms,
        query_ms,
        shape_type,
        face_count: face_ids.len(),
        edge_count: edge_ids.len(),
        surface_counts,
        sample_faces,
    })
}

fn get_sub_shapes(
    kernel: &mut OcctKernel,
    shape: ShapeHandle,
    shape_type: &str,
) -> Result<Vec<u32>> {
    kernel
        .get_sub_shapes(shape, shape_type)
        .or_else(|_| kernel.get_sub_shapes(shape, &shape_type.to_ascii_lowercase()))
        .with_context(|| format!("query {shape_type} subshapes"))
}

fn increment_count(counts: &mut Vec<(String, usize)>, label: &str) {
    if let Some((_, count)) = counts.iter_mut().find(|(existing, _)| existing == label) {
        *count += 1;
    } else {
        counts.push((label.to_string(), 1));
    }
}

fn shape_handle_from_raw(raw: u32) -> ShapeHandle {
    // occt-wasm 3.0.1 exposes raw subshape IDs but not a public constructor.
    // Keep this isolated so the spike can validate topology capability.
    unsafe { std::mem::transmute::<u32, ShapeHandle>(raw) }
}
