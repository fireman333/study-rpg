#!/usr/bin/env node
// bug-fix-queue.mjs — Supabase bug_reports -> local fix queue for triage sessions.
//
// Pulls in-app bug reports from the (immutable, no-status-column) Supabase
// `bug_reports` table and emits a local "fix queue" under bug-queue/ that a
// developer (Claude Code) reads each session to triage and fix bugs:
//   bug-queue/<app>.md     human queue, grouped by severity (blocker -> suggestion)
//   bug-queue/<app>.json   machine-readable active bugs + derived triage fields
//   bug-queue/INDEX.md     top-level digest (counts, blocker callout, links)
//   bug-queue/.seen.json   LOCAL ledger (the only "status" tracking that exists)
//
// Usage:
//   node scripts/bug-fix-queue.mjs                          # pull both apps, refresh queue
//   node scripts/bug-fix-queue.mjs --app neurons-tw         # restrict to one app
//   node scripts/bug-fix-queue.mjs --limit 200              # default 100
//   node scripts/bug-fix-queue.mjs --mark <bugId>=<status>  # update ledger only, no pull
//   node scripts/bug-fix-queue.mjs --all                    # include fixed/wontfix in output
//
// Ledger statuses: new | triaged | fixed | wontfix
// Active queue output excludes fixed/wontfix (unless --all).
//
// stdout contract (downstream launchd notifier greps '^BUGQUEUE_SUMMARY'):
//   BUGQUEUE_SUMMARY neurons-tw=<n> medexam2-hospital-tw=<n> total_new=<n> total_active=<n> ts=<ISO8601>
//
// Dependency-free (Node >= 18, global fetch). Secrets are read from gitignored
// env files / process.env, never hardcoded. bug-queue/ is gitignored (may
// contain PII from real user reports — never commit it).

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const queueDir = join(repoRoot, 'bug-queue');
const ledgerPath = join(queueDir, '.seen.json');

const KNOWN_APPS = ['neurons-tw', 'medexam2-hospital-tw'];
const LEDGER_STATUSES = ['new', 'triaged', 'fixed', 'wontfix'];

const TARGET_REPO = {
  'neurons-tw': 'fix in THIS repo (study-rpg-neurons worktree, branch track-neurons)',
  'medexam2-hospital-tw': 'fix in standalone repo ~/coding-scratch/study-rpg-2nd',
};

const SEVERITY_ORDER = ['blocker', 'annoying', 'minor', 'suggestion'];
const TRIAGE = {
  blocker: { layer: 'L1 hotfix', pTier: 'P1 夯', hint: 'crash / data-loss / 阻擋核心 loop → 立刻處理，1–2hr SLA' },
  annoying: { layer: 'L1 or L2', pTier: 'P2 頂級', hint: '顯著影響但不致命 → L1 若像 crash，否則 batch' },
  minor: { layer: 'L2 batch', pTier: 'P3 人上人', hint: '邊角 / UI 偏移 → 累積 batch change' },
  suggestion: { layer: 'L2 batch / backlog', pTier: 'P4 NPC', hint: 'feature-request → batch 或 backlog' },
};
const TRIAGE_FALLBACK = { layer: 'L2 batch', pTier: 'P3 人上人', hint: 'unknown severity — manual triage' };

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}
const includeAll = argv.includes('--all');
const markArg = arg('--mark');
const appArg = arg('--app');
const limit = Number(arg('--limit', '100')) || 100;

if (appArg && !KNOWN_APPS.includes(appArg)) {
  console.error(`[bug-queue] unknown --app "${appArg}". Allowed: ${KNOWN_APPS.join(', ')}`);
  process.exit(1);
}
const apps = appArg ? [appArg] : [...KNOWN_APPS];

// ---------- tiny dotenv loader (no dependency; mirrors openspec-to-notion scan.mjs) ----------
function loadEnvFiles(files) {
  const env = { ...process.env };
  for (const rel of files || []) {
    const p = resolve(repoRoot, rel);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in env) || !env[k]) env[k] = v; // process.env wins if already set & non-empty
    }
  }
  return env;
}

