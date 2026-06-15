# Work Pulse — Architecture

Work Pulse is a cross-platform desktop timesheet assistant built with **Tauri 2**, **React**, **TypeScript**, and **SQLite**. It runs locally on macOS and Windows, prompts the user at a configurable interval, stores entries on disk, and helps produce weekly timesheet summaries.

This document describes how the system is structured, how data flows between components, and where key behavior lives in the codebase.

---

## High-level overview

```mermaid
flowchart TB
    subgraph OS["Operating System"]
        Tray["Menu bar / System tray"]
        Dock["Dock / Taskbar"]
    end

    subgraph Tauri["Tauri Native Shell (Rust)"]
        Core["lib.rs — app lifecycle, IPC, tray"]
        Scheduler["prompt_scheduler.rs — background timer"]
        PromptWin["prompt_window.rs — floating prompt UI"]
        SQLite[("SQLite\nwork-pulse.sqlite")]
        SnoozeState["In-memory snooze state"]
    end

    subgraph Webviews["WebView Layer (React)"]
        MainUI["Main window\nindex.html → Dashboard.tsx"]
        PromptUI["Prompt window\nprompt.html → PromptWindow.tsx"]
    end

    Tray --> Core
    Dock --> Core
    Scheduler --> PromptWin
    Scheduler --> SQLite
    Scheduler --> SnoozeState
    Core --> SQLite
    Core --> MainUI
    Core --> PromptUI
    PromptWin --> PromptUI
    MainUI -->|invoke IPC| Core
    PromptUI -->|invoke IPC| Core
    MainUI <-->|Tauri events| PromptUI
```

### Design principles

| Principle | Implementation |
|---|---|
| Local-first | All data in SQLite under the OS app data directory |
| Background operation | App keeps running when windows are hidden; tray icon remains |
| Reliable prompting | Scheduler runs in a Rust thread, not in a hidden WebView |
| Separation of UI | Dashboard and prompt are independent windows and bundles |
| Close-to-hide | Closing a window hides it; only **Quit** from the tray exits the app |

---

## Runtime components

```mermaid
graph LR
    subgraph Frontend["Frontend (TypeScript / React)"]
        API["api.ts — IPC wrappers"]
        Dashboard["Dashboard.tsx"]
        Prompt["PromptWindow.tsx"]
        Time["time.ts — timeline, CSV, quiet hours (UI)"]
        Windows["windows.ts — window helpers"]
    end

    subgraph Backend["Backend (Rust)"]
        Lib["lib.rs"]
        PS["prompt_scheduler.rs"]
        PW["prompt_window.rs"]
    end

    Dashboard --> API
    Prompt --> API
    Dashboard --> Time
    Prompt --> Windows
    Dashboard --> Windows
    API --> Lib
    Lib --> PS
    Lib --> PW
    PS --> PW
    Lib --> DB[("SQLite")]
    PS --> DB
```

### Responsibilities

| Component | Path | Role |
|---|---|---|
| App entry | `src-tauri/src/main.rs` | Starts the Tauri runtime |
| Core backend | `src-tauri/src/lib.rs` | IPC commands, tray menu, DB access, window close-to-hide |
| Prompt scheduler | `src-tauri/src/prompt_scheduler.rs` | Background loop: interval, quiet hours, snooze |
| Prompt window control | `src-tauri/src/prompt_window.rs` | Show/hide, always-on-top, macOS positioning |
| Dashboard UI | `src/Dashboard.tsx` | Settings, daily log, weekly summary, CSV export |
| Prompt UI | `src/PromptWindow.tsx` | “What are you doing?” widget |
| IPC layer | `src/api.ts` | Typed wrappers around Tauri `invoke()` |
| Build config | `vite.config.ts` | Two HTML entry points: `main` and `prompt` |
| App config | `src-tauri/tauri.conf.json` | Window definitions, bundle settings |

---

## Window model

