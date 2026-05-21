fn main() {
    tauri_build::build();

    // ── Compile the OCCT C++ topology shim ─────────────────────────────
    //
    // The shim lives in cpp/topo_shim.cpp and exposes a narrow C ABI.
    // OCCT headers and libraries come from vcpkg.
    // See ADR 0003 for rationale on keeping this boundary small.

    let vcpkg_root =
        std::env::var("VCPKG_ROOT").unwrap_or_else(|_| r"C:\vcpkg".to_string());
    let vcpkg_installed = format!(r"{}\installed\x64-windows", vcpkg_root);
    let include_dir = format!(r"{}\include\opencascade", vcpkg_installed);
    let lib_dir = format!(r"{}\lib", vcpkg_installed);
    let bin_dir = format!(r"{}\bin", vcpkg_installed);

    // Verify OCCT is actually installed
    if !std::path::Path::new(&include_dir).exists() {
        panic!(
            "\n\n\
            ╔══════════════════════════════════════════════════════════════╗\n\
            ║  OCCT headers not found at:                                 ║\n\
            ║  {:<60}║\n\
            ║                                                             ║\n\
            ║  Install OCCT via vcpkg:                                    ║\n\
            ║    vcpkg install opencascade:x64-windows                    ║\n\
            ║                                                             ║\n\
            ║  Then set VCPKG_ROOT or install to C:\\vcpkg                 ║\n\
            ╚══════════════════════════════════════════════════════════════╝\n",
            include_dir
        );
    }

    // Compile the C++ shim
    cc::Build::new()
        .cpp(true)
        .file("cpp/topo_shim.cpp")
        .include(&include_dir)
        .flag_if_supported("/std:c++17")
        .flag_if_supported("/EHsc") // C++ exception handling
        .flag_if_supported("/W3")   // reasonable warning level
        .compile("topo_shim");

    // Link OCCT libraries
    //
    // These are the minimum OCCT toolkits needed for STEP import
    // and BREP topology traversal. Ordered by dependency layer.
    println!("cargo:rustc-link-search=native={}", lib_dir);
    copy_vcpkg_dlls(&bin_dir);

    let occt_libs = [
        // Foundation
        "TKernel",
        "TKMath",
        // Geometry
        "TKG2d",
        "TKG3d",
        "TKGeomBase",
        // BREP
        "TKBRep",
        // Algorithms
        "TKGeomAlgo",
        "TKTopAlgo",
        "TKShHealing",
        // STEP exchange
        "TKXSBase",
        "TKDE",
        "TKDESTEP",
        // Bounding box, properties
        "TKPrim",
        "TKBO",
    ];

    for lib in &occt_libs {
        println!("cargo:rustc-link-lib={}", lib);
    }

    // Rebuild if shim source changes
    println!("cargo:rerun-if-changed=cpp/topo_shim.h");
    println!("cargo:rerun-if-changed=cpp/topo_shim.cpp");
    println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
}

fn copy_vcpkg_dlls(bin_dir: &str) {
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(value) => std::path::PathBuf::from(value),
        Err(_) => return,
    };
    let Some(profile_dir) = out_dir
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
    else {
        return;
    };

    let deps_dir = profile_dir.join("deps");
    let _ = std::fs::create_dir_all(&deps_dir);

    let Ok(entries) = std::fs::read_dir(bin_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("dll") {
            continue;
        }
        let Some(file_name) = path.file_name() else {
            continue;
        };

        let _ = std::fs::copy(&path, profile_dir.join(file_name));
        let _ = std::fs::copy(&path, deps_dir.join(file_name));
    }
}
