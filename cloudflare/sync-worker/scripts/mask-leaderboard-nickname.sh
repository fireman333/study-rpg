#!/usr/bin/env bash
# mask-leaderboard-nickname.sh — owner command for the 二階 leaderboard nickname mask list.
#
# Change: mask-moderated-leaderboard-nicknames (study-rpg-2nd, hospital-leaderboard).
# Table:  migrations/0011_leaderboard_nickname_masks.sql   Read side: src/nickname-mask.ts
#
#   mask-leaderboard-nickname.sh [--app m2] find <filter> <rank>   # rank / user_id / tier / reputation
#   mask-leaderboard-nickname.sh [--app m2] mask <user_id> [reason]
#   mask-leaderboard-nickname.sh [--app m2] unmask <user_id>
#   mask-leaderboard-nickname.sh [--app m2] list                   # user_id / masked_at / applies / reason
#
#   filter ∈ composite reputation doctor study correct
#
# ⚠️ NOTHING THIS SCRIPT PRINTS, LOGS OR KEEPS CONTAINS A NICKNAME.
#   - Players are found by their public RANK, never by name: typing the name here would
#     leave it in shell history.
#   - `mask` copies the name inside D1 (`INSERT … SELECT … FROM leaderboard_m2`); it never
#     passes through a shell variable.
#   - Snapshots and query results go to a private temp dir (mmln-*), are handled by node in
#     a child process, and are deleted on exit. Only rank / user_id / tier / reputation /
#     booleans reach the terminal.
#   Guarded by src/__tests__/mask-leaderboard-nickname-script.test.ts, which runs every
#   subcommand against data carrying a sentinel name and asserts it never appears.
#
# Runs against PRODUCTION by default (`--remote`); needs a logged-in wrangler.
#   WRANGLER              path to wrangler (default: node_modules/.bin/wrangler, then PATH)
#   MMLN_WRANGLER_TARGET  target flags (default "--remote"; e.g. "--local --persist-to DIR"
#                         for a dry run against local state)
#
# `find`, `mask` and `unmask` also need the Worker's player-key secret
# (change hash-leaderboard-user-ids): the public snapshots identify rows by
# `player_key` = HMAC(secret, "m2:<user_id>"), not by user_id, and a Worker secret
# cannot be read back out of Cloudflare. Keep the copy you `wrangler secret put`:
#   LEADERBOARD_PLAYER_KEY_SECRET   the secret itself, or
#   MMLN_PLAYER_KEY_ENV             a file that sets it (default
#                                   ~/.config/study-rpg/leaderboard-player-key.env, mode 600)
# Without it these three refuse before writing anything. The secret is handed to node
# through the environment, never argv, and is never printed.
# After the Worker's secret is rotated, replace the local copy too: each snapshot records a
# fingerprint of the secret it was keyed under (`key_epoch`), and these three refuse — before
# writing — when the copy here no longer matches it. During the rollout compat window the
# snapshots also carry user_id, so rows are matched on that and the check does not apply.
#
# `mask` / `unmask` write the list, then rewrite the five current KV snapshots so the change
# shows before the next cron, then re-read them and report per snapshot only
# masked=true|false|absent. Both are idempotent: re-running is the recovery for a race.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"
cd "$WORKER_DIR"

DB_NAME="study-rpg-leaderboard"
KV_BINDING="LEADERBOARD_KV"
FILTERS=(composite reputation doctor study correct)
APP_ID="m2"

if [[ -n "${WRANGLER:-}" ]]; then
  WR=("$WRANGLER")
elif [[ -x node_modules/.bin/wrangler ]]; then
  WR=(node_modules/.bin/wrangler)
else
  WR=(wrangler)
fi
read -r -a TARGET <<< "${MMLN_WRANGLER_TARGET:---remote}"

die() { echo "mask-leaderboard-nickname: $*" >&2; exit "${EXIT_CODE:-1}"; }
usage() {
  sed -n '7,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 64
}

# --- arguments ---------------------------------------------------------------

