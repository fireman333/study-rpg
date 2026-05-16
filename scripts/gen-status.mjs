#!/usr/bin/env node
// study-rpg status dashboard generator.
// Reads git + openspec + project.md live state → renders docs/status.html.
// Usage:
//   node scripts/gen-status.mjs           (or `pnpm gen-status`)
//   node scripts/gen-status.mjs --open    (also `open` the result)

import { execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const M2_ROOT =
  process.env.STUDY_RPG_M2_PATH ?? resolve(REPO_ROOT, '..', 'study-rpg-m2');
const OUTPUT = join(REPO_ROOT, 'docs', 'status.html');

const sh = (cmd, cwd = REPO_ROOT) => {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
};

const lines = (s) => s.split('\n').filter(Boolean);

const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function worktreeState(path) {
  if (!existsSync(join(path, '.git')) && !existsSync(path)) return null;
  return {
    path,
    branch: sh('git rev-parse --abbrev-ref HEAD', path) || '(detached)',
    head: sh('git log -1 --pretty=format:%h %s', path),
    clean: sh('git status --porcelain', path) === '',
    aheadOfMain: parseInt(
      sh('git rev-list --count main..HEAD', path) || '0',
      10,
    ),
    behindMain: parseInt(
      sh('git rev-list --count HEAD..main', path) || '0',
      10,
    ),
    activeChanges: listActiveChanges(path),
    recentCommits: lines(sh('git log --oneline -5', path)),
  };
}

function listActiveChanges(root) {
  const dir = join(root, 'openspec', 'changes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (d) => d !== 'archive' && existsSync(join(dir, d, 'proposal.md')),
  );
}

function specsState() {
  const specsDir = join(REPO_ROOT, 'openspec', 'specs');
  const archiveDir = join(REPO_ROOT, 'openspec', 'changes', 'archive');
  const specs = existsSync(specsDir)
    ? readdirSync(specsDir).filter((d) =>
        existsSync(join(specsDir, d, 'spec.md')),
      )
    : [];
  const archives = existsSync(archiveDir)
    ? readdirSync(archiveDir).sort().reverse().slice(0, 10)
    : [];
  return { specs, archives };
}

function roadmap() {
  const path = join(REPO_ROOT, 'openspec', 'project.md');
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const m = content.match(
    /##\s+Roadmap\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/,
  );
  if (!m) return [];
  return m[1]
    .split('\n')
    .filter(
      (l) =>
        l.startsWith('|') &&
        !l.includes('---') &&
        !l.toLowerCase().includes('milestone'),
    )
    .map((row) => {
      const cells = row
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      return { id: cells[0] || '', scope: cells[1] || '', status: cells[2] || '' };
    })
    .filter((r) => r.id);
}

function latestDecision() {
  const dir = join(REPO_ROOT, 'openspec', 'decisions');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.includes('snapshot'))
    .sort()
    .reverse();
  if (!files.length) return null;
  const latest = files[0];
  const content = readFileSync(join(dir, latest), 'utf-8');
  const headings = [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  return { file: latest, lastEntry: headings.at(-1) ?? '(no entries)' };
}

function statusBadge(status) {
  const s = status.toLowerCase();
  if (s.includes('shipped') || s.includes('✓')) return ['green', status];
  if (s.includes('⏳')) {
    if (/\d\/\d/.test(s)) return ['yellow', status];
    return ['blue', status];
  }
  if (s.includes('stretch')) return ['purple', status];
  return ['blue', status];
}

function render({ main, m2, specs, decision }) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const cap = specs.specs.length;
  const recentArchives = specs.archives.slice(0, 10);
  const rmap = roadmap();
  const totalArchives = (() => {
    const dir = join(REPO_ROOT, 'openspec', 'changes', 'archive');
    return existsSync(dir) ? readdirSync(dir).length : 0;
  })();

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>study-rpg — Worktree Status</title>
<style>
  :root {
    --bg: #0d1117;
    --panel: #161b22;
    --border: #30363d;
    --fg: #e6edf3;
    --muted: #7d8590;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --blue: #58a6ff;
    --purple: #a371f7;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 32px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.5;
    max-width: 1400px;
  }
  h1 { font-size: 28px; margin: 0 0 4px 0; }
  h2 { font-size: 18px; margin: 24px 0 12px 0; color: var(--fg); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  h3 { font-size: 14px; margin: 16px 0 8px 0; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; font-family: var(--mono); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--border); gap: 12px; }
  .row:last-child { border-bottom: none; }
  .row .label { color: var(--muted); font-size: 13px; white-space: nowrap; }
  .row .val { font-family: var(--mono); font-size: 12px; text-align: right; word-break: break-all; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; font-family: var(--mono); }
  .badge.green { background: rgba(63, 185, 80, 0.15); color: var(--green); border: 1px solid rgba(63, 185, 80, 0.3); }
  .badge.yellow { background: rgba(210, 153, 34, 0.15); color: var(--yellow); border: 1px solid rgba(210, 153, 34, 0.3); }
  .badge.red { background: rgba(248, 81, 73, 0.15); color: var(--red); border: 1px solid rgba(248, 81, 73, 0.3); }
  .badge.blue { background: rgba(88, 166, 255, 0.15); color: var(--blue); border: 1px solid rgba(88, 166, 255, 0.3); }
  .badge.purple { background: rgba(163, 113, 247, 0.15); color: var(--purple); border: 1px solid rgba(163, 113, 247, 0.3); }
  code { font-family: var(--mono); background: rgba(110, 118, 129, 0.2); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
  .commit-list { list-style: none; padding: 0; margin: 0; }
  .commit-list li { padding: 6px 0; border-bottom: 1px dashed var(--border); font-family: var(--mono); font-size: 12px; }
  .commit-list li:last-child { border-bottom: none; }
  .sha { color: var(--purple); }
  .roadmap-row { display: grid; grid-template-columns: 80px 1fr 110px; gap: 12px; padding: 10px 0; border-bottom: 1px dashed var(--border); align-items: center; }
  .roadmap-row:last-child { border-bottom: none; }
  .ms-id { font-family: var(--mono); font-weight: 600; color: var(--blue); }
  .ms-scope { font-size: 13px; }
  .ms-status { text-align: right; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .stat { text-align: center; padding: 12px 8px; background: rgba(110, 118, 129, 0.08); border-radius: 6px; }
  .stat-num { font-size: 24px; font-weight: 700; font-family: var(--mono); color: var(--blue); }
  .stat-lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; margin-top: 4px; letter-spacing: 0.05em; }
  .footer { text-align: center; margin-top: 40px; color: var(--muted); font-size: 11px; }
</style>
</head>
<body>

<h1>📦 study-rpg — Worktree Status</h1>
<div class="meta">Generated ${now} · run <code>pnpm gen-status</code> to refresh</div>

<h2>📊 Inventory</h2>
<div class="stat-grid">
  <div class="stat"><div class="stat-num">${cap}</div><div class="stat-lbl">Capability Specs</div></div>
  <div class="stat"><div class="stat-num">${totalArchives}</div><div class="stat-lbl">Total Archives</div></div>
  <div class="stat"><div class="stat-num">${main?.activeChanges.length ?? 0}</div><div class="stat-lbl">Main · Active</div></div>
  <div class="stat"><div class="stat-num">${m2?.activeChanges.length ?? 0}</div><div class="stat-lbl">m2 · Active</div></div>
</div>

<h2>🌳 Worktree State</h2>
<div class="grid-2">
  ${renderWorktreePanel('main', main)}
  ${renderWorktreePanel('track-m2', m2)}
</div>

<h2>🛣 Roadmap</h2>
<div class="panel">
  ${rmap.map(renderRoadmapRow).join('\n  ')}
</div>

<h2>📜 Recent Activity</h2>
<div class="grid-2">
  <div class="panel">
    <h3>main · 最近 commits</h3>
    <ul class="commit-list">
      ${(main?.recentCommits ?? []).map(renderCommit).join('\n      ')}
    </ul>
  </div>
  <div class="panel">
    <h3>最近 archived changes</h3>
    <ul class="commit-list">
      ${recentArchives.map((a) => `<li>${esc(a)}</li>`).join('\n      ')}
    </ul>
  </div>
</div>

${decision ? `
<h2>🧭 Latest Decision</h2>
<div class="panel">
  <div class="row"><span class="label">File</span><span class="val"><code>openspec/decisions/${esc(decision.file)}</code></span></div>
  <div class="row"><span class="label">Last entry</span><span class="val">${esc(decision.lastEntry)}</span></div>
</div>
` : ''}

<div class="footer">Source: git + <code>openspec/</code> + <code>openspec/project.md</code> · regenerate anytime with <code>pnpm gen-status</code></div>

</body>
</html>
`;
}

function renderWorktreePanel(label, w) {
  if (!w) {
    return `<div class="panel"><h3>${esc(label)}</h3><div class="row"><span class="label">(not found)</span></div></div>`;
  }
  const cleanBadge = w.clean
    ? '<span class="badge green">clean</span>'
    : '<span class="badge yellow">dirty</span>';
  const activeStr = w.activeChanges.length
    ? w.activeChanges.map((c) => `<code>${esc(c)}</code>`).join(' ')
    : '<span class="badge green">none</span>';
  return `<div class="panel">
    <h3>${esc(label)}</h3>
    <div class="row"><span class="label">Path</span><span class="val"><code>${esc(w.path)}</code></span></div>
    <div class="row"><span class="label">Branch</span><span class="val">${esc(w.branch)} ${cleanBadge}</span></div>
    <div class="row"><span class="label">HEAD</span><span class="val">${renderCommitInline(w.head)}</span></div>
    <div class="row"><span class="label">Ahead of main</span><span class="val">${w.aheadOfMain}</span></div>
    <div class="row"><span class="label">Behind main</span><span class="val">${w.behindMain}</span></div>
    <div class="row"><span class="label">Active changes</span><span class="val">${activeStr}</span></div>
  </div>`;
}

function renderCommitInline(line) {
  if (!line) return '<span class="val">(empty)</span>';
  const [sha, ...rest] = line.split(/\s+/);
  return `<span class="sha">${esc(sha)}</span> ${esc(rest.join(' '))}`;
}

function renderCommit(line) {
  return `<li>${renderCommitInline(line)}</li>`;
}

function renderRoadmapRow({ id, scope, status }) {
  const [color, text] = statusBadge(status);
  return `<div class="roadmap-row"><span class="ms-id">${esc(id)}</span><span class="ms-scope">${esc(scope)}</span><span class="ms-status"><span class="badge ${color}">${esc(text)}</span></span></div>`;
}

// main
const main = worktreeState(REPO_ROOT);
const m2 = worktreeState(M2_ROOT);
const specs = specsState();
const decision = latestDecision();

const html = render({ main, m2, specs, decision });
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, html, 'utf-8');

console.log(`✓ Wrote ${OUTPUT}`);
console.log(
  `  ${specs.specs.length} specs · main ahead/behind ${main?.aheadOfMain ?? 0}/${main?.behindMain ?? 0} · m2 ahead/behind ${m2?.aheadOfMain ?? 0}/${m2?.behindMain ?? 0}`,
);

if (process.argv.includes('--open')) {
  try {
    execSync(`open ${OUTPUT}`, { stdio: 'ignore' });
  } catch {
    // ignore
  }
}