// ---------- ledger (local de-dup; the table has NO status column) ----------
function loadLedger() {
  if (!existsSync(ledgerPath)) return {};
  try {
    return JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (e) {
    console.error(`[bug-queue] WARNING: ledger ${ledgerPath} is corrupt (${e.message}) — starting fresh.`);
    return {};
  }
}
function saveLedger(ledger) {
  mkdirSync(queueDir, { recursive: true });
  const tmp = ledgerPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  rmSync(ledgerPath, { force: true });
  writeFileSync(ledgerPath, readFileSync(tmp, 'utf8'));
  rmSync(tmp, { force: true });
}

// ---------- --mark mode: update ledger and exit, no pull ----------
if (markArg) {
  const eq = markArg.indexOf('=');
  if (eq < 0) {
    console.error(`[bug-queue] --mark expects <bugId>=<status>, got "${markArg}"`);
    process.exit(1);
  }
  const id = markArg.slice(0, eq).trim();
  const status = markArg.slice(eq + 1).trim();
  if (!id) {
    console.error('[bug-queue] --mark: empty bug id');
    process.exit(1);
  }
  if (!LEDGER_STATUSES.includes(status)) {
    console.error(`[bug-queue] --mark: invalid status "${status}". Allowed: ${LEDGER_STATUSES.join(' | ')}`);
    process.exit(1);
  }
  const ledger = loadLedger();
  if (ledger[id]) {
    const prev = ledger[id].status;
    ledger[id].status = status;
    console.log(`[bug-queue] marked ${id}: ${prev} -> ${status}`);
  } else {
    ledger[id] = { status, firstSeen: new Date().toISOString(), app: '', note: '' };
    console.log(`[bug-queue] pre-marked ${id} as ${status} (was not in ledger — entry created)`);
  }
  saveLedger(ledger);
  console.log(`[bug-queue] ledger -> ${ledgerPath}`);
  process.exit(0);
}

// ---------- credentials ----------
const ENV_FILES = ['.openspec-notion.env', '.env.local', 'apps/neurons-tw/.env.local'];
const env = loadEnvFiles(ENV_FILES);
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  const missing = [!supabaseUrl && 'SUPABASE_URL', !supabaseKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(' & ');
  console.error(`[bug-queue] missing ${missing}.`);
  console.error(`[bug-queue] add it to .openspec-notion.env at the repo root (gitignored), e.g.:`);
  console.error(`[bug-queue]   SUPABASE_URL=https://<project-ref>.supabase.co`);
  console.error(`[bug-queue]   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`);
  console.error(`[bug-queue] (searched: ${ENV_FILES.join(', ')} — process.env wins)`);
  process.exit(1);
}

// ---------- pull from Supabase REST ----------
const COLS = [
  'id', 'app', 'category', 'severity',
  'what_doing', 'what_happened', 'what_expected', 'reproducibility',
  'contact_info', 'allow_followup', 'app_version', 'commit_sha',
  'route', 'question_id', 'game_state', 'recent_console_errors', 'submitted_at',
].join(',');

const params = new URLSearchParams();
params.set('select', COLS);
params.set('order', 'submitted_at.desc');
params.set('limit', String(limit));
if (apps.length === 1) params.set('app', `eq.${apps[0]}`);
else params.set('app', `in.(${apps.join(',')})`);
const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/bug_reports?${params.toString()}`;

let rows;
try {
  const res = await fetch(endpoint, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
  if (!res.ok) {
    console.error(`[bug-queue] pull failed — HTTP ${res.status} ${res.statusText}.`);
    console.error('[bug-queue] hint: check the key has SELECT on bug_reports (service-role key bypasses RLS).');
    process.exit(1);
  }
  rows = await res.json();
} catch (e) {
  console.error(`[bug-queue] pull errored — ${e.message}`);
  console.error('[bug-queue] hint: network problem or wrong SUPABASE_URL; check key has SELECT on bug_reports.');
  process.exit(1);
}
if (!Array.isArray(rows)) {
  console.error(`[bug-queue] unexpected response shape (not an array): ${JSON.stringify(rows).slice(0, 200)}`);
  process.exit(1);
}

// ---------- ledger update ----------
const ledger = loadLedger();
for (const r of rows) {
  if (!r.id) continue;
  if (!ledger[r.id]) {
    ledger[r.id] = {
      status: 'new',
      firstSeen: r.submitted_at || new Date().toISOString(),
      app: r.app || '',
      note: '',
    };
  } else {
    // keep status/note; backfill app/firstSeen if the entry was pre-marked blind
    if (!ledger[r.id].app && r.app) ledger[r.id].app = r.app;
    if (!ledger[r.id].firstSeen) ledger[r.id].firstSeen = r.submitted_at || new Date().toISOString();
  }
}
saveLedger(ledger);

// ---------- derive + filter ----------
const HIDDEN = new Set(['fixed', 'wontfix']);
function triageOf(severity) {
  return TRIAGE[severity] || TRIAGE_FALLBACK;
}
function ledgerStatusOf(id) {
  return (ledger[id] && ledger[id].status) || 'new';
}

const byApp = new Map(apps.map((a) => [a, []]));
for (const r of rows) {
  if (!byApp.has(r.app)) continue; // ignore legacy medexam-tw or anything unexpected
  const st = ledgerStatusOf(r.id);
  if (!includeAll && HIDDEN.has(st)) continue;
  const t = triageOf(r.severity);
  byApp.get(r.app).push({
    ...r,
    triageLayer: t.layer,
    pTier: t.pTier,
    ledgerStatus: st,
    targetRepo: TARGET_REPO[r.app] || 'unknown app — manual routing',
  });
}

// ---------- markdown rendering ----------
function headline(text) {
  const h = String(text || '').replace(/\s+/g, ' ').trim();
  return h.slice(0, 70) + (h.length > 70 ? '…' : '');
}
function renderBug(b) {
  const t = triageOf(b.severity);
  const lines = [];
  lines.push(`### [${b.severity || 'unknown'}] ${b.category || 'uncategorized'} — ${headline(b.what_happened) || '(no description)'}`);
  lines.push(`- [ ] \`${b.id}\``);
  lines.push('');
  const field = (label, val) => { if (val) lines.push(`**${label}**: ${val}`); };
  field('在做什麼', b.what_doing);
  field('發生什麼', b.what_happened);
  field('預期', b.what_expected);
  field('重現', b.reproducibility);
  field('route', b.route ? `\`${b.route}\`` : null);
  field('question_id', b.question_id ? `\`${b.question_id}\`` : null);
  field('commit', b.commit_sha ? `\`${b.commit_sha}\`` : null);
  field('app_version', b.app_version);
  field('回報時間', b.submitted_at);
  if (b.allow_followup && b.contact_info) field('聯絡', b.contact_info);
  field('triage', `${t.layer} · ${t.pTier} — ${t.hint} · ${b.targetRepo}`);
  field('ledger status', `\`${b.ledgerStatus}\``);

  const errs = Array.isArray(b.recent_console_errors) ? b.recent_console_errors : [];
  if (errs.length > 0) {
    lines.push('');
    lines.push('console errors:');
    lines.push('```');
    for (const e of errs) {
      if (e && typeof e === 'object') {
        const loc = e.source ? ` (${e.source}${e.line != null ? ':' + e.line : ''})` : '';
        lines.push(`${e.message || JSON.stringify(e)}${loc}`);
      } else {
        lines.push(String(e));
      }
    }
    lines.push('```');
  }

  if (b.game_state && (typeof b.game_state !== 'object' || Object.keys(b.game_state).length > 0)) {
    let gs = JSON.stringify(b.game_state, null, 2);
    if (gs.length > 1500) gs = gs.slice(0, 1500) + '\n… (truncated)';
    lines.push('');
    lines.push('<details><summary>game_state</summary>');
    lines.push('');
    lines.push('```json');
    lines.push(gs);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
  }
  lines.push('');
  return lines.join('\n');
}

