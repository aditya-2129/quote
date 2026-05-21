use std::{env, path::PathBuf, time::Instant};

use anyhow::{Context, Result};
use opencascade::primitives::Shape;
use serde::Serialize;

#[derive(Debug, Serialize)]
struct FixtureReport {
    file: String,
    import_ms: u128,
    shape_type: String,
    face_count: usize,
    edge_count: usize,
    sample_face_centers: Vec<[f64; 3]>,
}

fn main() -> Result<()> {
    let paths: Vec<PathBuf> = env::args_os().skip(1).map(PathBuf::from).collect();
    if paths.is_empty() {
        anyhow::bail!("usage: opencascade-native-spike <file.step> [more.step ...]");
    }

    let mut reports = Vec::new();
    for path in paths {
        let start = Instant::now();
        let shape = Shape::read_step(&path).with_context(|| format!("read {}", path.display()))?;
        let import_ms = start.elapsed().as_millis();

        let mut sample_face_centers = Vec::new();
        let mut face_count = 0;
        for face in shape.faces() {
            face_count += 1;
            if sample_face_centers.len() < 12 {
                let center = face.center_of_mass();
                sample_face_centers.push([center.x, center.y, center.z]);
            }
        }

        reports.push(FixtureReport {
            file: path.display().to_string(),
            import_ms,
            shape_type: format!("{:?}", shape.shape_type()),
            face_count,
            edge_count: shape.edges().count(),
            sample_face_centers,
        });
    }

    println!("{}", serde_json::to_string_pretty(&reports)?);
    Ok(())
}

