#!/usr/bin/env bash
# smoke-presign-sv.sh — manual smoke for add-bundle-schema-version-guard P1.
#
# Verifies the /presign endpoint's schema_version downgrade refusal across
# 5 scenarios:
#   1. First PUT (no existing blob, opt-in SV) → 200 + requiredHeaders includes SV header
#   2. PUT with SV < existing → 409 r2_schema_downgrade_refused
#   3. PUT with SV === existing → 200 + requiredHeaders
#   4. PUT with SV > existing → 200 + requiredHeaders, metadata bumps after the PUT round-trip
#   5. GET op with SV included → SV ignored, 200 with no requiredHeaders
#
# Prerequisites:
#   1. `cd cloudflare/sync-worker && wrangler dev` running on :8787 (default).
#      Use --persist-to ./.smoke-r2-state to retain R2 emulator state across
#      scenarios (otherwise restart wipes the blob between scenarios 1 and 2).
#   2. Export TEST_JWT — a real Supabase session token for the test user.
#      Easiest: open https://med-study-rpg.com/2nd/ in browser, sign in,
#      open devtools → Application → Local Storage → find `sb-*-auth-token`,
#      copy `access_token` field. JWT must validate against the JWKS the
#      Worker is configured for (SUPABASE_JWKS_URL in wrangler.toml dev vars).
#   3. (Optional) Override WORKER_URL if dev is not on default :8787:
#        export WORKER_URL=http://localhost:8787
#   4. (Optional) Override BUNDLE if you want to test a different bundle:
#        export BUNDLE=neurons    # default: m2
#
# Usage:
#   chmod +x scripts/smoke-presign-sv.sh
#   TEST_JWT=eyJhbGc... bash scripts/smoke-presign-sv.sh
#
# Exit 0 = all 5 scenarios pass.

set -uo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787}"
BUNDLE="${BUNDLE:-m2}"

if [ -z "${TEST_JWT:-}" ]; then
  echo "ERROR: TEST_JWT environment variable not set." >&2
  echo "See script header for how to obtain a valid Supabase session token." >&2
  exit 2
fi

pass_count=0
fail_count=0

# Helper: POST /presign with the given JSON body, capture status + body.
# Sets $status and $body (via command substitution caller pattern).
presign() {
  local body_json="$1"
  curl -sS -o /tmp/smoke-presign-body -w "%{http_code}" \
    -X POST "$WORKER_URL/presign" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_JWT" \
    -d "$body_json"
}

# Helper: report PASS/FAIL.
check() {
  local label="$1"
  local condition="$2"   # already-evaluated true/false string
  if [ "$condition" = "true" ]; then
    echo "[smoke] PASS — $label"
    pass_count=$((pass_count + 1))
  else
    echo "[smoke] FAIL — $label"
    fail_count=$((fail_count + 1))
  fi
}

# Reset: nuke any prior state so scenarios start clean.
echo ""
echo "=== setup: POST /reset to clear test user's R2 state ==="
reset_status=$(curl -sS -o /tmp/smoke-reset-body -w "%{http_code}" \
  -X POST "$WORKER_URL/reset" \
  -H "Authorization: Bearer $TEST_JWT")
echo "/reset returned HTTP $reset_status"
if [ "$reset_status" != "200" ]; then
  echo "WARN: /reset did not return 200; subsequent scenarios may see stale state." >&2
fi

# -----------------------------------------------------------------------------
# Scenario 1: First PUT, no existing blob, SV=4 → expect 200 + requiredHeaders
# -----------------------------------------------------------------------------
echo ""
echo "=== Scenario 1: first PUT (no existing blob), schema_version=4 ==="
s1_status=$(presign "{\"bundle\":\"$BUNDLE\",\"op\":\"put\",\"schema_version\":4}")
s1_body=$(cat /tmp/smoke-presign-body)
s1_required=$(echo "$s1_body" | jq -r '.requiredHeaders["x-amz-meta-schema-version"] // empty')
echo "HTTP $s1_status"
echo "Body: $s1_body" | head -c 300; echo ""
[ "$s1_status" = "200" ] && [ "$s1_required" = "4" ] \
  && check "scenario 1 first PUT accepted with requiredHeaders.x-amz-meta-schema-version=4" "true" \
  || check "scenario 1 first PUT accepted with requiredHeaders.x-amz-meta-schema-version=4 (got status=$s1_status required=$s1_required)" "false"

