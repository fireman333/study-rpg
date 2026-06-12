#!/usr/bin/env bash
# install-bugqueue-launchd.sh — install/uninstall the daily bug-queue launchd job.
#
# Run this yourself:  bash scripts/install-bugqueue-launchd.sh
# Touches ~/Library/LaunchAgents (system config) — that's why it's not auto-run.
#
# Usage:
#   bash scripts/install-bugqueue-launchd.sh            # install (default)
#   bash scripts/install-bugqueue-launchd.sh uninstall  # remove the job
#   bash scripts/install-bugqueue-launchd.sh test       # run the notify script once, no install
#
# To change the fire time: edit StartCalendarInterval in
# scripts/com.wlk.studyrpg.bugqueue.plist (Hour 9 / Minute 0 = 09:00 daily),
# then re-run `install` — it re-copies the plist and reloads the job.
#
# Note: the FIRST time a notification fires, macOS may prompt you to allow
# notifications from "Script Editor" / "terminal-notifier" — click Allow,
# otherwise notifications are silently dropped.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.wlk.studyrpg.bugqueue"
PLIST_SRC="$REPO_ROOT/scripts/$LABEL.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"

ACTION="${1:-install}"

case "$ACTION" in

  install)
    if [ ! -f "$PLIST_SRC" ]; then
      echo "❌ template plist not found: $PLIST_SRC"
      exit 1
    fi
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$PLIST_SRC" "$PLIST_DST"
    echo "✅ copied plist → $PLIST_DST"

    # Unload first in case an older copy is already loaded (ignore errors).
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load "$PLIST_DST"
    echo "✅ launchd job loaded: $LABEL (fires daily at 09:00)"
    echo ""
    echo "Verify it's registered:"
    echo "    launchctl list | grep bugqueue"
    echo ""
    echo "Test it immediately (fires the job once right now):"
    echo "    launchctl start $LABEL"
    echo "    # then check the log:"
    echo "    tail -20 \"$REPO_ROOT/bug-queue/notify.log\""
    echo ""
    echo "Change the time: edit StartCalendarInterval in"
    echo "    $PLIST_SRC"
    echo "then re-run: bash scripts/install-bugqueue-launchd.sh"
    ;;

  uninstall)
    if [ -f "$PLIST_DST" ]; then
      launchctl unload "$PLIST_DST" 2>/dev/null || true
      rm "$PLIST_DST"
      echo "✅ unloaded + removed $PLIST_DST"
    else
      echo "❌ not installed (no $PLIST_DST) — nothing to do"
      exit 1
    fi
    ;;

  test)
    echo "▶ running bug-queue-notify.sh once (no install)…"
    if bash "$REPO_ROOT/scripts/bug-queue-notify.sh"; then
      echo "✅ run finished — you should have seen a notification if there were new bugs"
      echo "   (set BUGQUEUE_NOTIFY_ALWAYS=1 to force a notification on 0-bug days)"
    else
      echo "❌ run failed — see $REPO_ROOT/bug-queue/notify.log"
      exit 1
    fi
    ;;

  *)
    echo "❌ unknown action: $ACTION (expected: install | uninstall | test)"
    exit 1
    ;;
esac
