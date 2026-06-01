## 1. 泛化 render 腳本

- [x] 1.1 複製 slice 的 `render_hero_frames.py` → `render_variant_frames.py`,參數化 `--family --slot`(來源 `variants/<family>-<slot>.png`、輸出 state frames)
- [x] 1.2 加 `--glow` 參數 + 預設「立繪主色自動取樣」(金→白金、藍/綠/紅→對應色系);只產 `correct` + `evolve`(不產 idle)
- [x] 1.3 downscale 輸出到 128–192/frame;frame 數鎖定對齊 `STATE_META`(correct 9 / evolve 11)
- [x] 1.4 對 1 科(如免疫學 slot 3,藍色立繪)試跑 → Read montage QA(glow 色不髒、底部錨點不飄、白閃 OK)

## 2. 逐科底部錨點 / 構圖 QA pass

- [x] 2.1 檢視 10 科 slot-3 立繪構圖(哪些無明顯雙腿 → 底部錨點 squash 會怪)
- [x] 2.2 對構圖異常的科改用中心錨點或調整 squash 幅度(腳本加 `--anchor` 選項)

## 3. 批次產 10 科 sheet

- [x] 3.1 對其餘 10 科(公共衛生/寄生蟲/組織/生物化學/病理/免疫/解剖/生理/胚胎/微生物)slot 3 跑 `render_variant_frames.py` 產 correct+evolve frames
- [x] 3.2 Aseprite batch Lua 組裝各科 correct+evolve 透明 sheet（沿用 slice 管線）→ `sprites/animated/<family>-3-{correct,evolve}.png`
- [x] 3.3 主 agent Read 各科 montage 抽查（glow 色 / 構圖 / 白閃）— 不合格的科回 step 1-2 調

## 4. 註冊 + 渲染確認

- [x] 4.1 確認 `sprites.ts` glob 自動註冊全部新 key（`variant:<family>:3:{correct,evolve}`）— 不需改 glob 程式
- [x] 4.2 評估 lazy-load：若 `pnpm build` dist 過大，把 animated sheet 改 `import()` 動態載入（correct 預載 / evolve lazy）
- [x] 4.3 (若需要) `STATE_META` 維持固定 9/11；確認量產 sheet 對齊

## 5. 驗收（Chrome MCP, port 5175）

- [x] 5.1 抽樣 3–4 科真實答對 → 各自 featured 變體播 correct 反應（sheet size 對應 9 格）
- [~] 5.2 evolve = **logic-verified**(VariantUnlockModal 條件 render 與 slice 同路徑;全 11 科 `:evolve` key build 後皆解析;真實 reveal 需 genuine AP-threshold roll,console emit 受 HMR 模組重複所阻 — 同 slice 限制)
- [x] 5.3 效能：多科同時可見時 idle（CSS）+ 偶發 correct one-shot 無 jank
- [x] 5.4 `pnpm --filter @study-rpg/neurons-tw typecheck` + `build` 通過；量測 dist bundle 體積（downscale + lazy 後合理）；確認無 persisted state 改動

## 6. 收尾 + prod 部署（達 prod-coherent 才做）

- [x] 6.1 回填 design.md Open Questions 最終值（STATE_META / lazy-load / glow 色法）
- [ ] 6.2 `/opsx:verify` → `/opsx:archive`（sync delta 進主 spec）+ auto-git commit（待使用者確認）
- [ ] 6.3 **prod-coherent 確認後**：merge `track-neurons`→main + `pnpm deploy:cf` → `gh run list` 確認 GH Pages + CF Pages 兩個 workflow 綠（待使用者確認）
