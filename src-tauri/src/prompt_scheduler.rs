use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Local, Timelike, Utc};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::prompt_window::request_show_prompt_window;
use crate::{connection, ensure_schema, Settings};

pub struct PromptSchedulerState {
    pub snooze_until: Mutex<Option<DateTime<Utc>>>,
}

impl Default for PromptSchedulerState {
    fn default() -> Self {
        Self {
            snooze_until: Mutex::new(None),
        }
    }
}

pub fn start_prompt_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(next_delay(&app));

            if should_show_prompt(&app) {
                request_show_prompt_window(&app);
            }
        }
    });
}

fn should_show_prompt(app: &AppHandle) -> bool {
    match load_settings(app) {
        Ok(settings) => !is_quiet_time(&settings),
        Err(error) => {
            eprintln!("[work-pulse] prompt scheduler could not read settings: {error}");
            false
        }
    }
}

fn next_delay(app: &AppHandle) -> Duration {
    let interval_minutes = load_settings(app)
        .map(|settings| settings.prompt_interval_minutes)
        .unwrap_or(30)
        .clamp(1, 480);

    let snooze_ms = app
        .try_state::<PromptSchedulerState>()
        .and_then(|state| state.snooze_until.lock().ok().and_then(|guard| {
            guard
                .filter(|until| *until > Utc::now())
                .map(|until| (until - Utc::now()).num_milliseconds().max(0) as u64)
        }))
        .unwrap_or(0);

    if snooze_ms > 0 {
        Duration::from_millis(snooze_ms)
    } else {
        Duration::from_secs((interval_minutes * 60) as u64)
    }
}

fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let conn = connection(app)?;
    ensure_schema(&conn)?;
    read_settings(&conn)
}

pub fn read_settings(conn: &Connection) -> Result<Settings, String> {
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

fn is_quiet_time(settings: &Settings) -> bool {
    let now = Local::now();
    let minutes = (now.hour() as i64) * 60 + now.minute() as i64;
    let start = parse_time(&settings.quiet_start);
    let end = parse_time(&settings.quiet_end);

    if start == end {
        return false;
    }

    if start < end {
        minutes >= start && minutes < end
    } else {
        minutes >= start || minutes < end
    }
}

fn parse_time(value: &str) -> i64 {
    let mut parts = value.split(':');
    let hours: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let mins: i64 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    hours * 60 + mins
}
