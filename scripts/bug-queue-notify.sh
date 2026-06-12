#!/usr/bin/env bash
# bug-queue-notify.sh — daily bug-report import + desktop notification wrapper.
#
# Called by launchd (com.wlk.studyrpg.bugqueue) once a day, but is safe to run
# by hand for testing:
#
#   bash scripts/bug-queue-notify.sh
#
# What it does:
#   1. Runs scripts/bug-fix-queue.mjs (pulls Supabase bug reports, writes the
#      local fix queue under bug-queue/).
#   2. Parses the script's single-line contract on stdout:
#        BUGQUEUE_SUMMARY neurons-tw=<n> medexam2-hospital-tw=<n> total_new=<sum> total_active=<n> ts=<ISO8601>
#   3. Posts a macOS notification when there are new bugs (or on failure).
#
# Env flags:
#   BUGQUEUE_NOTIFY_ALWAYS=1  → also notify on "0 new bugs" days (default: silent).
#
# Logs (debug trail when launchd "silently does nothing"):
#   bug-queue/notify.log

set -euo pipefail

# --- Locate repo root (script lives in <repo>/scripts/) -----------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/bug-queue"
LOG_FILE="$LOG_DIR/notify.log"
mkdir -p "$LOG_DIR"

log() {
  # Append a timestamped line to the log file.
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

# --- Notification helper -------------------------------------------------------
# Prefers terminal-notifier (nicer, clickable) when installed; falls back to
# osascript `display notification`. Both may trigger a one-time macOS
# notification-permission prompt on first use.
notify() {
  local title="$1"
  local body="$2"

  if command -v terminal-notifier >/dev/null 2>&1; then
    terminal-notifier -title "$title" -message "$body" -sound Glass >/dev/null 2>&1 || true
  else
    # Escape backslashes then double quotes so the strings survive inside the
    # AppleScript double-quoted literals.
    local esc_title esc_body
    esc_title=$(printf '%s' "$title" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    esc_body=$(printf '%s' "$body" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    osascript -e "display notification \"$esc_body\" with title \"$esc_title\" sound name \"Glass\"" >/dev/null 2>&1 || true
  fi
}

# --- Find node ------------------------------------------------------------------
# #1 launchd gotcha: launchd agents run with a MINIMAL PATH
# (/usr/bin:/bin:/usr/sbin:/sbin) — no Homebrew, no nvm shims. `node` is almost
# never on that PATH, so we must resolve an absolute node binary ourselves:
#   1. `command -v node`           — works when run by hand from a normal shell
#                                    (and the plist also injects a saner PATH).
#   2. Common absolute locations   — Homebrew (Apple Silicon + Intel).
#   3. Newest nvm-installed node   — $HOME/.nvm/versions/node/v*/bin/node.
# If all fail: notify + exit 1 (better a loud notification than a silent no-op).
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$NODE_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  # Pick the highest-versioned nvm node (sort -V = version sort).
  nvm_node="$(ls -1d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$nvm_node" ] && [ -x "$nvm_node" ]; then
    NODE_BIN="$nvm_node"
  fi
fi
if [ -z "$NODE_BIN" ]; then
  log "ERROR: no node binary found (PATH=$PATH)"
  notify "🐞 bug-queue 匯入失敗" "bug-queue: node 找不到"
  exit 1
fi
log "using node: $NODE_BIN"

# --- Run the import -------------------------------------------------------------
# Capture stdout+stderr AND the exit code without letting `set -e` abort the
# script mid-capture: temporarily disable -e around the command substitution.
set +e
OUTPUT="$("$NODE_BIN" scripts/bug-fix-queue.mjs 2>&1)"
IMPORT_EXIT=$?
set -e

# Full output goes to the log (debug trail).
{
  printf '===== %s bug-fix-queue.mjs (exit=%d) =====\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$IMPORT_EXIT"
  printf '%s\n' "$OUTPUT"
} >> "$LOG_FILE"

# --- Parse the BUGQUEUE_SUMMARY contract line ------------------------------------
SUMMARY="$(printf '%s\n' "$OUTPUT" | grep '^BUGQUEUE_SUMMARY' | tail -1 || true)"

if [ "$IMPORT_EXIT" -ne 0 ] || [ -z "$SUMMARY" ]; then
  log "FAILED: exit=$IMPORT_EXIT summary_line_found=$([ -n "$SUMMARY" ] && echo yes || echo no)"
  notify "🐞 bug-queue 匯入失敗" "看 bug-queue/notify.log"
  exit 1
fi

# Extract key=value fields with sed (dependency-free; no jq).
extract_field() {
  # extract_field <key> <summary-line> → value, or empty if absent
  printf '%s\n' "$2" | sed -n "s/.*[[:space:]]$1=\([^[:space:]]*\).*/\1/p"
}

TOTAL_NEW="$(extract_field 'total_new' "$SUMMARY")"
NEURONS_NEW="$(extract_field 'neurons-tw' "$SUMMARY")"
M2_NEW="$(extract_field 'medexam2-hospital-tw' "$SUMMARY")"

# Guard against a malformed summary line (treat as failure).
case "$TOTAL_NEW" in
  ''|*[!0-9]*)
    log "FAILED: BUGQUEUE_SUMMARY present but total_new unparsable: $SUMMARY"
    notify "🐞 bug-queue 匯入失敗" "看 bug-queue/notify.log"
    exit 1
    ;;
esac
NEURONS_NEW="${NEURONS_NEW:-0}"
M2_NEW="${M2_NEW:-0}"

log "summary: $SUMMARY"

# --- Notification logic -----------------------------------------------------------
if [ "$TOTAL_NEW" -eq 0 ]; then
  if [ "${BUGQUEUE_NOTIFY_ALWAYS:-0}" = "1" ]; then
    notify "✅ 今天沒有新 bug" "neurons $NEURONS_NEW · 二階 $M2_NEW"
    log "no new bugs (notified — BUGQUEUE_NOTIFY_ALWAYS=1)"
  else
    log "no new bugs (silent)"
  fi
else
  notify "🐞 新 bug report：${TOTAL_NEW} 件" "neurons $NEURONS_NEW · 二階 $M2_NEW　→ 開 Claude Code 說「修 bug」"
  log "notified: total_new=$TOTAL_NEW (neurons=$NEURONS_NEW, m2=$M2_NEW)"
fi

exit 0
