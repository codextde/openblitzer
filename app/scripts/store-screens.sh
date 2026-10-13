#!/usr/bin/env bash
# Captures App Store screenshots from a simulator running a build made with EXPO_PUBLIC_SCREENSHOTS=1.
# The app reads each scene from Documents/shot.txt (no deep-link prompt).
# Usage: scripts/store-screens.sh <simulator-udid> [output-dir] [langs]
set -euo pipefail

UDID="${1:?simulator udid}"
OUT="${2:-screenshots/iphone-6.9}"
LANGS="${3:-de en}"
APP=de.codext.openblitzer

restart() {
  xcrun simctl terminate "$UDID" "$APP" >/dev/null 2>&1 || true
  rm -f "$DOCS/shot.txt"
  xcrun simctl launch "$UDID" "$APP" >/dev/null
  sleep 4
}

scene() {
  printf '%s|%s' "$RANDOM$RANDOM" "$1" > "$DOCS/shot.txt"
}

shot() {
  sleep "$2"
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$LANG_DIR/$1.png" >/dev/null 2>&1
  echo "$OUT/$LANG_DIR/$1.png"
}

xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork 5g --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl location "$UDID" set 48.7784,9.1800
xcrun simctl launch "$UDID" "$APP" >/dev/null
sleep 2
DOCS="$(xcrun simctl get_app_container "$UDID" "$APP" data)/Documents"

for lang in $LANGS; do
  LANG_DIR="$lang"
  mkdir -p "$OUT/$lang"
  restart
  scene "lang=$lang&theme=light&hold=1"
  shot 01-drive-warning 9
  restart
  scene "lang=$lang&theme=dark&map=1&at=off"
  shot 02-map 8
  scene "lang=$lang&at=off&to=report"
  shot 03-report 4
  restart
  scene "lang=$lang&theme=light&map=1&at=off&to=reports"
  shot 04-confirm 6
  restart
  scene "lang=$lang&theme=dark&at=2020&hold=1"
  sleep 6
  scene "lang=$lang&at=off&to=hud"
  shot 05-hud 4
  restart
  scene "lang=$lang&theme=auto&at=off&to=settings"
  shot 06-settings 4
done

xcrun simctl status_bar "$UDID" clear
