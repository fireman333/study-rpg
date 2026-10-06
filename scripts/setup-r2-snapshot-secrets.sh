#!/usr/bin/env bash
# One-time owner setup for the pre-deploy R2 snapshot (change fit-sync-worker-under-free-plan-cpu-limit).
# Prompts for the R2 S3 token pair (never echoed, never passed through a session), writes the local
# env file, and pushes the same pair to the study-rpg GitHub Actions secrets.
set -euo pipefail
ENV_FILE="$HOME/.config/study-rpg/r2-snapshot.env"
ACCOUNT_ID="43631a35f33f4132484a6ce024cc502a"
REPO="fireman333/study-rpg"

read -r -p "R2 Access Key ID: " KEY_ID
read -r -s -p "R2 Secret Access Key (hidden): " SECRET; echo
[[ -n "$KEY_ID" && -n "$SECRET" ]] || { echo "both values are required" >&2; exit 1; }

umask 077
mkdir -p "$(dirname "$ENV_FILE")"
cat > "$ENV_FILE" <<ENV
R2_SNAPSHOT_ACCESS_KEY_ID=$KEY_ID
R2_SNAPSHOT_SECRET_ACCESS_KEY=$SECRET
R2_ACCOUNT_ID=$ACCOUNT_ID
ENV
chmod 600 "$ENV_FILE"
echo "wrote $ENV_FILE (mode 600)"

printf '%s' "$KEY_ID" | gh secret set R2_SNAPSHOT_ACCESS_KEY_ID --repo "$REPO"
printf '%s' "$SECRET" | gh secret set R2_SNAPSHOT_SECRET_ACCESS_KEY --repo "$REPO"
echo "GitHub secrets set on $REPO"

# Smoke: list the two buckets with the new credential (read-only, no copy).
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET" \
  RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT_ID.r2.cloudflarestorage.com"
if command -v rclone >/dev/null; then
  echo "smoke: objects under study-rpg-saves/users = $(rclone size r2:study-rpg-saves/users --json | sed -E 's/.*"count":([0-9]+).*/\1/')"
  rclone lsd r2:study-rpg-saves-backup/backup/ >/dev/null && echo "smoke: backup bucket reachable"
else
  echo "rclone not on PATH yet — skip smoke (brew install may still be running)"
fi