function renderAppMd(app, bugs) {
  const out = [];
  out.push(`# Bug fix queue — ${app}`);
  out.push('');
  out.push(`> Generated ${new Date().toISOString()} · ${bugs.length} active bug(s) · ${TARGET_REPO[app] || ''}`);
  out.push(`> Mark done: \`node scripts/bug-fix-queue.mjs --mark <bugId>=fixed\` (or triaged / wontfix)`);
  out.push('');
  const sevs = [...SEVERITY_ORDER, ...new Set(bugs.map((b) => b.severity).filter((s) => s && !SEVERITY_ORDER.includes(s)))];
  for (const sev of sevs) {
    const group = bugs
      .filter((b) => (b.severity || 'unknown') === sev)
      .sort((a, b2) => String(b2.submitted_at || '').localeCompare(String(a.submitted_at || '')));
    if (group.length === 0) continue;
    const t = triageOf(sev);
    out.push(`## ${sev} (${group.length}) — ${t.layer} · ${t.pTier}`);
    out.push('');
    for (const b of group) out.push(renderBug(b));
  }
  return out.join('\n');
}

// ---------- write queue files ----------
mkdirSync(queueDir, { recursive: true });
const written = [];
for (const app of apps) {
  const bugs = byApp.get(app);
  const mdPath = join(queueDir, `${app}.md`);
  const jsonPath = join(queueDir, `${app}.json`);
  if (bugs.length > 0) {
    writeFileSync(mdPath, renderAppMd(app, bugs) + '\n');
    writeFileSync(jsonPath, JSON.stringify(bugs, null, 2) + '\n');
    written.push(mdPath, jsonPath);
  } else {
    // refresh semantics: stale queue files for a now-clean app are removed
    rmSync(mdPath, { force: true });
    rmSync(jsonPath, { force: true });
  }
}

