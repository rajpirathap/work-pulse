use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};

mod prompt_window;

use prompt_window::{
    configure_macos_prompt_window, hide_prompt_window, show_prompt_window,
};

#[derive(Debug, Serialize)]
struct Entry {
    id: i64,
    started_at: String,
    task_text: String,
    project: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NewEntry {
    task_text: String,
    project: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct EntryUpdate {
    id: i64,
    started_at: String,
    task_text: String,
    project: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Settings {
    prompt_interval_minutes: i64,
    quiet_start: String,
    quiet_end: String,
    workday_start: String,
    workday_end: String,
}

fn connection(app: &AppHandle) -> Result<Connection, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;

    std::fs::create_dir_all(&app_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    let db_path = app_dir.join("work-pulse.sqlite");
    Connection::open(db_path).map_err(|error| format!("Could not open database: {error}"))
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            task_text TEXT NOT NULL,
            project TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            prompt_interval_minutes INTEGER NOT NULL,
            quiet_start TEXT NOT NULL,
            quiet_end TEXT NOT NULL,
            workday_start TEXT NOT NULL,
            workday_end TEXT NOT NULL
        );

        INSERT OR IGNORE INTO settings (
            id,
            prompt_interval_minutes,
            quiet_start,
            quiet_end,
            workday_start,
            workday_end
        ) VALUES (1, 30, '18:00', '08:00', '09:00', '17:00');
        ",
    )
    .map_err(|error| format!("Could not initialize database schema: {error}"))
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn show_dashboard(app: AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

#[tauri::command]
fn show_prompt(app: AppHandle) -> Result<(), String> {
    show_prompt_window(&app);
    Ok(())
}

#[tauri::command]
fn hide_prompt(app: AppHandle) -> Result<(), String> {
    hide_prompt_window(&app);
    Ok(())
}

#[tauri::command]
fn init_database(app: AppHandle) -> Result<(), String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)
}

#[tauri::command]
fn create_entry(app: AppHandle, entry: NewEntry) -> Result<Entry, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    let started_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO entries (started_at, task_text, project, notes) VALUES (?1, ?2, ?3, ?4)",
        params![
            started_at,
            entry.task_text.trim(),
            entry.project.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            entry.notes.as_deref().map(str::trim).filter(|value| !value.is_empty())
        ],
    )
    .map_err(|error| format!("Could not save entry: {error}"))?;

    if let Some(project) = entry
        .project
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        conn.execute(
            "INSERT OR IGNORE INTO projects (name) VALUES (?1)",
            params![project],
        )
        .map_err(|error| format!("Could not save project: {error}"))?;
    }

    let id = conn.last_insert_rowid();
    get_entry(&conn, id)
}

fn get_entry(conn: &Connection, id: i64) -> Result<Entry, String> {
    conn.query_row(
        "SELECT id, started_at, task_text, project, notes FROM entries WHERE id = ?1",
        params![id],
        |row| {
            Ok(Entry {
                id: row.get(0)?,
                started_at: row.get(1)?,
                task_text: row.get(2)?,
                project: row.get(3)?,
                notes: row.get(4)?,
            })
        },
    )
    .map_err(|error| format!("Could not read entry: {error}"))
}

#[tauri::command]
fn update_entry(app: AppHandle, entry: EntryUpdate) -> Result<Entry, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    conn.execute(
        "
        UPDATE entries
        SET started_at = ?1, task_text = ?2, project = ?3, notes = ?4
        WHERE id = ?5
        ",
        params![
            entry.started_at,
            entry.task_text.trim(),
            entry.project.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            entry.notes.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            entry.id
        ],
    )
    .map_err(|error| format!("Could not update entry: {error}"))?;

    if let Some(project) = entry
        .project
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        conn.execute(
            "INSERT OR IGNORE INTO projects (name) VALUES (?1)",
            params![project],
        )
        .map_err(|error| format!("Could not save project: {error}"))?;
    }

    get_entry(&conn, entry.id)
}

#[tauri::command]
fn delete_entry(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    conn.execute("DELETE FROM entries WHERE id = ?1", params![id])
        .map_err(|error| format!("Could not delete entry: {error}"))?;
    Ok(())
}

#[tauri::command]
fn list_entries(app: AppHandle, from: Option<String>, to: Option<String>) -> Result<Vec<Entry>, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    let mut statement = conn
        .prepare(
            "
            SELECT id, started_at, task_text, project, notes
            FROM entries
            WHERE (?1 IS NULL OR started_at >= ?1)
              AND (?2 IS NULL OR started_at <= ?2)
            ORDER BY started_at DESC
            ",
        )
        .map_err(|error| format!("Could not prepare entries query: {error}"))?;

    let rows = statement
        .query_map(params![from, to], |row| {
            Ok(Entry {
                id: row.get(0)?,
                started_at: row.get(1)?,
                task_text: row.get(2)?,
                project: row.get(3)?,
                notes: row.get(4)?,
            })
        })
        .map_err(|error| format!("Could not read entries: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not decode entries: {error}"))
}

#[tauri::command]
fn list_projects(app: AppHandle) -> Result<Vec<String>, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    let mut statement = conn
        .prepare("SELECT name FROM projects ORDER BY name COLLATE NOCASE")
        .map_err(|error| format!("Could not prepare projects query: {error}"))?;

    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Could not read projects: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not decode projects: {error}"))
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    conn.query_row(
        "
        SELECT prompt_interval_minutes, quiet_start, quiet_end, workday_start, workday_end
        FROM settings
        WHERE id = 1
        ",
        [],
        |row| {
            Ok(Settings {
                prompt_interval_minutes: row.get(0)?,
                quiet_start: row.get(1)?,
                quiet_end: row.get(2)?,
                workday_start: row.get(3)?,
                workday_end: row.get(4)?,
            })
        },
    )
    .map_err(|error| format!("Could not read settings: {error}"))
}

#[tauri::command]
fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let conn = connection(&app)?;
    ensure_schema(&conn)?;

    conn.execute(
        "
        UPDATE settings
        SET prompt_interval_minutes = ?1,
            quiet_start = ?2,
            quiet_end = ?3,
            workday_start = ?4,
            workday_end = ?5
        WHERE id = 1
        ",
        params![
            settings.prompt_interval_minutes.clamp(1, 480),
            settings.quiet_start,
            settings.quiet_end,
            settings.workday_start,
            settings.workday_end
        ],
    )
    .map_err(|error| format!("Could not update settings: {error}"))?;

    get_settings(app)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            init_database,
            create_entry,
            update_entry,
            delete_entry,
            list_entries,
            list_projects,
            get_settings,
            update_settings,
            show_dashboard,
            show_prompt,
            hide_prompt
        ])
        .setup(|app| {
            let show_dashboard_item =
                MenuItem::with_id(app, "show-dashboard", "Open Dashboard", true, None::<&str>)?;
            let prompt_now_item =
                MenuItem::with_id(app, "prompt-now", "Prompt Now", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Work Pulse", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app,
                &[&show_dashboard_item, &prompt_now_item, &quit_item],
            )?;

            let icon = app
                .default_window_icon()
                .ok_or("Work Pulse is missing a tray icon")?
                .clone();

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Work Pulse")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show-dashboard" => show_main_window(app),
                    "prompt-now" => show_prompt_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(conn) = connection(app.handle()).ok() {
                let _ = ensure_schema(&conn);
            }

            if let Some(prompt) = app.get_webview_window("prompt") {
                configure_macos_prompt_window(&prompt);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Work Pulse")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                show_main_window(app_handle);
            }
        });
}
