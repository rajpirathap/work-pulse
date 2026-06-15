# Work Pulse

[![Release](https://github.com/rajpirathap/work-pulse/actions/workflows/release.yml/badge.svg)](https://github.com/rajpirathap/work-pulse/actions/workflows/release.yml)

Work Pulse is a local desktop timesheet assistant for macOS and Windows.

**Repository:** [github.com/rajpirathap/work-pulse](https://github.com/rajpirathap/work-pulse) It asks
"What are you doing?" at a configurable interval, saves each answer locally, and
groups the week into timesheet-friendly totals.

## Features

- Cross-platform desktop shell with Tauri, React, and TypeScript.
- Local SQLite storage in the app data directory.
- Configurable prompt interval and quiet hours.
- Prompt actions for save, skip, and snooze.
- Manual quick entry for missed work.
- Editable daily timeline with inferred durations.
- Weekly summary grouped by project and task.
- CSV export for timesheet entry.

## For end users

If you only want to install the app, see [INSTALL.md](./INSTALL.md).

Download the latest `.dmg` (macOS) or `.exe`/`.msi` (Windows) from the GitHub
Releases page. No Node.js or Rust required.

## For developers

Install Node.js and Rust first. Tauri also requires the platform-specific desktop
build dependencies listed in the [Tauri documentation](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri:dev
```

To build only the web frontend:

```sh
npm run build
```

To package the desktop app:

```sh
npm run tauri:build
```

To regenerate app icons:

```sh
npm run tauri:icon
```

## Releasing

See [RELEASE_PLAN.md](./RELEASE_PLAN.md) for versioning, tagging, and automated
GitHub Actions builds.

## Data

The app stores data locally in a SQLite database named `work-pulse.sqlite` under
the operating system's app data directory. No account, cloud sync, or external
server is required.
