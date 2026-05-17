use tauri_plugin_sql::{Migration, MigrationKind};

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
  ];

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
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
