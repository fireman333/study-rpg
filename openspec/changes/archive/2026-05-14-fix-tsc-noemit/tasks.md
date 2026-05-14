## Tasks

- [x] **T1**: Edit `apps/medexam-tw/tsconfig.json` — add `"noEmit": true` to `compilerOptions`
- [x] **T2**: Clean baseline — `rm -f apps/medexam-tw/src/App.js apps/medexam-tw/src/main.js apps/medexam-tw/src/components/*.js apps/medexam-tw/tsconfig.tsbuildinfo`
- [x] **T3**: Run `pnpm --filter @study-rpg/medexam-tw build` — confirm no errors
- [x] **T4**: Verify zero orphan `.js` — `find apps/medexam-tw/src -name "*.js"` returns empty
- [x] **T5**: Verify dist/ still emitted — `ls apps/medexam-tw/dist/` shows index.html + assets/
- [x] **T6**: Run `pnpm -r typecheck` — all 4 packages still green
- [x] **T7**: `openspec validate --change fix-tsc-noemit`
- [x] **T8**: `openspec archive fix-tsc-noemit -y --skip-specs`
- [x] **T9**: auto-git commit