while [[ $# -gt 0 && "$1" == --* ]]; do
  case "$1" in
    --app)
      [[ $# -ge 2 ]] || usage
      APP_ID="$2"
      shift 2
      ;;
    *) usage ;;
  esac
done
# Only 二階 reads the list today. Masking a neurons player would mask their 留言 name and
# leave their neurons leaderboard name showing — a half-applied state (design D8).
[[ "$APP_ID" == "m2" ]] || EXIT_CODE=2 die "只接線 m2（收到 app_id=${APP_ID}）；neurons 的排行榜讀取端尚未套用遮罩"

[[ $# -ge 1 ]] || usage
CMD="$1"
shift

# The player-key secret, only for the subcommands that match snapshot rows.
need_player_key_secret() {
  if [[ -z "${LEADERBOARD_PLAYER_KEY_SECRET:-}" ]]; then
    local f="${MMLN_PLAYER_KEY_ENV:-$HOME/.config/study-rpg/leaderboard-player-key.env}"
    if [[ -r "$f" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$f"
      set +a
    fi
  fi
  local secret="${LEADERBOARD_PLAYER_KEY_SECRET:-}"
  [[ ${#secret} -ge 32 ]] ||
    EXIT_CODE=2 die "缺少 LEADERBOARD_PLAYER_KEY_SECRET（≥32 字元；或設定檔 ${MMLN_PLAYER_KEY_ENV:-~/.config/study-rpg/leaderboard-player-key.env}），未寫入任何東西"
  export LEADERBOARD_PLAYER_KEY_SECRET
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/mmln-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# The mask's single definition is the Worker constant; read it rather than retype it.
MASK="$(node -e '
  const src = require("fs").readFileSync("src/nickname-mask.ts", "utf8");
  const m = src.match(/export const NICKNAME_MASK = "([^"]+)";/);
  if (!m) { console.error("NICKNAME_MASK not found in src/nickname-mask.ts"); process.exit(1); }
  process.stdout.write(m[1]);
')"

# Node helper. Every file it reads may hold names; it prints only what each action names.
# shellcheck disable=SC2016  # JavaScript, not shell: nothing here is meant to expand.
HELPER='
const fs = require("fs");
const crypto = require("crypto");
const [action, ...a] = process.argv.slice(1);
// Same derivation as src/player-key.ts — pinned against it by the script test, which
// reads snapshots the Worker cron keyed with the same secret.
const secret = () => {
  const s = process.env.LEADERBOARD_PLAYER_KEY_SECRET;
  if (!s || s.length < 32) throw new Error("player-key secret missing");
  return s;
};
const playerKey = (uid) => {
  const mac = crypto.createHmac("sha256", secret()).update(`m2:${uid}`).digest();
  return "pk1_" + mac.subarray(0, 16).toString("base64url");
};
// Fingerprint of the secret, as src/player-key.ts stores it in the `key_epoch` of each snapshot.
const keyEpoch = () =>
  "ke1_" + crypto.createHmac("sha256", secret()).update("player-key-epoch").digest().subarray(0, 6).toString("base64url");
// A snapshot row belongs to the player when its key matches — or, for a row stored before
// the key existed / in the compat window, when its raw user_id does.
const isRowOf = (row, uid, key) => row.player_key === key || row.user_id === uid;
const d1Rows = (file) => {
  const out = JSON.parse(fs.readFileSync(file, "utf8"));
  const first = Array.isArray(out) ? out[0] : out;
  if (!first || first.success === false || !Array.isArray(first.results)) {
    throw new Error("unexpected d1 output shape");
  }
  return first.results;
};
const snapshot = (file) => {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return null; }
  try {
    const s = JSON.parse(raw);
    return s && Array.isArray(s.rows) ? s : null;
  } catch { return null; }
};
switch (action) {
  case "count": {                       // d1-file → number
    const r = d1Rows(a[0])[0];
    process.stdout.write(String(r ? Object.values(r)[0] : 0));
    break;
  }
  case "secret-check": {                // snapfile → exit 4 when rows must be matched by key under another secret
    const s = snapshot(a[0]);
    const byKeyOnly = s && s.rows.some((r) => typeof r.user_id !== "string");
    if (s && byKeyOnly && typeof s.key_epoch === "string" && s.key_epoch !== keyEpoch()) process.exit(4);
    break;
  }
  case "find": {                        // snapfile rank d1-ids-file
    const s = snapshot(a[0]);
    const rank = Number(a[1]);
    const row = s && s.rows[rank - 1];
    if (!row) { console.error(`此快照沒有第 ${rank} 名`); process.exit(3); }
    // The row carries a key; the user_id is whichever public D1 row derives it.
    const uid = d1Rows(a[2]).map((r) => r.user_id).find((u) => isRowOf(row, u, playerKey(u)));
    if (!uid) { console.error(`第 ${rank} 名的 player_key 對不到任何公開的 user_id（快照可能比 D1 舊，或 secret 與 Worker 不同）`); process.exit(3); }
    console.log(`rank=${rank} user_id=${uid} tier=${row.hospital_tier} reputation=${row.reputation}`);
    break;
  }
  case "patch": {                       // snapfile user_id mask|unmask maskString [d1-name-file]
    const [file, uid, mode, mask, nameFile] = a;
    const s = snapshot(file);
    if (!s) { process.stdout.write("absent"); break; }
    const key = playerKey(uid);
    const row = s.rows.find((r) => isRowOf(r, uid, key));
    if (!row) { process.stdout.write("absent"); break; }
    if (mode === "mask") {
      row.nickname = mask;
      row.nickname_masked = true;
    } else {
      const stored = d1Rows(nameFile)[0];
      if (!stored) { process.stdout.write("absent"); break; }
      row.nickname = stored.nickname;
      row.nickname_masked = false;
    }
    fs.writeFileSync(file, JSON.stringify(s));
    process.stdout.write("patched");
    break;
  }
  case "verify": {                      // snapfile user_id maskString
    const s = snapshot(a[0]);
    const key = playerKey(a[1]);
    const row = s && s.rows.find((r) => isRowOf(r, a[1], key));
    process.stdout.write(row ? String(row.nickname === a[2]) : "absent");
    break;
  }
  case "list": {                        // d1-file
    const rows = d1Rows(a[0]);
    if (rows.length === 0) { console.log("（名單是空的）"); break; }
    for (const r of rows) {
      const at = new Date(Number(r.masked_at)).toISOString();
      console.log(`user_id=${r.user_id} masked_at=${at} applies=${r.applies ? "yes" : "no"} reason=${r.reason ?? ""}`);
    }
    break;
  }
  default:
    console.error(`helper: unknown action ${action}`);
    process.exit(1);
}
'
helper() { node -e "$HELPER" "$@"; }

# D1 query whose results go to a FILE, never the terminal.
d1_to() {
  local out="$1" sql="$2"
  "${WR[@]}" d1 execute "$DB_NAME" "${TARGET[@]}" --json --command "$sql" > "$out"
}

kv_key() { echo "leaderboard:m2:top100:$1"; }

# Refuse, before any write, when the local secret is not the one the snapshots were keyed
# under (the Worker's was rotated and this copy was not). Reads the composite snapshot.
check_secret_current() {
  local snap="$TMP/secret-check.json"
  "${WR[@]}" kv key get "$(kv_key composite)" --binding "$KV_BINDING" "${TARGET[@]}" --text > "$snap" 2>/dev/null || true
  if ! helper secret-check "$snap"; then
    EXIT_CODE=2 die "本機 LEADERBOARD_PLAYER_KEY_SECRET 與 Worker 目前用來產生快照的不同（輪替過 secret？請更新 ${MMLN_PLAYER_KEY_ENV:-~/.config/study-rpg/leaderboard-player-key.env}），未寫入任何東西"
  fi
}

UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
check_user_id() {
  # user_id is spliced into SQL (wrangler d1 execute has no bind parameters), so it must
  # be exactly a Supabase sub.
  [[ "$1" =~ $UUID_RE ]] || EXIT_CODE=64 die "user_id 必須是 Supabase UUID（小寫）：$1"
}

# Rewrite the five snapshots for one player, then report what they now show.
patch_snapshots() {
  local uid="$1" mode="$2" name_file="${3:-}" f key snap state
  for f in "${FILTERS[@]}"; do
    key="$(kv_key "$f")"
    snap="$TMP/snap-$f.json"
    if ! "${WR[@]}" kv key get "$key" --binding "$KV_BINDING" "${TARGET[@]}" --text > "$snap" 2>"$TMP/kv-get.err"; then
      echo "  $f: 讀取快照失敗（見下方），略過；下一次 cron 會套用" >&2
      cat "$TMP/kv-get.err" >&2
      continue
    fi
    state="$(helper patch "$snap" "$uid" "$mode" "$MASK" "$name_file")"
    if [[ "$state" == "patched" ]]; then
      "${WR[@]}" kv key put "$key" --path "$snap" --binding "$KV_BINDING" "${TARGET[@]}" > /dev/null
    fi
  done
  echo "快照驗證（該玩家顯示的暱稱是否等於遮罩）："
  for f in "${FILTERS[@]}"; do
    key="$(kv_key "$f")"
    snap="$TMP/verify-$f.json"
    "${WR[@]}" kv key get "$key" --binding "$KV_BINDING" "${TARGET[@]}" --text > "$snap" 2>/dev/null || true
    echo "  $f: masked=$(helper verify "$snap" "$uid" "$MASK")"
  done
}

print_delays() {
  cat <<'EOF'
最長延遲：
  - KV 全球傳播：約 60 秒
  - 留言板 edge cache：最多 90 秒（max-age 30 + stale-while-revalidate 60）
  - 若上面任一快照不是預期值，或與同時執行的 cron 競態：下一次 cron（每小時 :00 / :30，最多 30 分鐘）；之後可再跑一次（冪等）
EOF
}

# --- subcommands -------------------------------------------------------------

case "$CMD" in
  find)
    [[ $# -eq 2 ]] || usage
    filter="$1" rank="$2"
    [[ " ${FILTERS[*]} " == *" $filter "* ]] || EXIT_CODE=64 die "未知 filter：$filter（${FILTERS[*]}）"
    [[ "$rank" =~ ^[1-9][0-9]*$ ]] || EXIT_CODE=64 die "rank 必須是正整數：$rank"
    need_player_key_secret
    check_secret_current
    snap="$TMP/find.json"
    "${WR[@]}" kv key get "$(kv_key "$filter")" --binding "$KV_BINDING" "${TARGET[@]}" --text > "$snap"
    # user_ids only — the candidates whose key the snapshot row may carry. No nickname.
    d1_to "$TMP/ids.json" "SELECT user_id FROM leaderboard_m2 WHERE is_public = 1"
    helper find "$snap" "$rank" "$TMP/ids.json"
    ;;

  mask)
    [[ $# -ge 1 && $# -le 2 ]] || usage
    uid="$1" reason="${2:-}"
    check_user_id "$uid"
    need_player_key_secret
    check_secret_current
    d1_to "$TMP/exists.json" "SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE user_id = '$uid'"
    [[ "$(helper count "$TMP/exists.json")" -gt 0 ]] || EXIT_CODE=2 die "leaderboard_m2 沒有 user_id=$uid，未寫入任何東西"
    reason_sql="NULL"
    if [[ -n "$reason" ]]; then
      [[ ${#reason} -le 200 ]] || EXIT_CODE=64 die "reason 最多 200 字元"
      reason_sql="'${reason//\'/\'\'}'"
      # The reason must not carry the name. Checked inside D1 so the name is never read out.
      d1_to "$TMP/reason.json" "SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE user_id = '$uid' AND instr(lower($reason_sql), nickname_lower) > 0"
      [[ "$(helper count "$TMP/reason.json")" -eq 0 ]] || EXIT_CODE=2 die "reason 含有該玩家的暱稱，未寫入；請換一個說明"
    fi
    now_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
    d1_to "$TMP/insert.json" "INSERT INTO leaderboard_nickname_masks (app_id, user_id, nickname_lower, masked_at, reason)
      SELECT 'm2', user_id, nickname_lower, $now_ms, $reason_sql FROM leaderboard_m2 WHERE user_id = '$uid'
      ON CONFLICT(app_id, user_id) DO UPDATE SET
        nickname_lower = excluded.nickname_lower, masked_at = excluded.masked_at, reason = excluded.reason"
    echo "已寫入遮罩名單：user_id=$uid"
    patch_snapshots "$uid" mask
    print_delays
    ;;

  unmask)
    [[ $# -eq 1 ]] || usage
    uid="$1"
    check_user_id "$uid"
    need_player_key_secret
    check_secret_current
    d1_to "$TMP/delete.json" "DELETE FROM leaderboard_nickname_masks WHERE app_id = 'm2' AND user_id = '$uid'"
    echo "已從遮罩名單移除：user_id=$uid"
    # The stored name goes D1 → file → node → snapshot; the terminal never sees it.
    d1_to "$TMP/name.json" "SELECT nickname FROM leaderboard_m2 WHERE user_id = '$uid'"
    patch_snapshots "$uid" unmask "$TMP/name.json"
    print_delays
    ;;

  list)
    [[ $# -eq 0 ]] || usage
    # Whether each entry applies is computed in D1; the recorded name is never selected.
    d1_to "$TMP/list.json" "SELECT n.user_id, n.masked_at, n.reason,
        (l.nickname_lower IS NOT NULL AND l.nickname_lower = n.nickname_lower) AS applies
      FROM leaderboard_nickname_masks n LEFT JOIN leaderboard_m2 l ON l.user_id = n.user_id
      WHERE n.app_id = 'm2' ORDER BY n.masked_at"
    helper list "$TMP/list.json"
    ;;

  *) usage ;;
esac
