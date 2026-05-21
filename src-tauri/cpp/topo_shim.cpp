/**
 * topo_shim.cpp — OCCT BREP topology extraction, exposed via C ABI.
 *
 * Implements the four functions declared in topo_shim.h.
 * Uses raw OCCT APIs: STEPControl_Reader, TopExp_Explorer, TopExp indexed maps,
 * BRep_Tool, BRepGProp, and Bnd_Box for geometry fingerprinting.
 *
 * Deterministic IDs are generated from topology map index + geometry hash
 * (surface type, bounding box, area/length) so they survive re-import of
 * the same STEP file.
 *
 * See ADR 0003 for design rationale.
 */

#include "topo_shim.h"

// OCCT headers — STEP import
#include <STEPControl_Reader.hxx>

// OCCT headers — topology traversal
#include <TopoDS.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Wire.hxx>
#include <TopAbs_Orientation.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>

// OCCT headers — geometry queries
#include <BRep_Tool.hxx>
#include <BRepTools.hxx>
#include <BRepGProp.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <GProp_GProps.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <GeomAdaptor_Surface.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <gp_Ax1.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>

// Standard library
#include <string>
#include <sstream>
#include <vector>
#include <cstdio>
#include <cstring>
#include <functional>
#include <fstream>
#include <filesystem>
#include <atomic>
#include <chrono>
#include <cmath>

// ── Result type ────────────────────────────────────────────────────────

struct TopoResult {
    std::string json;
    std::string error;
};

static std::atomic<unsigned long long> tmp_counter{0};

// ── JSON helpers (no external dep) ─────────────────────────────────────

static std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;      break;
        }
    }
    return out;
}

static std::string json_string(const std::string& s) {
    return "\"" + json_escape(s) + "\"";
}

static void append_vec3(std::ostringstream& js, const gp_Pnt& p) {
    js << "[" << p.X() << "," << p.Y() << "," << p.Z() << "]";
}

static void append_vec3(std::ostringstream& js, const gp_Dir& d) {
    js << "[" << d.X() << "," << d.Y() << "," << d.Z() << "]";
}

static double positive_radius(double r) {
    return r < 0.0 ? -r : r;
}

static double normalized_angle_span(double span) {
    const double twoPi = 6.28318530717958647692;
    double value = positive_radius(span);
    if (value > twoPi) {
        value = std::fmod(value, twoPi);
        if (value < 1e-9) {
            return twoPi;
        }
    }
    return value;
}

static gp_Dir oriented_dir(const TopoDS_Face& face, const gp_Dir& dir) {
    if (face.Orientation() == TopAbs_REVERSED) {
        return gp_Dir(-dir.X(), -dir.Y(), -dir.Z());
    }
    return dir;
}