# To commit metadata into R2, the client must actually PUT the body with
# the signed header. We do that via the URL returned in step 1.
echo ""
echo "=== Scenario 1b: actually PUT body to R2 so customMetadata gets stored ==="
s1_url=$(echo "$s1_body" | jq -r .url)
if [ -n "$s1_url" ] && [ "$s1_url" != "null" ]; then
  # Use a small gzipped dummy body. Header MUST match what Worker signed.
  echo "dummy-bundle-content-v4" | gzip -c > /tmp/smoke-bundle.gz
  put_status=$(curl -sS -o /tmp/smoke-put-body -w "%{http_code}" \
    -X PUT "$s1_url" \
    -H "Content-Type: application/gzip" \
    -H "x-amz-meta-schema-version: 4" \
    --data-binary @/tmp/smoke-bundle.gz)
  echo "PUT to R2 returned HTTP $put_status"
  [ "$put_status" = "200" ] || [ "$put_status" = "201" ] || [ "$put_status" = "204" ] \
    && check "scenario 1b PUT to R2 succeeded with signed header" "true" \
    || check "scenario 1b PUT to R2 succeeded (got $put_status; body $(cat /tmp/smoke-put-body | head -c 200))" "false"
else
  check "scenario 1b prerequisite — presign URL extracted" "false"
fi

# -----------------------------------------------------------------------------
# Scenario 2: PUT with SV=3 (lower than existing 4) → expect 409 with cloud=4 incoming=3
# -----------------------------------------------------------------------------
echo ""
echo "=== Scenario 2: PUT schema_version=3 (downgrade from existing 4) ==="
s2_status=$(presign "{\"bundle\":\"$BUNDLE\",\"op\":\"put\",\"schema_version\":3}")
s2_body=$(cat /tmp/smoke-presign-body)
s2_error=$(echo "$s2_body" | jq -r .error // empty)
s2_cloud=$(echo "$s2_body" | jq -r .cloud // empty)
s2_incoming=$(echo "$s2_body" | jq -r .incoming // empty)
echo "HTTP $s2_status"
echo "Body: $s2_body"
[ "$s2_status" = "409" ] && [ "$s2_error" = "r2_schema_downgrade_refused" ] && [ "$s2_cloud" = "4" ] && [ "$s2_incoming" = "3" ] \
  && check "scenario 2 downgrade refused with correct error body" "true" \
  || check "scenario 2 downgrade refused (got status=$s2_status error=$s2_error cloud=$s2_cloud incoming=$s2_incoming)" "false"

# -----------------------------------------------------------------------------
# Scenario 3: PUT with SV=4 (equal to existing) → expect 200
# -----------------------------------------------------------------------------
echo ""
echo "=== Scenario 3: PUT schema_version=4 (equal to existing) ==="
s3_status=$(presign "{\"bundle\":\"$BUNDLE\",\"op\":\"put\",\"schema_version\":4}")
s3_body=$(cat /tmp/smoke-presign-body)
s3_required=$(echo "$s3_body" | jq -r '.requiredHeaders["x-amz-meta-schema-version"] // empty')
echo "HTTP $s3_status"
[ "$s3_status" = "200" ] && [ "$s3_required" = "4" ] \
  && check "scenario 3 equal SV accepted" "true" \
  || check "scenario 3 equal SV accepted (got status=$s3_status required=$s3_required)" "false"

# -----------------------------------------------------------------------------
# Scenario 4: PUT with SV=5 (higher than existing) → expect 200, then bump metadata
# -----------------------------------------------------------------------------
echo ""
echo "=== Scenario 4: PUT schema_version=5 (higher than existing) ==="
s4_status=$(presign "{\"bundle\":\"$BUNDLE\",\"op\":\"put\",\"schema_version\":5}")
s4_body=$(cat /tmp/smoke-presign-body)
s4_required=$(echo "$s4_body" | jq -r '.requiredHeaders["x-amz-meta-schema-version"] // empty')
echo "HTTP $s4_status"
[ "$s4_status" = "200" ] && [ "$s4_required" = "5" ] \
  && check "scenario 4 higher SV accepted with new requiredHeaders" "true" \
  || check "scenario 4 higher SV accepted (got status=$s4_status required=$s4_required)" "false"

# -----------------------------------------------------------------------------
# Scenario 5: GET op with schema_version field → should be ignored, no requiredHeaders
# -----------------------------------------------------------------------------
echo ""
echo "=== Scenario 5: GET op with schema_version=99 (should be ignored) ==="
s5_status=$(presign "{\"bundle\":\"$BUNDLE\",\"op\":\"get\",\"schema_version\":99}")
s5_body=$(cat /tmp/smoke-presign-body)
s5_required=$(echo "$s5_body" | jq -r '.requiredHeaders // empty')
echo "HTTP $s5_status"
[ "$s5_status" = "200" ] && [ "$s5_required" = "" -o "$s5_required" = "null" -o "$s5_required" = "{}" ] \
  && check "scenario 5 GET ignores SV field, no requiredHeaders" "true" \
  || check "scenario 5 GET (got status=$s5_status required=$s5_required)" "false"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  smoke summary: $pass_count pass / $fail_count fail / 6 total"
echo "============================================================"
if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
exit 0