// ---------- INDEX.md ----------
// Counts come from the LEDGER (persistent truth across runs, incl. bugs older
// than this pull's --limit window); blocker callout comes from this pull.
function ledgerCounts(app) {
  let nNew = 0, nTriaged = 0, nActive = 0;
  for (const entry of Object.values(ledger)) {
    if (entry.app !== app) continue;
    if (HIDDEN.has(entry.status)) continue;
    nActive++;
    if (entry.status === 'new') nNew++;
    if (entry.status === 'triaged') nTriaged++;
  }
  return { nNew, nTriaged, nActive };
}

const indexLines = [];
indexLines.push('# Bug Queue — INDEX');
indexLines.push('');
indexLines.push(`Generated: ${new Date().toISOString()}`);
indexLines.push('');
const blockerNotes = [];
for (const app of apps) {
  const n = byApp.get(app).filter((b) => b.severity === 'blocker').length;
  if (n > 0) blockerNotes.push(`**${app}: ${n} blocker(s)**`);
}
if (blockerNotes.length > 0) {
  indexLines.push(`> ⚠️ **BLOCKERS PRESENT** — ${blockerNotes.join(' · ')} → L1 hotfix, 1–2hr SLA. 先處理這些。`);
  indexLines.push('');
}
indexLines.push('| App | new | triaged | total active | queue |');
indexLines.push('|---|---|---|---|---|');
for (const app of KNOWN_APPS) {
  const c = ledgerCounts(app);
  const hasFile = apps.includes(app) && byApp.get(app)?.length > 0;
  const link = hasFile ? `[${app}.md](./${app}.md)` : (apps.includes(app) ? '(empty)' : '(not pulled this run)');
  indexLines.push(`| ${app} | ${c.nNew} | ${c.nTriaged} | ${c.nActive} | ${link} |`);
}
indexLines.push('');
indexLines.push('How to use: read the per-app `.md`, fix per the triage hint, then `node scripts/bug-fix-queue.mjs --mark <bugId>=fixed` (statuses: new / triaged / fixed / wontfix); re-run `node scripts/bug-fix-queue.mjs` to refresh.');
indexLines.push('');
const indexPath = join(queueDir, 'INDEX.md');
writeFileSync(indexPath, indexLines.join('\n'));
written.push(indexPath);

// ---------- stdout: human summary, then machine line LAST ----------
console.log(`[bug-queue] pulled ${rows.length} row(s) (limit ${limit}) for: ${apps.join(', ')}`);
for (const app of apps) {
  const bugs = byApp.get(app);
  const blockers = bugs.filter((b) => b.severity === 'blocker').length;
  console.log(`[bug-queue]   ${app}: ${bugs.length} active in queue${blockers ? ` (⚠️ ${blockers} blocker)` : ''}`);
}
console.log(`[bug-queue] files written under ${queueDir}:`);
for (const f of written) console.log(`[bug-queue]   ${f}`);
console.log(`[bug-queue] ledger: ${ledgerPath} (${Object.keys(ledger).length} known bug(s))`);

const sum = {};
let totalNew = 0, totalActive = 0;
for (const app of KNOWN_APPS) {
  const c = ledgerCounts(app);
  sum[app] = c.nNew;
  totalNew += c.nNew;
  totalActive += c.nActive;
}
console.log(
  `BUGQUEUE_SUMMARY neurons-tw=${sum['neurons-tw']} medexam2-hospital-tw=${sum['medexam2-hospital-tw']} total_new=${totalNew} total_active=${totalActive} ts=${new Date().toISOString()}`
);
process.exit(0);