static std::string surface_classification_json(const TopoDS_Face& face) {
    std::ostringstream js;

    try {
        BRepAdaptor_Surface adaptor(face, Standard_True);
        const double firstU = adaptor.FirstUParameter();
        const double lastU = adaptor.LastUParameter();
        const double firstV = adaptor.FirstVParameter();
        const double lastV = adaptor.LastVParameter();

        switch (adaptor.GetType()) {
            case GeomAbs_Plane: {
                gp_Pln plane = adaptor.Plane();
                js << "{\"kind\":\"plane\"";
                js << ",\"origin\":";
                append_vec3(js, plane.Location());
                js << ",\"normal\":";
                append_vec3(js, oriented_dir(face, plane.Axis().Direction()));
                js << "}";
                return js.str();
            }

            case GeomAbs_Cylinder: {
                gp_Cylinder cylinder = adaptor.Cylinder();
                js << "{\"kind\":\"cylinder\"";
                js << ",\"axis_origin\":";
                append_vec3(js, cylinder.Axis().Location());
                js << ",\"axis_direction\":";
                append_vec3(js, oriented_dir(face, cylinder.Axis().Direction()));
                js << ",\"radius\":" << cylinder.Radius();
                js << ",\"length\":" << positive_radius(lastV - firstV);
                js << ",\"angular_span\":" << normalized_angle_span(lastU - firstU);
                js << "}";
                return js.str();
            }

            case GeomAbs_Cone: {
                gp_Cone cone = adaptor.Cone();
                const double tanHalfAngle = std::tan(cone.SemiAngle());
                const double r1 = positive_radius(cone.RefRadius() + firstV * tanHalfAngle);
                const double r2 = positive_radius(cone.RefRadius() + lastV * tanHalfAngle);
                js << "{\"kind\":\"cone\"";
                js << ",\"axis_origin\":";
                append_vec3(js, cone.Axis().Location());
                js << ",\"axis_direction\":";
                append_vec3(js, oriented_dir(face, cone.Axis().Direction()));
                js << ",\"half_angle\":" << cone.SemiAngle();
                js << ",\"min_radius\":" << (r1 < r2 ? r1 : r2);
                js << ",\"max_radius\":" << (r1 > r2 ? r1 : r2);
                js << ",\"length\":" << positive_radius(lastV - firstV);
                js << ",\"angular_span\":" << normalized_angle_span(lastU - firstU);
                js << "}";
                return js.str();
            }

            case GeomAbs_Sphere: {
                gp_Sphere sphere = adaptor.Sphere();
                js << "{\"kind\":\"sphere\"";
                js << ",\"center\":";
                append_vec3(js, sphere.Location());
                js << ",\"radius\":" << sphere.Radius();
                js << ",\"angular_span\":" << normalized_angle_span(lastU - firstU);
                js << "}";
                return js.str();
            }

            case GeomAbs_Torus: {
                gp_Torus torus = adaptor.Torus();
                js << "{\"kind\":\"torus\"";
                js << ",\"axis_origin\":";
                append_vec3(js, torus.Axis().Location());
                js << ",\"axis_direction\":";
                append_vec3(js, oriented_dir(face, torus.Axis().Direction()));
                js << ",\"major_radius\":" << torus.MajorRadius();
                js << ",\"minor_radius\":" << torus.MinorRadius();
                js << ",\"angular_span\":" << normalized_angle_span(lastU - firstU);
                js << "}";
                return js.str();
            }

            case GeomAbs_BSplineSurface:
                return "{\"kind\":\"b_spline\"}";

            default:
                return "{\"kind\":\"unknown\"}";
        }
    } catch (...) {
        return "{\"kind\":\"unknown\"}";
    }
}

// ── Deterministic ID generation ────────────────────────────────────────
//
// We hash: topology-map-index + geometry fingerprint.
// The fingerprint for faces uses: surface type enum + bounding box corners + area.
// The fingerprint for edges uses: bounding box corners + curve length.
//
// FNV-1a 64-bit is fast, deterministic, and sufficient for topology IDs.

static uint64_t fnv1a_init() { return 14695981039346656037ULL; }

static uint64_t fnv1a_feed(uint64_t h, const void* data, size_t len) {
    const uint8_t* p = static_cast<const uint8_t*>(data);
    for (size_t i = 0; i < len; ++i) {
        h ^= p[i];
        h *= 1099511628211ULL;
    }
    return h;
}

static uint64_t fnv1a_u32(uint64_t h, uint32_t v) {
    return fnv1a_feed(h, &v, sizeof(v));
}

static uint64_t fnv1a_f64(uint64_t h, double v) {
    // Quantize to 6 decimal places for stability across platforms.
    int64_t q = static_cast<int64_t>(v * 1e6);
    return fnv1a_feed(h, &q, sizeof(q));
}

static std::string id_from_hash(uint64_t h) {
    char buf[20];
    snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(h));
    return std::string(buf);
}

// ── Geometry fingerprint helpers ───────────────────────────────────────

static uint64_t fingerprint_bbox(uint64_t h, const Bnd_Box& box) {
    if (box.IsVoid()) return h;
    double xmin, ymin, zmin, xmax, ymax, zmax;
    box.Get(xmin, ymin, zmin, xmax, ymax, zmax);
    h = fnv1a_f64(h, xmin);
    h = fnv1a_f64(h, ymin);
    h = fnv1a_f64(h, zmin);
    h = fnv1a_f64(h, xmax);
    h = fnv1a_f64(h, ymax);
    h = fnv1a_f64(h, zmax);
    return h;
}

