mod cad;

use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const CRASH_REPORT_DIR: &str = "crash-reports";

fn crash_reports_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(CRASH_REPORT_DIR))
        .map_err(|err| format!("Unable to resolve app data dir: {err}"))
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn write_report_to_dir(dir: &Path, mut report: Value) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|err| format!("Unable to create crash report dir: {err}"))?;

    if let Some(object) = report.as_object_mut() {
        object
            .entry("timestamp")
            .or_insert_with(|| json!(format!("{}", now_millis())));
        object
            .entry("appVersion")
            .or_insert_with(|| json!(env!("CARGO_PKG_VERSION")));
        object
            .entry("platform")
            .or_insert_with(|| json!(std::env::consts::OS));
    }

    let source = report
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("crash")
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' { ch } else { '-' })
        .collect::<String>();
    let path = dir.join(format!("{}-{}.json", now_millis(), source));
    let body = serde_json::to_string_pretty(&report)
        .map_err(|err| format!("Unable to serialize crash report: {err}"))?;
    fs::write(&path, body).map_err(|err| format!("Unable to write crash report: {err}"))?;
    Ok(path)
}

#[tauri::command]
fn write_crash_report(app: AppHandle, report: Value) -> Result<String, String> {
    let dir = crash_reports_dir(&app)?;
    write_report_to_dir(&dir, report).map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_latest_crash_report(app: AppHandle) -> Result<Option<String>, String> {
    let dir = crash_reports_dir(&app)?;
    if !dir.exists() {
        return Ok(None);
    }

    let mut entries = fs::read_dir(&dir)
        .map_err(|err| format!("Unable to read crash report dir: {err}"))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|(modified, _)| *modified);

    match entries.pop() {
        Some((_, path)) => fs::read_to_string(path)
            .map(Some)
            .map_err(|err| format!("Unable to read latest crash report: {err}")),
        None => Ok(None),
    }
}

#[tauri::command]
fn open_crash_reports_folder(app: AppHandle) -> Result<(), String> {
    let dir = crash_reports_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|err| format!("Unable to create crash report dir: {err}"))?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(&dir);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(&dir);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&dir);
        cmd
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Unable to open crash report folder: {err}"))
}

#[tauri::command]
fn write_test_rust_crash_report(app: AppHandle) -> Result<String, String> {
    let dir = crash_reports_dir(&app)?;
    write_report_to_dir(
        &dir,
        json!({
            "source": "rust-panic",
            "message": "Simulated Rust panic report",
            "stack": "Simulated panic path for manual verification",
            "route": "settings/diagnostics",
        }),
    )
    .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|err| format!("Unable to resolve app log dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("Unable to create logs dir: {err}"))?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(&dir);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(&dir);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&dir);
        cmd
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("Unable to open logs folder: {err}"))
}

fn install_panic_hook(crash_dir: PathBuf) {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|value| (*value).to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "Rust panic".to_string());
        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        let _ = write_report_to_dir(
            &crash_dir,
            json!({
                "source": "rust-panic",
                "message": message,
                "stack": backtrace,
                "route": "native",
                "context": {
                    "location": location,
                    "thread": std::thread::current().name().unwrap_or("unnamed"),
                },
            }),
        );
        default_hook(panic_info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_report_to_dir_creates_json_with_defaults() {
        let dir = std::env::temp_dir().join(format!("quote-crash-report-test-{}", now_millis()));
        let path = write_report_to_dir(
            &dir,
            json!({
                "source": "rust-panic",
                "message": "Simulated panic",
                "route": "settings/diagnostics",
            }),
        )
        .expect("crash report path");

        let body = fs::read_to_string(path).expect("crash report body");
        let report: Value = serde_json::from_str(&body).expect("crash report json");

        assert_eq!(report["source"], "rust-panic");
        assert_eq!(report["message"], "Simulated panic");
        assert_eq!(report["route"], "settings/diagnostics");
        assert!(report["timestamp"].is_string());
        assert_eq!(report["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(report["platform"], std::env::consts::OS);

        let _ = fs::remove_dir_all(dir);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "scrub_undefined_json",
            sql: include_str!("../migrations/0002_scrub_undefined_json.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "quote_cad_sources",
            sql: include_str!("../migrations/0003_quote_cad_sources.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "project_name_source",
            sql: include_str!("../migrations/0004_project_name_source.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "drop_quote_events",
            sql: include_str!("../migrations/0005_drop_quote_events.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "drop_dfm_issues",
            sql: include_str!("../migrations/0006_drop_dfm_issues.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "bop",
            sql: include_str!("../migrations/0007_bop.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "drop_bop_part_number",
            sql: include_str!("../migrations/0008_drop_bop_part_number.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "quote_extra_costs",
            sql: include_str!("../migrations/0009_quote_extra_costs.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "drop_edge_count",
            sql: include_str!("../migrations/0010_drop_edge_count.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "extend_part_geometry",
            sql: include_str!("../migrations/0011_extend_part_geometry.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "quote_cad_blob_store",
            sql: include_str!("../migrations/0012_quote_cad_blob_store.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let crash_dir = app
                .path()
                .app_data_dir()
                .map(|dir| dir.join(CRASH_REPORT_DIR))?;
            install_panic_hook(crash_dir);
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    ])
                    .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                    .max_file_size(10 * 1024 * 1024) // 10 MB per file
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5)) // Retain 5 files
                    .level(log::LevelFilter::Info)
                    .level_for("mio", log::LevelFilter::Warn)
                    .level_for("tokio", log::LevelFilter::Warn)
                    .level_for("sqlx", log::LevelFilter::Warn)
                    .level_for("hyper", log::LevelFilter::Warn)
                    .build(),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            write_crash_report,
            get_latest_crash_report,
            open_crash_reports_folder,
            write_test_rust_crash_report,
            open_logs_folder,
            cad::serialize::topology_payload_schema,
            cad::topology::extract_topology
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:quote.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
