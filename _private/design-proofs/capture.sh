#!/usr/bin/env bash
# Capture the design-proof screenshots for Bonjour Cruise.
# Usage: ./capture.sh <before|after> [port]
# Serves nothing itself: point PORT at an already-running static server on dist/.
set -euo pipefail

PHASE="${1:?usage: capture.sh <before|after> [port]}"
PORT="${2:-4821}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$(cd "$(dirname "$0")" && pwd)"

# page:width:height, one capture per line. 375 is the small-phone reference,
# 1440 the desktop reference.
SHOTS=(
  "index.html:375:1100"
  "index.html:1440:1000"
  "cruises.html:375:1400"
  "cruises.html:1440:1100"
  "contact.html:375:1500"
  "contact.html:1440:1100"
  "discover.html:375:1400"
  "discover.html:1440:1100"
  "privacy-policy.html:375:1400"
  "privacy-policy.html:1440:1100"
)

for shot in "${SHOTS[@]}"; do
  IFS=':' read -r page w h <<< "$shot"
  name="${page%.html}"
  file="$OUT/${PHASE}-${name}-${w}.png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --screenshot="$file" --window-size="${w},${h}" \
    --virtual-time-budget=5000 \
    "http://localhost:${PORT}/${page}" >/dev/null 2>&1
  echo "$(basename "$file")"
done
