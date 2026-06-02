# Tasks — add-neurons-og-share

> All work in worktree `study-rpg-neurons-og` on `feat/neurons-og-share`. No Dexie / R2 schema change. No backend. No edits to sibling apps.

## 1. Data layer (pure + aggregator)

- [x] 1.1 Add `apps/neurons-tw/src/lib/services/character-card.ts` exporting `CharacterCardPayload` type (nickname / title / per-branch reps {branch, familyId, spriteKey, rarity, displayName} | null / totalAp / strongSynapseCount / variantCount(0-55) / familiesComplete(0-11) / totalStudyMinutes / renderedAt)
- [x] 1.2 Add pure `pickBranchRepresentatives(variants, representativeMap, accrual)`: one variant per NT branch (DA/5HT/GABA/Glu) using `FAMILY_NT_BRANCH` from `@study-rpg/content-neurons-tw`; preference = chosen representative → highest rarity (P1>…>P5) → highest family AP → newest `rolledAt`; branch with none → null slot
- [x] 1.3 Add async `buildCharacterCardPayload(userId?)` aggregating: `db.familyAccrual.toArray()` (sum AP), `db.neuronVariants.toArray()` (count, families-complete = families with 5, feed reps), `db.synapses.toArray()` (count `state==='strong'`), `readTotalStudyMinutes()`, profile (`db.leaderboardProfile.get(userId)` or first local row → nickname fallback「神經元研究員」, selectedTitle)
- [x] 1.4 No account identifier (email / user_id) included in the payload — only display strings (locked by test asserting no `u1` in payload JSON)

## 2. Render layer (Canvas 2D, no new dep)

- [x] 2.1 Add `apps/neurons-tw/src/lib/character-card-render.ts`: `loadCardAssets(payload)` preloads rep sprite `Image`s (via `SPRITE_MAP[spriteKey]`) + Cubic 11 font using `Promise.all` + best-effort `document.fonts.load` (failed sprite → null slot, font fail → fallback)
- [x] 2.2 `renderCharacterCard(ctx, payload, assets, opts?)`: draw cream bg + double frame + header (nickname/title chip) + NT-branch-coloured hero row (`drawImage`, `imageSmoothingEnabled=false`) + dark signal stats panel + footer (url + date); colours from `THEME_PIXEL_NEURONS.cssVars` + `FAMILY_NT_BRANCH` branch colours
- [x] 2.3 Default canvas 1080×1350 portrait (constants, easy to change). Empty-collection + missing-asset paths render without throwing (D8)

## 3. Export layer

- [x] 3.1 Add `apps/neurons-tw/src/lib/character-card-export.ts`: `downloadCardPng` (`canvas.toBlob` → `<a download>`) + `shareCardPng` (`navigator.share({files})`, AbortError → 'cancelled') + `canShareCardFile()`; surface a user-visible error on `toBlob` null (No Silent Errors)

## 4. UI

- [x] 4.1 Add `apps/neurons-tw/src/components/ShareCardModal.tsx`: on open, `buildCharacterCardPayload` → `loadCardAssets` → render to a `<canvas ref>` preview; buttons「下載 PNG」/「分享…」(share shown only when supported) + 關閉; loading + error + result states; Escape-to-close
- [x] 4.2 Add the share entry on the `/collection` page (GATE-1 decision): a「🔗 分享角色卡」button that opens the modal (wires `useAuth().user?.id` for the optional profile lookup)
- [x] 4.3 Modal styling consistent with neurons aesthetic (cream/signal, Cubic 11); responsive (preview scales to maxWidth 320, never overflows)

## 5. (Optional, secondary) static generic OG meta

- [~] 5.1 SKIPPED in v1 per GATE-1 (owner: static og:image stays out). Deferred — can ship independently later.

## 6. Tests

- [x] 6.1 `apps/neurons-tw/src/__tests__/character-card.test.ts`: `pickBranchRepresentatives` — one-per-branch, preference order (chosen > rarity > AP > recency), empty branch → null
- [x] 6.2 Payload derivation from seeded fake-indexeddb: variantCount/familiesComplete/totalAp/strongSynapseCount correct; nickname fallback when profile absent; no account id leaks into payload
- [x] 6.3 Render smoke with a mock 2D context: `renderCharacterCard` issues draw calls without throwing for (a) full payload (drawImage fires), (b) empty-collection payload (no drawImage)
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw test` (193 passed) + `pnpm -r typecheck` (neurons-tw green)

## 7. Verify (Step 3 of /spec run)

- [x] 7.1 `/simplify`-style review of the diff; tsc strict clean = no unused locals/imports; native Canvas 2D (no new dep) keeps it minimal — no orphans introduced
- [x] 7.2 Chrome MCP smoke (neurons-tw dev :5175): /collection → 分享角色卡 → modal renders the 1080×1350 card (47 distinct colours, no error/loading overlay) → nickname fallback「神經元研究員」+ DA/Glu real-sprite reps + 5HT/GABA branch-coloured「?」empty slots + stats panel (AP 52 / synapse 0 / 3·55 / 0·11 / 0分) + footer url+date → toBlob = valid 140 KB image/png (not tainted) + canShare({files}) true → console clean on load
