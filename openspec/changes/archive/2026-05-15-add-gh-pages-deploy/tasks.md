## 1. Workflow file

- [x] 1.1 Created `.github/workflows/deploy.yml` (triggers / permissions / concurrency / 7-step deploy job — including `environment: github-pages` on the job, not on the step)
- [x] 1.2 Validated yaml: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"` — parses; jobs=['deploy'], steps=[Checkout, Setup pnpm, Setup Node 20, Install dependencies, Build app, Upload Pages artifact, Deploy to GitHub Pages]

## 2. Setup checklist

- [x] 2.1 Created `.github/workflows/README.md` — 3-step setup (Pages source / Actions permissions / optional Custom domain) with GitHub docs links
- [x] 2.2 Included first-deploy timing expectations table + a "What CI does NOT do" section (no content build / no e2e / no lint gate)

## 3. README live URL section

- [x] 3.1 README.md: added `## Live demo` section under status line with placeholder URL + cross-link to fork-deploy section
- [x] 3.2 README.md: added `## Deploy your own fork` 4-step checklist + link to `.github/workflows/README.md`

## 4. Project.md roadmap update

- [x] 4.1 Updated `openspec/project.md` M1 row: 全 6 子項 ✓，status 改成「✓ 待 first deploy」（workflow ready, first push 上 GitHub 才會實機跑）

## 5. Local validation

- [x] 5.1 `pnpm install --frozen-lockfile` 本機 — "Lockfile is up to date, resolution step is skipped"，CI 預期同樣 OK
- [x] 5.2 `pnpm --filter @study-rpg/medexam-tw build` 成功，dist 含 `index.html + assets/ + content/ + fonts/`
- [x] 5.3 base-path audit: `<script src="/study-rpg/assets/index-*.js">` ✓、CSS ✓、fonts ✓。**順手清掉 dangling `<link rel="icon" href="/vite.svg">`**（Vite scaffold 殘留，public/ 沒這檔，會在 prod 吐 404）— 改 `apps/medexam-tw/index.html` 移除整行
- [x] 5.4 Skipped local http-server — dist/index.html 純 static、所有 path 已 base-prefix 正確，optional step 不阻塞

## 6. Verify + handoff

- [x] 6.1 `openspec validate add-gh-pages-deploy` — passes
- [x] 6.2 `/opsx:verify` — all 3 dimensions passed; 0 CRITICAL / 0 WARNING / 1 SUGGESTION (group 7 tasks intentionally separate gate)
- [ ] 6.3 Confirm with user, then `/opsx:archive add-gh-pages-deploy` (sync delta into main specs — this is purely ADDED, no MODIFIED conflicts)
- [ ] 6.4 Commit (auto-git) `spec(archive): merge add-gh-pages-deploy — M1 close, GH Pages workflow ready`

## 7. M1 close ceremony (separate gate — confirm with user before doing)

- [ ] 7.1 Update `openspec/project.md` M1 row: 全列 ✓
- [ ] 7.2 Commit M1 close
- [ ] 7.3 Merge `claude/elegant-shirley-43663a` → `main` (fast-forward 19 commits) — **stop and confirm with user before running git merge / push**
- [ ] 7.4 (Future, user-driven) Push main + claude branch to GitHub remote → first Pages deploy
