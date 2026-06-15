#!/bin/sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Work Pulse"
APP_PATH="/Applications/${APP_NAME}.app"
TARGET_DIR="$ROOT/src-tauri/target"
BUNDLE_PATH="$TARGET_DIR/release/bundle/macos/${APP_NAME}.app"

export CARGO_TARGET_DIR="$TARGET_DIR"

echo "Stopping any running ${APP_NAME} instances..."
pkill -x "$APP_NAME" 2>/dev/null || true
pkill -f "work_pulse" 2>/dev/null || true
sleep 1

echo "Removing old install from Applications..."
rm -rf "$APP_PATH"

echo "Building ${APP_NAME}..."
cd "$ROOT"
source "$HOME/.cargo/env"
npm run tauri:build

echo "Installing to Applications..."
if [ ! -d "$BUNDLE_PATH" ]; then
  echo "Build output not found at: $BUNDLE_PATH"
  exit 1
fi
cp -R "$BUNDLE_PATH" "$APP_PATH"

echo "Launching ${APP_NAME} from Applications..."
open "$APP_PATH"

echo "Done. Use only /Applications/${APP_NAME}.app"
echo "Do not launch the copy inside src-tauri/target/release/bundle/macos/"