Work Pulse uses **two separate Tauri webview windows**, each with its own HTML entry point and React root.

```mermaid
flowchart TB
    subgraph Build["Vite build output"]
        Index["dist/index.html"]
        PromptHtml["dist/prompt.html"]
    end

    subgraph Windows["Tauri windows"]
        Main["main window\n1180×780\nDashboard"]
        Prompt["prompt window\n360×300\nFrameless, transparent\nAlways on top"]
    end

    Index --> Main
    PromptHtml --> Prompt

    Main -->|hidden when closed| TrayIcon["Tray / menu bar"]
    Prompt -->|hidden when closed| Hidden["Still running in background"]
```

| Window | Label | Entry | React root | Visible by default |
|---|---|---|---|---|
| Dashboard | `main` | `index.html` | `main.tsx` → `Dashboard.tsx` | Yes |
| Prompt widget | `prompt` | `prompt.html` | `prompt-main.tsx` → `PromptWindow.tsx` | No (shown by scheduler or tray) |

### Window lifecycle

```mermaid
stateDiagram-v2
    [*] --> Running: App launch
    Running --> MainVisible: Open Dashboard
    Running --> MainHidden: Close main window
    MainVisible --> MainHidden: User closes window
    MainHidden --> MainVisible: Tray → Open Dashboard\nor Dock click (macOS)

    Running --> PromptVisible: Scheduler / Prompt Now
    PromptVisible --> PromptHidden: Save / Skip / Snooze / Close
    PromptHidden --> PromptVisible: Next interval or Prompt Now

    Running --> [*]: Tray → Quit Work Pulse
```

Closing either window **does not quit the app**. The native shell intercepts `CloseRequested`, calls `prevent_close()`, and hides the window instead.

---

## Prompt scheduling

The prompt scheduler is the most important background subsystem. It runs in a **dedicated Rust thread** so prompts continue even when the dashboard WebView is hidden (macOS throttles JavaScript timers in background webviews).

```mermaid
sequenceDiagram
    participant Thread as Scheduler thread
    participant DB as SQLite
    participant State as Snooze state
    participant PW as prompt_window.rs
    participant UI as PromptWindow.tsx

    loop Every interval
        Thread->>DB: Read settings (interval, quiet hours)
        Thread->>State: Check snooze_until
        alt Snooze active
            Thread->>Thread: Sleep until snooze expires
        else Normal interval
            Thread->>Thread: Sleep prompt_interval_minutes
        end
        alt Not quiet hours
            Thread->>PW: show_prompt_window()
            PW->>UI: emit "prompt:open"
            UI->>UI: Reset form fields
        else Quiet hours
            Thread->>Thread: Skip show, reschedule
        end
    end
```

### Scheduler triggers

| Trigger | Source |
|---|---|
| Automatic interval | `prompt_scheduler.rs` background thread |
| Manual | Tray menu → **Prompt Now** |
| Immediate (dev/testing) | Dashboard **Prompt Now** button → `show_prompt` IPC |

### Snooze handling

Snooze is stored in **Rust app state** (`PromptSchedulerState`), not in browser `localStorage`, so the scheduler and prompt window always agree.

| Action | IPC command | Effect |
|---|---|---|
| Snooze 10 min | `set_snooze` | Scheduler waits until snooze time |
| Save entry | `clear_snooze` | Resets snooze; normal interval resumes |
| Skip | — | No snooze change; normal interval resumes |

---

## Entry save flow

```mermaid
sequenceDiagram
    actor User
    participant Prompt as PromptWindow.tsx
    participant IPC as lib.rs
    participant DB as SQLite
    participant Dash as Dashboard.tsx

    User->>Prompt: Type task + Enter / Save
    Prompt->>IPC: create_entry
    IPC->>DB: INSERT INTO entries
    IPC->>DB: INSERT OR IGNORE INTO projects
    IPC-->>Prompt: Entry record
    Prompt->>IPC: clear_snooze
    Prompt->>Prompt: emit "entry:saved"
    Prompt->>IPC: hide_prompt
    Prompt-->>Dash: "entry:saved" event
    Dash->>IPC: list_entries / list_projects
    Dash->>Dash: Refresh timeline & summary
```