static uint64_t face_fingerprint(int mapIndex, const TopoDS_Face& face) {
    uint64_t h = fnv1a_init();
    h = fnv1a_u32(h, static_cast<uint32_t>(mapIndex));

    // Surface type
    try {
        Handle(Geom_Surface) surf = BRep_Tool::Surface(face);
        if (!surf.IsNull()) {
            GeomAdaptor_Surface adaptor(surf);
            h = fnv1a_u32(h, static_cast<uint32_t>(adaptor.GetType()));
        }
    } catch (...) {
        h = fnv1a_u32(h, 9999);
    }

    // Bounding box
    try {
        Bnd_Box box;
        BRepBndLib::Add(face, box);
        h = fingerprint_bbox(h, box);
    } catch (...) {}

    // Area
    try {
        GProp_GProps props;
        BRepGProp::SurfaceProperties(face, props);
        h = fnv1a_f64(h, props.Mass());
    } catch (...) {}

    return h;
}

static uint64_t edge_fingerprint(int mapIndex, const TopoDS_Edge& edge) {
    uint64_t h = fnv1a_init();
    h = fnv1a_u32(h, static_cast<uint32_t>(mapIndex));

    // Bounding box
    try {
        Bnd_Box box;
        BRepBndLib::Add(edge, box);
        h = fingerprint_bbox(h, box);
    } catch (...) {}

    // Curve length
    try {
        GProp_GProps props;
        BRepGProp::LinearProperties(edge, props);
        h = fnv1a_f64(h, props.Mass());
    } catch (...) {}

    return h;
}

// ── Core extraction ────────────────────────────────────────────────────

