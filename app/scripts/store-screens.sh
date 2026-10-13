#!/usr/bin/env bash
# Captures App Store screenshots from a simulator running a build made with EXPO_PUBLIC_SCREENSHOTS=1.
# Usage: scripts/store-screens.sh <simulator-udid> [output-dir] [langs]
set -euo pipefail

UDID="${1:?simulator udid}"
OUT="${2:-../build/screens/store}"
LANGS="${3:-de en}"
APP=de.codext.openblitzer

shot() {
  sleep "$2"
  xcrun simctl io "$UDID" screenshot --type=png "$OUT/$1.png" >/dev/null
  echo "$OUT/$1.png"
}

open() {
  xcrun simctl openurl "$UDID" "openblitzer://$1"
}

mkdir -p "$OUT"
xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork 5g --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl location "$UDID" set 52.5200,13.4180

for lang in $LANGS; do
  xcrun simctl terminate "$UDID" "$APP" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$APP" >/dev/null
  sleep 3
  open "demo?lang=$lang&theme=light&hold=1"
  shot "$lang-1-drive" 8
  open "demo?lang=$lang&at=off&to=report"
  shot "$lang-2-report" 3
  xcrun simctl terminate "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$APP" >/dev/null
  sleep 3
  open "demo?lang=$lang&theme=dark&at=2020&hold=1"
  shot "$lang-3-drive-dark" 8
  open "demo?lang=$lang&at=off&to=reports"
  shot "$lang-4-reports" 3
  open "demo?lang=$lang&at=off&to=hud"
  shot "$lang-5-hud" 3
  xcrun simctl terminate "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$APP" >/dev/null
  sleep 3
  open "demo?lang=$lang&theme=auto&at=off&to=settings"
  shot "$lang-6-settings" 3
done

xcrun simctl status_bar "$UDID" clear
