//! Analytic surface classification for BREP faces.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum SurfaceKind {
    Plane,
    Cylinder,
    Cone,
    Sphere,
    Torus,
    BSpline,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SurfaceClassification {
    pub kind: SurfaceKind,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<[f64; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normal: Option<[f64; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis_origin: Option<[f64; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub axis_direction: Option<[f64; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub center: Option<[f64; 3]>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub angular_span: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub half_angle: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub major_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minor_radius: Option<f64>,
}
