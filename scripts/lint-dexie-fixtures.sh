#!/usr/bin/env bash
# lint-dexie-fixtures.sh — enforce that Dexie schema .version(N) bumps ship with
# a Vitest fixture exercising the v(N-1) → v(N) upgrade path.
#
# Reference: openspec/changes/archive/2026-05-27-fix-doctor-retire-cloud-resurrection-v2/
#   tasks.md §8.12 (canonical fixture).
# Canonical fixture file: apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts
# Pitfall doc: ~/.claude/imports/dexie_pk_change_pitfall.md
# Rule doc: docs/DEXIE_UPGRADE_FIXTURE_RULE.md
#
# Usage:
#   BASE_REF=origin/main HEAD_REF=HEAD bash scripts/lint-dexie-fixtures.sh
#   SKIP_DEXIE_FIXTURE_LINT=1 bash scripts/lint-dexie-fixtures.sh    # emergency bypass
#
# Self-test recipe (run from repo root):
#   1. echo '    this.version(99).stores({ foo: "++id" })' >> apps/medexam2-hospital-tw/src/db/schema.ts
#   2. git add apps/medexam2-hospital-tw/src/db/schema.ts && git commit -m wip
#   3. BASE_REF=HEAD~1 HEAD_REF=HEAD bash scripts/lint-dexie-fixtures.sh
#      → expect exit 1 with v98 → v99 violation
#   4. git reset HEAD~1 --hard   # revert the synthetic bump

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
HEAD_REF="${HEAD_REF:-HEAD}"

# ---- Escape hatch ----------------------------------------------------------
if [ "${SKIP_DEXIE_FIXTURE_LINT:-0}" = "1" ]; then
  echo "============================================================" >&2
  echo "  BYPASS: SKIP_DEXIE_FIXTURE_LINT=1 set — Dexie fixture" >&2
  echo "  lint SKIPPED. This bypass must be paired with a follow-up" >&2
  echo "  PR to either add the missing fixture or fix the regex." >&2
  echo "  See docs/DEXIE_UPGRADE_FIXTURE_RULE.md" >&2
  echo "============================================================" >&2
  exit 0
fi

# ---- Discover Dexie schema files ------------------------------------------
# Heuristic: TypeScript file under apps/** or packages/** that contains BOTH
# `this.version(` and `.stores(` — strong signal it's a Dexie schema class.
# Exclude node_modules, dist, and __tests__ themselves.
SCHEMA_FILES=$(git ls-files 'apps/**/*.ts' 'packages/**/*.ts' 2>/dev/null \
  | grep -v -E '(^|/)(node_modules|dist|__tests__)(/|$)' \
  | (xargs grep -l 'this\.version(' 2>/dev/null || true) \
  | (xargs grep -l '\.stores(' 2>/dev/null || true))

if [ -z "$SCHEMA_FILES" ]; then
  echo "[lint:dexie] No Dexie schema files found in tree. Nothing to lint."
  exit 0
fi

# ---- Compare base vs head for each schema file ----------------------------
violations=()

for schema_file in $SCHEMA_FILES; do
  # Extract sorted, unique version numbers at base ref.
  base_versions=$(git show "$BASE_REF:$schema_file" 2>/dev/null \
    | grep -oE 'this\.version\([0-9]+\)' \
    | grep -oE '[0-9]+' | sort -nu || true)
  # Extract at head ref.
  head_versions=$(git show "$HEAD_REF:$schema_file" 2>/dev/null \
    | grep -oE 'this\.version\([0-9]+\)' \
    | grep -oE '[0-9]+' | sort -nu || true)

  # Newly added versions = head set − base set.
  if [ -z "$head_versions" ]; then
    continue
  fi
  if [ -z "$base_versions" ]; then
    new_versions="$head_versions"
  else
    # comm requires LEXICALLY-sorted input; base/head_versions are numeric-sorted
    # (`sort -nu`), which diverges from lexical order at double digits (e.g. v10 <
    # v2 lexically). Re-sort both lexically here so comm doesn't abort with
    # "input is not in sorted order" once a schema reaches version 10+.
    new_versions=$(comm -23 <(echo "$head_versions" | sort) <(echo "$base_versions" | sort))
  fi

  if [ -z "$new_versions" ]; then
    continue
  fi

  # Resolve test directory: strip trailing /db or /lib from the schema's parent.
  # apps/<app>/src/db/schema.ts   → apps/<app>/src/__tests__/
  # apps/<app>/src/lib/db.ts      → apps/<app>/src/__tests__/
  # packages/<pkg>/src/lib/db.ts  → packages/<pkg>/src/__tests__/
  schema_parent=$(dirname "$schema_file")
  test_dir=$(echo "$schema_parent" | sed -E 's#/(db|lib)$##')/__tests__

  for v in $new_versions; do
    prev=$((v - 1))
    if [ "$prev" -lt 1 ]; then
      echo "[lint:dexie] $schema_file v$v: baseline version (v0 fixture not required)"
      continue
    fi

    # Look for any test file containing the literal `.version(N-1).stores(`.
    if [ -d "$test_dir" ] && grep -rlE "\.version\($prev\)\.stores\(" "$test_dir" >/dev/null 2>&1; then
      matching_test=$(grep -rlE "\.version\($prev\)\.stores\(" "$test_dir" 2>/dev/null | head -1)
      echo "[lint:dexie] $schema_file v$prev → v$v: fixture FOUND in $matching_test"
    else
      violations+=("$schema_file v$prev → v$v: missing fixture under $test_dir matching pattern '.version($prev).stores('")
    fi
  done
done

# ---- Report ----------------------------------------------------------------
if [ "${#violations[@]}" -gt 0 ]; then
  echo ""
  echo "::error::Dexie schema bump detected without v(N-1) → v(N) upgrade fixture."
  echo ""
  for v in "${violations[@]}"; do
    echo "  ✗ $v"
  done
  echo ""
  echo "To satisfy: add a Vitest test that opens an explicit Dexie instance at v(N-1)"
  echo "with seed data, then reopens with the full schema chain and asserts .open() works."
  echo ""
  echo "Canonical pattern reference:"
  echo "  apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts (§8.12 fixture)"
  echo ""
  echo "Rule documentation:"
  echo "  docs/DEXIE_UPGRADE_FIXTURE_RULE.md"
  echo ""
  echo "Pitfall background:"
  echo "  ~/.claude/imports/dexie_pk_change_pitfall.md"
  echo ""
  echo "Emergency bypass (rare; pair with follow-up PR):"
  echo "  SKIP_DEXIE_FIXTURE_LINT=1 pnpm lint:dexie-fixtures"
  exit 1
fi

echo "[lint:dexie] OK"
exit 0
