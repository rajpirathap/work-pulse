# Installing Work Pulse

Work Pulse is a desktop app for macOS and Windows. You do **not** need Node.js, Rust, Docker, or a terminal to install it.

## Download

1. Open the [Work Pulse Releases](https://github.com/rajpirathap/work-pulse/releases) page on GitHub.
2. Download the installer that matches your computer:

| Your computer | Download |
|---|---|
| Mac with Apple Silicon (M1/M2/M3/M4) | `.dmg` file with `aarch64` in the name |
| Mac with Intel chip | `.dmg` file with `x64` in the name |
| Windows | `.msi` or `.exe` setup file |

If you are unsure which Mac you have, click the Apple menu → **About This Mac** and check the chip type.

## macOS installation

1. Open the downloaded `.dmg` file.
2. Drag **Work Pulse** into the **Applications** folder.
3. Open **Applications** and launch **Work Pulse**.

### First launch on macOS

Because the app is not signed with an Apple Developer certificate yet, macOS may block it the first time.

If you see **"Work Pulse can't be opened"**:

1. Open **System Settings** → **Privacy & Security**.
2. Scroll down and click **Open Anyway**, or
3. Right-click the app in Applications → **Open** → **Open** again.

After the first successful launch, you can open it normally.

## Windows installation

1. Run the downloaded `.exe` or `.msi` installer.
2. Follow the setup prompts.
3. Open **Work Pulse** from the Start menu.

### First launch on Windows

Windows SmartScreen may show a warning for unsigned apps.

1. Click **More info**.
2. Click **Run anyway**.

## After installation

1. Leave Work Pulse running in the background (menu bar on macOS, system tray on Windows).
2. Closing the main window hides Work Pulse — it keeps running and prompts still appear.
3. Prompts open in a small always-on-top window above your other apps.
4. Use the menu bar/tray icon to open the dashboard, trigger a prompt, or quit.
5. Your entries are saved locally on your computer.
6. Use the weekly summary and CSV export when filling in your timesheet.

### Menu bar / tray controls

- **Open Dashboard** — show the main timesheet view
- **Prompt Now** — open the prompt immediately
- **Quit Work Pulse** — fully exit the app (prompts stop after this)

## Where your data is stored

All data stays on your machine in a local SQLite database:

- **macOS:** `~/Library/Application Support/com.workpulse.app/work-pulse.sqlite`
- **Windows:** `%APPDATA%\com.workpulse.app\work-pulse.sqlite`

No account or internet connection is required.

## Troubleshooting

**I see two Work Pulse apps**

You likely have both of these:

- `/Applications/Work Pulse.app` — the real install (use this one)
- `src-tauri/target/release/bundle/macos/Work Pulse.app` — local build output (do not launch this)

Only keep and launch the copy in **Applications**. To reinstall cleanly:

```sh
chmod +x scripts/reinstall-mac.sh
./scripts/reinstall-mac.sh
```

**The prompt does not appear over other apps**

- Use the menu bar icon → **Prompt Now**
- Make sure only one Work Pulse instance is running
- On macOS, allow Work Pulse in **System Settings → Privacy & Security → Accessibility** if needed

**The app does not prompt me**

- Check that Work Pulse is still running.
- Open the app and confirm the prompt interval in Settings.
- Quiet hours may be suppressing prompts.

**I need help**

- [Open an issue](https://github.com/rajpirathap/work-pulse/issues) on GitHub, or
- Contact the person who shared the installer with you.

## Updating

1. Download the latest release for your platform.
2. Install over the existing app.
3. Your local data should remain in place.