### Prompt actions

| Button / key | Behavior |
|---|---|
| **Save** / **Enter** | Validates task text → saves entry → clears snooze → hides prompt |
| **Skip** | Hides prompt without saving |
| **Snooze** | Sets 10-minute snooze → hides prompt |
| **×** close | Same as Skip |

---

## IPC commands

All frontend-to-backend calls go through `src/api.ts` → Tauri `invoke()`.

| Command | Called from | Purpose |
|---|---|---|
| `init_database` | Dashboard, Prompt | Ensure schema exists |
| `create_entry` | Prompt, Dashboard (quick entry) | Save a new time entry |
| `update_entry` | Dashboard | Edit an existing entry |
| `delete_entry` | Dashboard | Remove an entry |
| `list_entries` | Dashboard | Query entries by date range |
| `list_projects` | Dashboard, Prompt | Autocomplete project names |
| `get_settings` | Dashboard | Read prompt interval, quiet hours, workday |
| `update_settings` | Dashboard | Persist settings changes |
| `show_dashboard` | — | Show and focus main window |
| `show_prompt` | Dashboard, tray | Show prompt widget |
| `hide_prompt` | PromptWindow | Hide prompt widget |
| `set_snooze` | PromptWindow | Delay next scheduled prompt |
| `clear_snooze` | PromptWindow | Resume normal interval after save |

---

## Tauri events

Cross-window notifications use Tauri’s event bus (not IPC return values).

| Event | Emitter | Listener | Purpose |
|---|---|---|---|
| `prompt:open` | `prompt_window.rs` | `PromptWindow.tsx` | Reset form when prompt is shown |
| `entry:saved` | `PromptWindow.tsx` | `Dashboard.tsx` | Refresh entries after prompt save |
| `prompt:snoozed` | `PromptWindow.tsx` | `Dashboard.tsx` | Update status message |

---

## Data layer

### Storage location

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/com.workpulse.app/work-pulse.sqlite` |
| Windows | `%APPDATA%\com.workpulse.app\work-pulse.sqlite` |

No cloud sync, accounts, or network calls are required at runtime.

### Schema

```mermaid
erDiagram
    entries {
        int id PK
        text started_at
        text task_text
        text project
        text notes
        text created_at
    }

    projects {
        int id PK
        text name UK
    }

    settings {
        int id PK "always 1"
        int prompt_interval_minutes
        text quiet_start
        text quiet_end
        text workday_start
        text workday_end
    }
```

### Settings defaults

| Field | Default | Used by |
|---|---|---|
| `prompt_interval_minutes` | 30 | Rust scheduler |
| `quiet_start` | 18:00 | Rust scheduler |
| `quiet_end` | 08:00 | Rust scheduler |
| `workday_start` | 09:00 | Dashboard timeline inference |
| `workday_end` | 17:00 | Dashboard timeline inference |

---

## System tray integration

```mermaid
flowchart LR
    Tray["Tray icon"]
    Menu["Context menu"]
    Open["Open Dashboard"]
    Now["Prompt Now"]
    Quit["Quit Work Pulse"]

    Tray --> Menu
    Menu --> Open
    Menu --> Now
    Menu --> Quit

    Open --> ShowMain["show_main_window()"]
    Now --> ShowPrompt["show_prompt_window()"]
    Quit --> Exit["app.exit(0)"]
