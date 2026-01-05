#!/bin/bash
# Launch Chrome with CDP for EscapeMint automation

CDP_PORT="${CDP_PORT:-5549}"
BROWSER_DIR="${BROWSER_DIR:-./.browser}"

exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$BROWSER_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-ipc-flooding-protection
