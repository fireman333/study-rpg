## Context

M1 已 ship 4 stat 累積（Knowledge / Reflex / Memory / Stamina — 與 `packages/core/src/types.ts` 的 `DEFAULT_STAT_SCHEMA.order` 對齊）但沒視覺化介面，玩家看不到下一個目標。Skill Tree UI 把屬性數值轉成「節點解鎖」這種離散事件，提供讀書 → 升等 → 看到新東西亮起來的閉環。

設計上有兩個邊界要守：
1. **不改既有 stat 累積公式** — `reading-loop` / `quiz-runner` / `engine-rewards` 不動
2. **不引入 perk / passive bonus** — 節點純視覺 + flavor text；perk 是 M5 工作

## Decisions

### Tree topology: 線性 path × 4 並排

**Why**：MVP 沒 perk，branching 沒有選擇成本 → 等於線性。Hub-and-spoke 視覺漂亮但 implementation 成本高、路徑 progression 不直觀。線性最對齊「visualize progression」目標。

**Shape**：4 個 stat 各自一條獨立直線，UI 上排成 4 column（桌機橫向並列、手機橫向 scroll）。每條線 9 個節點。

### Node count: 每 branch 9 個節點

**Why**：threshold 0/100/200/.../800，共 9 個 unlock 階段。讀書 60 min/day 估 60-100 點 / day → 約 8-13 天解 1 節點 → 9 節點 ~ 2-3 個月 progression 跨度，剛好對齊 M2-M3 dogfood 視窗。

**Threshold formula**:
```typescript
// packages/core/src/skill-tree/unlock.ts
export function unlockedCount(statValue: number, branch: SkillBranch): number {
  // 線性等差 100；每 branch 9 個 node；index 0 always unlocked
  return Math.min(Math.floor(statValue / 100) + 1, branch.nodes.length);
}
```

第 0 個節點門檻為 0（起點，永遠 unlocked），第 N 個節點門檻為 N × 100。

### Unlock reward: 純視覺 + toast，不觸發 gacha

**Why**：MVP 不跨 capability。Toast 已能傳達「升等了」的儀式感，不需要 inflate gacha 經濟。日後若 dogfood 發現節點 unlock 感薄弱，再透過新 change 接 engine-rewards（M5 perk 時順手做）。

**Trigger mechanism**：
- `skill-tree` capability 提供 `detectUnlocks(prevStats, nextStats, theme) → SkillNode[]` 純函式，回傳本次 stat 變動新解鎖的節點 list
- `apps/medexam-tw` 在 `Player.stats` 變更的單一寫入點（state setter 或 zustand store action）後呼叫 `detectUnlocks`，把回傳 nodes 推進 toast queue
- Toast 元件已存在於 app（loot reveal 等地方在用），重用即可

### Capability scope: `skill-tree` 新 capability，read-only consumer

**Why**：character-system 16 個 requirement 全部關於 sprite + equipment + inventory + 變體切換，跟 progression 無關。塞進去會撐爆既有 spec 邊界。Skill tree 拿 `Player.stats` 是 read-only，不改 persistence schema、不改 stat 累積公式 → 完美的衍生性 capability。

### Theme contract: 沿用既有 `theme.sprites` map，新增 `theme.skillTree` 結構

**Why**：`theme-pack-contract` spec 第 4 條 requirement 規定 `ThemePack.sprites` 是 open key map，新增 sprite key 不算 breaking。`theme.skillTree` 是純資料結構（不是 sprite），走 contract 既有的 theme 開放擴充機制（其他 theme 不提供 skillTree 時 fall back 到 engine 內建文案，避免 hard breaking）。

**Theme shape**:
```typescript
// packages/core/src/skill-tree/types.ts
export interface SkillNode {
  spriteKey: string;     // -> theme.sprites['skill-knowledge-1']
  name: string;          // 例：「翻書術 I」
  flavor: string;        // 1-2 行心得文 / 古文 / 雞湯
}

export interface SkillBranch {
  statKey: 'knowledge' | 'reflex' | 'memory' | 'stamina';
  nodes: SkillNode[];    // length = 9
}

export interface SkillTreeContent {
  branches: SkillBranch[];  // length = 4
}
```

`packages/theme-pixel-medical/src/skillTree.ts` 提供醫學主題的 9×4=36 個節點文案。Engine fallback 在 `packages/core/src/skill-tree/fallback.ts`（純佔位文案 + 通用 sprite key）。

### Route placement: `/skills` 子路由

**Why**：react-router v6 已就位，新 route 零基礎建設。Home 不擠 skill tree（首頁要 reading-loop 入口、boss 入口、character-card 等核心元件），用 character-card 一顆「技能樹」按鈕進去。

### Mobile (<768px): 橫向 scroll

**Why**：4 column 並排在 desktop 是核心 affordance（一眼看 4 屬性全貌）。Collapse 互動引入「選擇哪棵展開」的額外負擔、且失去並列對比的視覺效果。橫向 scroll 對手機玩家也算自然（IG / Threads 都這樣做）。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 9 節點 × 4 branch = 36 節點文案 + sprite 要寫，可能拖慢 ship 速度 | MVP 先 ship 8 個節點先（threshold 0-700），第 9 個（800）下個 change 加 |
| Stat 從 0 跳到 250（例如連續讀書一週才打開 app）會一次彈 3 個 toast | Toast queue 限制同時最多顯示 1 個，其餘排隊每 1.5s 推出 |
| Theme pack fork 者如果忘記 ship skillTree 結構會 runtime crash | engine fallback 提供完整 36 節點佔位文案 + 通用 sprite key，theme pack 沒 skillTree 時自動退回 fallback |
| 橫向 scroll 在 mobile 容易誤觸觸發頁面導航 | Skill tree 容器加 `overscroll-behavior-x: contain` 避免橫向 swipe 觸發瀏覽器返回 |
| 36 個 sprite 要 codex 生圖，工作量不小 | 用 stat key 命名約定（`skill-knowledge-1` ... `skill-memory-9`），先全用 placeholder sprite ship、再批次 codex 生成 |

## Migration Plan

無 — 純新增功能。`Player.stats` 既有資料直接 derive，no migration / no breaking change。

部署順序：
1. Ship 本 change → `/skills` route 可訪問，沿用 fallback 文案 + placeholder sprite
2. 後續 change 補 `theme-pixel-medical` 的 36 個節點 sprite（codex 生圖）+ 醫學主題文案
3. M5 時若決定加 perk，新 change `add-skill-tree-perks` 才動 engine-rewards / quiz-runner / mini-boss

## Open Questions

（已全部 closed via /spec init grill + 本 change 的 AskUserQuestion 三輪）
