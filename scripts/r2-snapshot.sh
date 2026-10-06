#!/usr/bin/env bash
# Pre-deploy snapshot of every player cloud save: study-rpg-saves/users/* → study-rpg-saves-backup/backup/<ts>/users/*
# (server-side CopyObject, no bytes transit this machine). Retention is the bucket's lifecycle rule
# (backup/ prefix, 30 days) — nothing here lists or deletes.
#
# Called explicitly at the front of every deploy command (`bash scripts/r2-snapshot.sh && …`), not as a
# `predeploy` lifecycle script: pnpm ignores pre/post scripts unless enable-pre-post-scripts is set.
# Exits non-zero, naming the missing thing, before any copy is attempted — a failed snapshot blocks the deploy.
#
# Credentials: R2_SNAPSHOT_ACCESS_KEY_ID / R2_SNAPSHOT_SECRET_ACCESS_KEY / R2_ACCOUNT_ID from the environment
# (CI secrets), or from ~/.config/study-rpg/r2-snapshot.env when that file exists (local operator).
# Change: fit-sync-worker-under-free-plan-cpu-limit. Keep byte-identical with the copy in study-rpg-2nd/scripts/.
set -euo pipefail

ENV_FILE="${R2_SNAPSHOT_ENV_FILE:-$HOME/.config/study-rpg/r2-snapshot.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

fail() { echo "r2-snapshot: $*" >&2; exit 1; }
command -v rclone >/dev/null 2>&1 || fail "rclone not found on PATH (brew install rclone / apt-get install rclone)"
for v in R2_SNAPSHOT_ACCESS_KEY_ID R2_SNAPSHOT_SECRET_ACCESS_KEY R2_ACCOUNT_ID; do
  [[ -n "${!v:-}" ]] || fail "$v is unset (expected in env or $ENV_FILE)"
done

export RCLONE_CONFIG=/dev/null   # env-defined remote only; silences the "config file not found" notice
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_SNAPSHOT_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SNAPSHOT_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

SRC="r2:study-rpg-saves/users"
PREFIX="backup/$(date -u +%Y%m%dT%H%M%SZ)"
DST="r2:study-rpg-saves-backup/${PREFIX}/users"

echo "r2-snapshot: ${SRC} → ${DST}"
rclone copy "$SRC" "$DST" --s3-no-check-bucket --stats-one-line --stats 0 || fail "rclone copy failed (prefix ${PREFIX})"
# Belt and braces: a copy that exited 0 but skipped objects would still leave the counts apart.
src_n=$(rclone size "$SRC" --json | sed -E 's/.*"count":([0-9]+).*/\1/')
dst_n=$(rclone size "$DST" --json | sed -E 's/.*"count":([0-9]+).*/\1/')
[[ "$src_n" == "$dst_n" ]] || fail "object count mismatch after copy: source=${src_n} snapshot=${dst_n} (prefix ${PREFIX})"
echo "snapshot: ${PREFIX} (${dst_n} objects)"