```

On macOS, clicking the **Dock icon** when all windows are hidden fires `RunEvent::Reopen` and reopens the dashboard.

---

## Platform-specific behavior

### macOS prompt window

Handled in `prompt_window.rs` via `objc2-app-kit`:

| Behavior | Mechanism |
|---|---|
| Float above other apps | `setLevel(3)`, `set_always_on_top(true)` |
| Visible on all Spaces | `NSWindowCollectionBehavior` flags |
| Position above Dock | `NSScreen.visibleFrame` |
| Draggable header | `data-tauri-drag-region` + `setMovableByWindowBackground(true)` |
| Bring to front | `orderFrontRegardless()` |

### Unsigned distribution

Installers from GitHub Releases are not code-signed. First launch may require manual approval (documented in [INSTALL.md](./INSTALL.md)).

---

## Build and release pipeline

```mermaid
flowchart LR
    Dev["Developer machine\nnpm run tauri:build"]
    Tag["Git tag v*"]
    GHA["GitHub Actions\n.github/workflows/release.yml"]
    MacArm["macOS aarch64 .dmg"]
    MacIntel["macOS x64 .dmg"]
    Win["Windows .msi / .exe"]
    Release["GitHub Release\n(draft)"]

    Dev --> Tag
    Tag --> GHA
    GHA --> MacArm
    GHA --> MacIntel
    GHA --> Win
    MacArm --> Release
    MacIntel --> Release
    Win --> Release
```

### Local development

```sh
npm install
npm run tauri:dev      # hot-reload frontend + native shell
npm run tauri:build    # production bundle
```

Vite serves the frontend on port **1420** during development. Production builds output to `dist/`, which Tauri embeds in the native app bundle.

---

## Project structure

```
work-pulse/
├── index.html                 # Dashboard entry
├── prompt.html                # Prompt widget entry
├── src/
│   ├── main.tsx               # Dashboard React bootstrap
│   ├── prompt-main.tsx        # Prompt React bootstrap
│   ├── Dashboard.tsx          # Main app UI
│   ├── PromptWindow.tsx       # Prompt widget UI
│   ├── api.ts                 # Tauri IPC wrappers
│   ├── time.ts                # Date/time helpers, CSV, timeline
│   ├── types.ts               # Shared TypeScript types
│   └── windows.ts             # Window invoke helpers
├── src-tauri/
│   ├── src/
│   │   ├── main.rs            # Binary entry
│   │   ├── lib.rs             # Core backend + IPC
│   │   ├── prompt_scheduler.rs
│   │   └── prompt_window.rs
│   ├── tauri.conf.json        # Tauri app + window config
│   └── capabilities/          # Tauri permissions
├── .github/workflows/
│   └── release.yml            # CI release builds
├── scripts/
│   └── reinstall-mac.sh       # Local macOS reinstall helper
├── README.md
├── INSTALL.md
├── RELEASE_PLAN.md
└── ARCHITECTURE.md            # This document
```

---

## Key design decisions

### Why two windows?

The prompt needs to behave like a **notification widget** (small, frameless, always on top, separate from the dashboard). A modal inside the main window cannot reliably appear above other applications when the dashboard is hidden.

### Why Rust for scheduling?

JavaScript `setTimeout` in the dashboard WebView is **unreliable when the window is hidden**. macOS throttles background web content. A Rust thread keeps the prompt schedule accurate while the app runs from the menu bar.

### Why SQLite?

Simple, portable, zero-config local storage. Entries, projects, and settings are relational enough to benefit from SQL but small enough to avoid a heavier database.

### Why close-to-hide?

Timesheet apps should stay available in the background and prompt without requiring the dashboard to stay open. Users expect menu-bar-style behavior on macOS.

---

## Related documents

| Document | Contents |
|---|---|
| [README.md](./README.md) | Project overview and dev setup |
| [INSTALL.md](./INSTALL.md) | End-user installation guide |
| [RELEASE_PLAN.md](./RELEASE_PLAN.md) | Versioning and release workflow |
| [DEBUG.md](./DEBUG.md) | Troubleshooting local builds |
