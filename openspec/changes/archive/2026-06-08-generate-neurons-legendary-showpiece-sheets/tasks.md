## 1. 復原批次生成腳本

- [x] 1.1 從 `~/.claude/scratch/neuron-variant-anim-2026-06-01/render_variant_frames.py` 復原批次 PIL 變形腳本進 repo `scripts/`(留版控);讀懂既有 `family`+`slot` 參數與 `correct`(9 幀)/ `evolve`(11 幀)兩段變形邏輯
- [x] 1.2 確認 11 科 slot-5 base sprite 都存在:`packages/theme-pixel-neurons/sprites/variants/<科>-5.png`(藥理學/公共衛生學/寄生蟲學/組織學/生物化學/病理學/免疫學/解剖學/生理學/胚胎學/微生物學)
- [x] 1.3 在腳本加 / 確認「傳奇 showpiece」recipe 旋鈕(較 featured 更激進:放大倍率 / flash 強度 / 尾光長度),套用於 `correct` + `evolve` 兩段;per-family glow 取色沿用既有自立繪高亮取樣;native 192px/frame

## 2. 首科校準(OQ2)

- [x] 2.1 對 1 科(建議生化 Purkinje 或藥理)跑 `correct` + `evolve` 兩段 → 自己 Read montage QA:底部錨點不飄、glow 取色正確、爆光戲劇度達「傳奇 > featured」、幀進度連貫
- [x] 2.2 校準 recipe 參數至滿意 → 鎖定參數供 11 科套用

## 3. 11 科批次量產

- [x] 3.1 對 11 科全跑批次腳本 → 產出 `<科>-5-evolve.png`(11 幀)+ `<科>-5-correct.png`(9 幀)共 22 張水平 sheet(192/frame,透明 PNG)
- [x] 3.2 逐科斷言 `evolve_width / 192 === 11` 且 `correct_width / 192 === 9`(對齊 `STATE_META`);任何錯格重跑該科該段
- [x] 3.3 22 張 montage 一次掃視覺一致性(11 科華麗度齊、錨點齊、glow 各自配色不髒)

## 4. 落檔 + glob 註冊

- [x] 4.1 22 張 sheet 放入 `packages/theme-pixel-neurons/sprites/animated/<科>-5-{evolve,correct}.png`
- [x] 4.2 確認既有 `import.meta.glob('../sprites/animated/*.png')` 自動以 `variant:<科>:5:{evolve,correct}` 註冊進 `SPRITE_MAP`(無需改 `sprites.ts`);grep / dev console 驗 22 個 key 都在
- [x] 4.3 確認**僅** QuizModal featured 解析改動(見 §5);`VariantUnlockModal` / `SpriteSheetPlayer` / `STATE_META` 不動、零 Dexie / R2 / leaderboard / content 常數改動

## 5. QuizModal featured 解析 render change(D6)

- [x] 5.1 `QuizModal.tsx`:加 `import { db } from '../lib/db'` + `useLiveQuery`(dexie-react-hooks)讀 `db.neuronVariants.get([q.subject, 5])` → `ownsLegendary`
- [x] 5.2 擴 `heroReactionBase`(原 line ~470)為 ownership-gated:`ownsLegendary && SPRITE_MAP['variant:<科>:5:correct'] ? slot-5 : SPRITE_MAP['variant:<科>:3:correct'] ? slot-3 : null`;保留既有 isCorrect gate + reduced-motion 行為
- [x] 5.3 更新該段註解(移除「Only 藥理學 ships sheets / featured = slot 3 hardcode」過期描述)

## 6. 驗證(verify 階段)

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw build` + `pnpm -r typecheck` 通過;確認 22 張 sheet 成獨立 hashed asset(不膨脹主 JS bundle);記錄總體積
- [x] 6.2 Chrome MCP dev:觸發某科 slot-5 傳奇解鎖 → `VariantUnlockModal` 播該科 evolve showpiece(11 幀、結束定格);背景分頁 rAF throttle 用手動 pump / 終態斷言驗(對齊 chrome_mcp_raf_throttle 紀律)
- [x] 6.3 Chrome MCP dev:**已擁有**某科 slot-5 後答對該科 → QuizModal 播 slot-5 `correct` showpiece(9 幀);**未擁有**時答對 → 仍播 slot-3(既有);兩者皆無 sheet → 無反應不報錯
- [x] 6.4 Chrome MCP 驗 `prefers-reduced-motion` 靜態首幀;OQ3 查 `CollectionPage` / `/dmn` 渲染 slot-5 不破版(無 idle sheet 自動 fallback 靜態)
- [x] 6.5 `read_console_messages onlyErrors=true` 無新增 error

## 7. 收尾

- [x] 7.1 確認 spec delta(`neurons-sprite-animation` 3 個 MODIFIED)描述與實作一致;`openspec validate --all` 通過
- [x] 7.2 11 科 prod-coherent 全完才進 archive → merge → 部署(D5;不中途部署半成品)