static TopoResult* do_extract(const uint8_t* step_data, size_t step_len) {
    auto* result = new TopoResult();

    // ── 1. Write STEP data to temp file (STEPControl_Reader needs a file path) ──
    std::filesystem::path tmp_dir = std::filesystem::temp_directory_path();
    auto unique_id = tmp_counter.fetch_add(1, std::memory_order_relaxed);
    auto timestamp = std::chrono::steady_clock::now().time_since_epoch().count();
    std::filesystem::path tmp_path =
        tmp_dir / ("quote_topo_extract_" + std::to_string(timestamp) + "_" + std::to_string(unique_id) + ".step");

    {
        std::ofstream ofs(tmp_path, std::ios::binary);
        if (!ofs) {
            result->error = "Failed to create temporary STEP file at: " + tmp_path.string();
            return result;
        }
        ofs.write(reinterpret_cast<const char*>(step_data), step_len);
        if (!ofs) {
            result->error = "Failed to write STEP data to temporary file";
            return result;
        }
    }

    // ── 2. Import STEP ──
    STEPControl_Reader reader;
    IFSelect_ReturnStatus status = reader.ReadFile(tmp_path.string().c_str());

    if (status != IFSelect_RetDone) {
        std::error_code cleanup_error;
        std::filesystem::remove(tmp_path, cleanup_error);
        result->error = "STEP import failed with status code " + std::to_string(static_cast<int>(status));
        return result;
    }

    reader.TransferRoots();
    TopoDS_Shape shape = reader.OneShape();
    std::error_code cleanup_error;
    std::filesystem::remove(tmp_path, cleanup_error);

    if (shape.IsNull()) {
        result->error = "STEP import produced a null shape";
        return result;
    }

    // ── 3. Build indexed maps ──
    TopTools_IndexedMapOfShape faceMap, edgeMap;
    TopExp::MapShapes(shape, TopAbs_FACE, faceMap);
    TopExp::MapShapes(shape, TopAbs_EDGE, edgeMap);

    // Face-edge adjacency: for each edge, which faces contain it
    TopTools_IndexedDataMapOfShapeListOfShape edgeFaceMap;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, edgeFaceMap);

    // ── 4. Generate deterministic IDs ──
    std::vector<std::string> faceIds(faceMap.Extent());
    for (int i = 1; i <= faceMap.Extent(); ++i) {
        const TopoDS_Face& face = TopoDS::Face(faceMap(i));
        faceIds[i - 1] = "f_" + id_from_hash(face_fingerprint(i, face));
    }

    std::vector<std::string> edgeIds(edgeMap.Extent());
    for (int i = 1; i <= edgeMap.Extent(); ++i) {
        const TopoDS_Edge& edge = TopoDS::Edge(edgeMap(i));
        edgeIds[i - 1] = "e_" + id_from_hash(edge_fingerprint(i, edge));
    }

    // ── 5. Build JSON ──
    std::ostringstream js;
    js << "{";

    // -- faces with wire loops --
    js << "\"faces\":[";
    for (int fi = 1; fi <= faceMap.Extent(); ++fi) {
        const TopoDS_Face& face = TopoDS::Face(faceMap(fi));
        if (fi > 1) js << ",";
        js << "{";
        js << "\"id\":" << json_string(faceIds[fi - 1]);
        js << ",\"index\":" << fi;
        js << ",\"surface\":" << surface_classification_json(face);

        // Wire loops
        js << ",\"wires\":[";
        TopoDS_Wire outerWire;
        try {
            outerWire = BRepTools::OuterWire(face);
        } catch (...) {
            // Some degenerate faces may not have an outer wire
        }

        int wireIdx = 0;
        for (TopExp_Explorer wExp(face, TopAbs_WIRE); wExp.More(); wExp.Next()) {
            const TopoDS_Wire& wire = TopoDS::Wire(wExp.Current());
            if (wireIdx > 0) js << ",";
            js << "{";

            // Check if this is the outer wire
            bool isOuter = (!outerWire.IsNull() && wire.IsSame(outerWire));
            js << "\"is_outer\":" << (isOuter ? "true" : "false");

            // Collect edge IDs in this wire
            js << ",\"edge_ids\":[";
            int edgeIdx = 0;
            for (TopExp_Explorer eExp(wire, TopAbs_EDGE); eExp.More(); eExp.Next()) {
                const TopoDS_Edge& wEdge = TopoDS::Edge(eExp.Current());
                int edgeMapIdx = edgeMap.FindIndex(wEdge);
                if (edgeMapIdx > 0) {
                    if (edgeIdx > 0) js << ",";
                    js << json_string(edgeIds[edgeMapIdx - 1]);
                    edgeIdx++;
                }
            }
            js << "]";
            js << "}";
            wireIdx++;
        }
        js << "]";
        js << "}";
    }
    js << "]";

    // -- edges --
    js << ",\"edges\":[";
    for (int ei = 1; ei <= edgeMap.Extent(); ++ei) {
        if (ei > 1) js << ",";
        js << "{";
        js << "\"id\":" << json_string(edgeIds[ei - 1]);
        js << ",\"index\":" << ei;
        js << "}";
    }
    js << "]";

    // -- adjacency: for each face, list its adjacent edge IDs --
    js << ",\"adjacency\":[";
    for (int fi = 1; fi <= faceMap.Extent(); ++fi) {
        const TopoDS_Face& face = TopoDS::Face(faceMap(fi));
        if (fi > 1) js << ",";
        js << "{";
        js << "\"face_id\":" << json_string(faceIds[fi - 1]);
        js << ",\"adjacent_edge_ids\":[";

        // Collect all edges belonging to this face
        int adjIdx = 0;
        for (TopExp_Explorer eExp(face, TopAbs_EDGE); eExp.More(); eExp.Next()) {
            const TopoDS_Edge& fEdge = TopoDS::Edge(eExp.Current());
            int edgeMapIdx = edgeMap.FindIndex(fEdge);
            if (edgeMapIdx > 0) {
                if (adjIdx > 0) js << ",";
                js << json_string(edgeIds[edgeMapIdx - 1]);
                adjIdx++;
            }
        }
        js << "]";
        js << "}";
    }
    js << "]";

    js << "}";

    result->json = js.str();
    return result;
}

// ── C ABI exports ──────────────────────────────────────────────────────

extern "C" {

TopoResult* topo_extract(const uint8_t* step_data, size_t step_len) {
    try {
        return do_extract(step_data, step_len);
    } catch (const std::exception& e) {
        auto* r = new TopoResult();
        r->error = std::string("OCCT exception: ") + e.what();
        return r;
    } catch (...) {
        auto* r = new TopoResult();
        r->error = "Unknown C++ exception during topology extraction";
        return r;
    }
}

const char* topo_result_json(const TopoResult* result) {
    if (!result || !result->error.empty()) return nullptr;
    return result->json.c_str();
}

const char* topo_result_error(const TopoResult* result) {
    if (!result || result->error.empty()) return nullptr;
    return result->error.c_str();
}

void topo_result_free(TopoResult* result) {
    delete result; // delete nullptr is safe
}

} // extern "C"
