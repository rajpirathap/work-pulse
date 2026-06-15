# Debugging Work Pulse

## Root cause found (Jun 2026)

Installs were copying an **old build** from `src-tauri/target/` while newer builds went to a sandbox cache folder. The installed app did not include `prompt.html` or the floating widget changes.

Always reinstall with:

```sh
./scripts/reinstall-mac.sh
```

This script now sets `CARGO_TARGET_DIR` so builds land in `src-tauri/target/` and the correct app is copied to `/Applications`.

## Only run one copy

You may see two `Work Pulse.app` folders:

| Path | Use? |
|---|---|
| `/Applications/Work Pulse.app` | Yes |
| `src-tauri/target/release/bundle/macos/Work Pulse.app` | No — build output only |

Do **not** use `open -a "Work Pulse"` if both exist — macOS may launch the wrong one. Use:

```sh
open "/Applications/Work Pulse.app"
```

Do not run `npm run tauri:dev` while the installed app is open.

## Quick test for the prompt widget

1. Launch: `open "/Applications/Work Pulse.app"`
2. Open Safari or another app
3. Menu bar → Work Pulse → **Prompt Now**
4. Expect a small frameless card in the **bottom-right**

## View logs

```sh
log stream --predicate 'process == "work_pulse"' --level debug
```

Look for:

- `[work-pulse] prompt window shown` — success
- `[work-pulse] prompt window with label 'prompt' was not found` — config/window issue
- `[work-pulse] failed to show prompt window` — macOS window error

## Verify installed binary is current

```sh
strings "/Applications/Work Pulse.app/Contents/MacOS/work_pulse" | rg "prompt\.html"
```

If this prints nothing, the installed app is outdated — run `./scripts/reinstall-mac.sh` again.

## Verify only one process

```sh
pgrep -fl work_pulse
```

You should see **one** line pointing to `/Applications/Work Pulse.app/...`.

If it points to `src-tauri/target/...`, quit it and launch from Applications only:

```sh
pkill -x work_pulse
open "/Applications/Work Pulse.app"
```

## Common issues

**Prompt only appears over the main dashboard**

- Old build installed → reinstall with script above
- Two instances running → kill all, launch Applications copy only

**Prompt never appears**

- Work Pulse not running (check menu bar icon)
- Quiet hours enabled in Settings
- Main window scheduler paused if app was fully quit — use tray → Prompt Now to test

**macOS blocks floating window**

- System Settings → Privacy & Security → Accessibility → allow Work Pulse (if listed)
