# neurons-mode Specification

## Purpose
TBD - created by archiving change add-neurons-mode-scaffold. Update Purpose after archive.

## Requirements

### Requirement: Game loop SHALL follow Hebbian 3-step learn-fire-wire cycle

The neurons mode SHALL implement a closed game loop framed by Donald Hebb's principle ("neurons that fire together, wire together"):

1. Player reads study material (reading timer accrues) AND answers exam questions filtered by subject (one of 10 一階 國考 subjects, displayed under their renamed neuron-family identities)
2. Each correct answer increases the per-neuron-family **affinity** counter (drives variant gacha unlock — see `neuron-variant-gacha` capability) AND increases the **action potential** counter for that family (drives variant collection growth — see `connectome-collection` capability)
3. When ≥ 2 distinct neuron families each reach the same-day fired threshold (N = 5 correct answers per family within the same local-TZ calendar day), the system SHALL form (or strengthen) a **synapse** between those families in the player's connectome view; repeated same-day co-firing on subsequent days potentiates the synapse through a 3-state machine (`dormant → weak → strong`); prolonged absence of co-firing decays it (LTD) downward by one level after 7+ days without same-day co-fire, **never** removing the synapse

The loop is intentionally closed — answering more cross-family questions → more synapses + more potentiation → richer connectome view + more variant gacha unlocks → encourages answering more questions. No external grind / no real-money loop. The exact N value, decay timing, state machine transitions, AP threshold ladder, and connectome view rendering are specified by the `connectome-collection` capability.

#### Scenario: Initial state has empty connectome

- **GIVEN** the player starts a new save in neurons-tw
- **THEN** `affinity[family] = 0` for all 10 neuron families
- **AND** the connectome view SHALL display all 10 neuron family nodes in a Linnean taxonomy tree with zero synapses between any pair
- **AND** the player MAY answer questions from any subject (answering is not gated)

#### Scenario: First synapse formation

- **GIVEN** the player has answered ≥ N questions correctly from neuron family A in the current session
- **AND** the player has answered ≥ N questions correctly from neuron family B in the same session
- **WHEN** the second cross-family threshold is crossed
- **THEN** a synapse between family A and family B SHALL be created in the dormant state
- **AND** an in-app notification SHALL surface informing the player of the new wiring
- **AND** the connectome view SHALL render the new synapse with the dormant visual style

#### Scenario: Incorrect answer does not rupture synapse

- **GIVEN** a synapse exists between two neuron families in the potentiated state
- **WHEN** the player answers a question from one of those families incorrectly
- **THEN** the synapse SHALL NOT be removed
- **AND** the synapse SHALL NOT be downgraded by more than one state level (LTD applies gradually via decay, not punitively per answer)

#### Scenario: connectome-collection capability is in effect after archive

- **GIVEN** the `add-connectome-collection` change has archived
- **WHEN** the `neurons-mode` capability spec is read
- **THEN** the game loop's Hebbian step-3 mechanics (N value, state machine, decay rules, AP counter, view rendering) SHALL be defined by the `connectome-collection` capability spec at `openspec/specs/connectome-collection/spec.md`
- **AND** the umbrella spec SHALL NOT redefine those mechanics independently

### Requirement: Player stats SHALL be modeled as 4 neurotransmitter levels, not medical 4-stat schema

The neurons mode SHALL replace the default 4-stat character schema used by `theme-pixel-medical` with a 4-neurotransmitter schema delivered via `ContentPackMeta.statSchema` override (per `content-pack-contract`):

| Stat key | Display name | Driven by | Visual color |
|---|---|---|---|
| `da` | Dopamine 多巴胺 | Reading session completion / streak | Yellow / gold |
| `5ht` | Serotonin 血清素 | Long-duration reading without errors | Red / coral |
| `gaba` | GABA γ-胺基丁酸 | Quiz accuracy under timed conditions | Blue / cyan |
| `glu` | Glutamate 麩胺酸 | New material learned (first-seen correct) | Green / emerald |

The mapping from gameplay events to stat increments SHALL be specified in `wire-neurons-content-and-theme`; this capability fixes only the 4 stat keys + display name semantics.

#### Scenario: Theme + content jointly deliver 4 NT stat schema

- **GIVEN** neurons-tw boots with `@study-rpg/content-neurons-tw` and `@study-rpg/theme-pixel-neurons`
- **WHEN** the engine resolves `ContentPackMeta.statSchema`
- **THEN** the schema SHALL contain exactly the four keys `da`, `5ht`, `gaba`, `glu`
- **AND** the display names SHALL be the bilingual labels specified in this requirement
- **AND** no medical 4-stat schema (knowledge / endurance / dexterity / etc.) SHALL be present

#### Scenario: Engine fallback when content pack omits statSchema

- **GIVEN** an erroneous build where `content-neurons-tw` ships without `statSchema` in meta.json
- **WHEN** the engine boots
- **THEN** the engine SHALL fall back to the default 4-stat schema from `@study-rpg/core` (per existing `content-pack-contract` behavior)
- **AND** the engine SHALL log a console warning identifying the missing override
- **NOTE** This scenario asserts engine resilience; the production build SHALL always ship statSchema (validated in `wire-neurons-content-and-theme`)

### Requirement: Connectome visual SHALL use Linnean taxonomy, not brain anatomy

The neurons mode's primary collection visual SHALL be a **Linnean-style phylogenetic taxonomy tree** organized by neurotransmitter family, NOT a brain anatomy map (no cortex / hippocampus / amygdala anatomy) and NOT a literal C. elegans connectome (no 302-named-neuron mapping).

Tree structure:
- Root: the player's connectome
- 4 main branches: DA / 5-HT / GABA / Glu (matching the 4-stat schema)
- Each branch hosts multiple neuron family clusters (specific assignment of 10 一階 subjects → branch + cluster deferred to `wire-neurons-content-and-theme`)
- Each neuron family node displays its collected variants (P1–P5 rarity per `neuron-variant-gacha`)

Cross-cluster synapses (per the Hebbian game loop requirement) overlay the taxonomy tree as a second visual layer — the taxonomy is static phylogeny; the synapses are dynamic wiring.

#### Scenario: Connectome view never renders brain regions

- **GIVEN** the player navigates to the connectome view in neurons-tw
- **WHEN** the view renders
- **THEN** the rendered visual SHALL NOT include any brain region sprite (cortex / hippocampus / amygdala / cerebellum / brainstem etc.)
- **AND** the visual SHALL NOT include any anatomical brain outline sprite
- **AND** the visual SHALL render a phylogenetic tree with 4 NT-labeled root branches

#### Scenario: Cluster placement on NT branches is content-pack-driven

- **GIVEN** the connectome view loads
- **WHEN** neuron family nodes are positioned
- **THEN** each family's NT-branch assignment SHALL be read from `content-neurons-tw` metadata (not hardcoded in the app or theme)
- **AND** changing a family's NT-branch assignment in the content pack SHALL be reflected in the view without engine code change

### Requirement: Neurons mode SHALL be data-independent from medexam-tw and medexam2-hospital-tw

The neurons mode SHALL maintain complete data isolation from the other two apps in this monorepo (`apps/medexam-tw` and `apps/medexam2-hospital-tw`):

- **Storage isolation**: `apps/neurons-tw` SHALL use its own Dexie database with no shared tables with the other two apps
- **Cloud sync isolation**: cloud sync (when wired in `add-neurons-deploy` follow-up) SHALL push to its own R2 bundle (e.g. `users/<user_id>/neurons-snapshot.json.gz`) separate from `m1-snapshot` / `m2-snapshot` / `bookmarks` bundles
- **Save migration absence**: there SHALL be no import-from-medexam-tw button, no automatic migration prompt on first launch, no cross-app save-data reconciliation
- **Cross-app recognition absence**: neurons-tw SHALL NOT display any achievement badge, leaderboard entry, cosmetic unlock, or progress indicator referencing the player's medexam-tw or medexam2-hospital-tw saves
- **Streak independence**: a daily streak in neurons-tw SHALL accrue independently from streaks in the other two apps

This isolation reflects deliberate design discussion captured in `~/.claude/scratch/grilled-neurons-tw-spec-prep-2026-05-25.md` Facets 1, 2, and 6.

#### Scenario: First-time neurons-tw login does not surface medexam-tw data

- **GIVEN** a player with an existing medexam-tw save and existing R2 `m1-snapshot` bundle
- **WHEN** that player signs into neurons-tw for the first time with the same OAuth account
- **THEN** neurons-tw SHALL initialize with a fresh empty player state
- **AND** neurons-tw SHALL NOT prompt to import medexam-tw progress
- **AND** neurons-tw SHALL NOT display any medexam-tw achievement / cosmetic / streak / level reference

#### Scenario: Streak counters are per-app

- **GIVEN** a player has a 30-day streak in medexam-tw
- **WHEN** the same player opens neurons-tw for the first time
- **THEN** the neurons-tw streak counter SHALL display 0 (or the equivalent fresh-start state)
- **AND** answering questions in medexam-tw SHALL NOT increment neurons-tw's streak counter

### Requirement: Neurons mode SHALL borrow design patterns from 二階 capabilities while declaring independent capability specs

The neurons mode SHALL deliver feature parity with `medexam2-hospital-tw` in four design areas — variant gacha, family mastery tracking, public leaderboard, achievement system — by **borrowing the design pattern** (rarity tiers / pity / affinity gate / D1+KV cron / 4-tier badge atlas) from 二階 capabilities, but SHALL declare **independent capability specs** for each, scoped to neurons semantics.

| Design pattern source (二階) | Neurons capability (this track) |
|---|---|
| `recruitment-gacha` + `affinity-specialty-bonus` | `neuron-variant-gacha` (deferred to `wire-neuron-variant-gacha`) |
| `hospital-mastery` | `neuron-family-mastery` (deferred to `wire-neuron-family-mastery`) |
| `hospital-leaderboard` | `neurons-leaderboard` (deferred to `add-neurons-leaderboard`) |
| `achievement-system` | `neurons-achievements` (deferred to `add-neurons-achievements`) |

Borrowing rules:
- Each follow-up change's design.md SHALL explicitly cite the 二階 source capability name AND list semantic differences (doctor → neuron variant / hospital room → NT branch / hospital tier → mastery level / etc.)
- The follow-up change SHALL NOT modify the 二階 source capability spec
- The follow-up change SHALL NOT reuse the 二階 capability spec text — each neurons capability spec is independently authored

The neurons-* capability spec text MAY repeat structural language (e.g. "5-tier rarity P1–P5 mapped to a power multiplier") from the 二階 source where the semantics genuinely match, but MUST rename all domain-specific terms (no "doctor" / "醫師" / "醫院" / "tycoon" / "room" in neurons spec).

#### Scenario: Variant gacha design borrows recruitment-gacha pattern but declares own spec

- **GIVEN** the follow-up change `wire-neuron-variant-gacha` is in propose phase
- **WHEN** the change's design.md is authored
- **THEN** the design.md SHALL include a reference line of the form "借鏡自 二階 `recruitment-gacha` + `affinity-specialty-bonus`"
- **AND** the design.md SHALL list semantic mappings (e.g. "doctor → neuron variant", "醫師招募券 → seed factor" or similar)
- **AND** the change SHALL create a new capability spec `specs/neuron-variant-gacha/spec.md`
- **AND** the change SHALL NOT modify `openspec/specs/recruitment-gacha/spec.md`

#### Scenario: Leaderboard infrastructure may be shared but spec is independent

- **GIVEN** the follow-up change `add-neurons-leaderboard` is in propose phase
- **WHEN** the design.md decides whether to extend the existing D1 + KV Worker (with an `app_id` column or new table) versus deploying a fresh Worker
- **THEN** the decision SHALL be argued in design.md
- **AND** regardless of infrastructure choice, a new capability spec `specs/neurons-leaderboard/spec.md` SHALL be created with neurons-specific scoring fields (connectome completeness / variant count / phylogenetic depth / nickname / streak)
- **AND** the change SHALL NOT modify `openspec/specs/hospital-leaderboard/spec.md`

### Requirement: medexam-tw SHALL enter maintenance mode upon neurons-tw active development

Concurrent with the start of M_3rd track (this scaffold change), `apps/medexam-tw` SHALL transition from active development to **maintenance mode**. Operational semantics:

- **No new feature development**: new gameplay features (e.g. additional boss types, new cosmetic categories, new mentor flows) SHALL be developed in `apps/neurons-tw` only
- **Critical bug fixes preserved**: medexam-tw SHALL continue to receive critical bug fixes (per Bug Triage Workflow in `openspec/project.md` — L1 hotfix worktree pattern); maintenance mode is NOT EOL
- **No deprecation timeline written into this spec**: no enforced sunset date; if medexam-tw is later EOL'd, a separate dedicated change SHALL author that decision
- **Banner directing players to neurons-tw**: medexam-tw SHALL surface a small persistent UI element (footer link or settings entry) directing players to neurons-tw with framing as a "new neurons-themed companion app" (not a forced replacement). Banner content and placement deferred to `add-neurons-deploy`
- **medexam-tw save data SHALL continue to function**: existing medexam-tw players SHALL keep accessing their saves indefinitely; this requirement does not authorize any data deletion or forced migration

#### Scenario: Bug-fix workflow remains available for medexam-tw

- **GIVEN** a player reports a critical crash in medexam-tw after M_3rd scaffold lands
- **WHEN** the issue is triaged
- **THEN** a hotfix change MAY be authored against medexam-tw using the existing L1 hotfix worktree pattern (per `openspec/project.md` Bug Triage Workflow)
- **AND** maintenance mode SHALL NOT block this hotfix
- **AND** new feature requests against medexam-tw SHALL be declined with a pointer to neurons-tw

#### Scenario: Feature development split is enforced at proposal review

- **GIVEN** a proposed change introduces a brand new game mechanic (not a bug fix, not a refactor)
- **WHEN** the proposal targets `apps/medexam-tw`
- **THEN** the proposal SHALL be rejected with feedback to target `apps/neurons-tw` instead
- **AND** the rejection SHALL cite this requirement

### Requirement: Subject IDs in content-neurons-tw SHALL map to content-medexam-tw via documented many-to-one OR one-to-many mapping, with per-question subject resolution invariant

The `content-neurons-tw` content pack SHALL ship a `subjects.json` whose every `Subject.id` value derives from a corresponding `Subject.id` in `content-medexam-tw` via a documented mapping. The mapping SHALL support:

- **1-to-1 direct mapping** (the default): a neurons-tw subject id equals a medexam-tw subject id verbatim (whitespace-insensitive, case-sensitive). Only `Subject.displayName` differs (renamed to neuron family per `neurons-mode` Requirement 3).
- **1-to-N controlled split**: a single medexam-tw subject id MAY split into multiple neurons-tw subject ids, provided each question originally classified under the medexam-tw subject can be re-classified into exactly ONE of the resulting neurons-tw subject ids via a deterministic, build-time-verifiable rule (e.g., source markdown per-question metadata tag).

Per-question resolution invariant: **every question in the shared corpus SHALL resolve to exactly one neurons-tw subject id** after applying the mapping. No question SHALL map to zero or multiple neurons-tw subjects.

For the current `wire-neurons-content-and-theme` change scope, the mapping is:
- 9 subjects (`藥理學` / `公共衛生學` / `寄生蟲學` / `組織學` / `生物化學` / `病理學` / `解剖學` / `生理學` / `胚胎學`): 1-to-1 direct
- 1 subject split: `微生物暨免疫學` → `微生物學` + `免疫學`, classified via source markdown per-Q `**科目**：<tag>` lookup (see `add-neurons-mode-scaffold` design.md Decision 4 for split heuristic)

The build script for content-neurons-tw SHALL assert the per-question resolution invariant at build time and fail loudly if any question fails to resolve or resolves to multiple subjects.

Future changes that introduce a brand-new subject in content-neurons-tw (with no corresponding medexam-tw subject, e.g., adding 醫學倫理 if medexam-tw adds it) SHALL update this requirement AND provide a corpus path for the new subject's questions.

#### Scenario: 9 直送 subject ids match medexam-tw verbatim

- **GIVEN** `packages/content-medexam-tw/dist/subjects.json` lists 10 subjects including `'藥理學'`, `'生理學'`, `'解剖學'`, `'病理學'`, `'生物化學'`, `'寄生蟲學'`, `'公共衛生學'`, `'組織學'`, `'胚胎學'`, and `'微生物暨免疫學'`
- **WHEN** `pnpm --filter @study-rpg/content-neurons-tw build` runs
- **THEN** the produced `packages/content-neurons-tw/dist/subjects.json` SHALL contain the 9 直送 subject ids verbatim (set equality on this subset)
- **AND** every `Subject.displayName` for these 9 ids SHALL be different from the corresponding medexam-tw displayName (renamed per Linnean taxonomy decision)

#### Scenario: 微生物暨免疫學 split into 微生物學 + 免疫學 via source markdown per-Q tag

- **GIVEN** the source markdown directory `$MEDEXAM_SOURCE_ROOT/醫學二/微生物暨免疫學/*.md` contains question blocks with `**科目**：<tag>` per-Q metadata
- **WHEN** the build script processes the `微生物暨免疫學` subject's questions
- **THEN** each question SHALL be re-classified into either `微生物學` OR `免疫學` based on the per-Q tag (per documented split heuristic in design.md Decision 4)
- **AND** the resulting `subjects.json` SHALL contain BOTH `微生物學` AND `免疫學` as distinct subject entries
- **AND** the original `微生物暨免疫學` subject id SHALL NOT appear in neurons-tw `subjects.json`
- **AND** the union of questions assigned to `微生物學` + `免疫學` SHALL equal the original count of questions under `微生物暨免疫學` in medexam-tw

#### Scenario: Question subject references resolve against neurons-tw subject list

- **WHEN** the neurons-tw app loads `getContentPack()` and the engine evaluates `question.subject`
- **THEN** for every question in the corpus, there SHALL exist exactly one `Subject` in the neurons-tw `subjects[]` whose `id` equals `question.subject`
- **AND** the engine SHALL never encounter an unresolved subject id reference

#### Scenario: Untagged 微生物暨免疫學 question gets default split route

- **GIVEN** a question in `微生物暨免疫學` source markdown lacks a `**科目**：<tag>` per-Q line (or the tag is malformed / unrecognized)
- **WHEN** the build script processes this question
- **THEN** the question SHALL be assigned to the documented default subject for this scenario (currently `微生物學` per design.md Decision 4)
- **AND** the build script SHALL log a warning naming the offending question
- **AND** the build SHALL continue (not fail) when `MEDEXAM_ALLOW_SKIPS=1` is set; otherwise SHALL fail loudly

#### Scenario: Future addition of new neurons-tw subject without medexam-tw counterpart is rejected

- **WHEN** a future change introduces a new `Subject.id` in `content-neurons-tw/subjects.json` that does NOT derive from any `content-medexam-tw/subjects.json` id via the documented mapping
- **THEN** the build script SHALL exit non-zero with a clear error message identifying the orphan subject id
- **AND** the change proposing the divergence SHALL update this requirement AND provide a separate corpus path for the new subject's questions

### Requirement: Each neuron family SHALL have an identity-distinguishing sprite registered in `theme-pixel-neurons`

The neurons-mode umbrella SHALL ensure that every neuron family (the 11 entries declared by `wire-neurons-content-and-theme` Requirement 7's subject-id mapping) has a corresponding real pixel-art sprite registered under the `subject:<id>` key in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real sprite" means: a per-family PNG file at `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`, not the 1×1 transparent-PNG data URI placeholder from the scaffold phase.

Each sprite SHALL visually communicate at least three identity dimensions:

1. **Real neuron morphology hint** matching the family's source neuron type (e.g., Cerebellar Purkinje cell → elaborate dendritic-tree silhouette; Cortical Pyramidal L5 → triangular soma)
2. **NT branch color tint** drawn from the four-color CSS variable palette (DA gold `#d4a04d` / 5HT red `#c44d4d` / GABA blue `#6a9bc4` / Glu green `#6a8c3f`)
3. **Persona accessory** matching the family's narrative role label (e.g., "Mathematician" → small abacus motif; "Judge" → tiny gavel; "Scout" → compass)

Sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe for Gemini-generated pixel-art assets.

This requirement supersedes the scaffold-phase placeholder mapping for subject keys only. Other sprite categories (items / cosmetics / skill placeholders / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities (variant gacha, achievements, dorm view, etc.) require them.

#### Scenario: Theme pack ships real sprite per neuron family

- **GIVEN** the neurons-mode umbrella is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (overview page, connectome page, future variant gacha, etc.) reads `SPRITE_MAP['subject:藥理學']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/subjects/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI used during scaffold phase

#### Scenario: All 11 families covered

- **GIVEN** the 11 neuron family IDs declared by `wire-neurons-content-and-theme` (藥理學 / 公共衛生學 / 寄生蟲學 / 組織學 / 生物化學 / 病理學 / 免疫學 / 解剖學 / 生理學 / 胚胎學 / 微生物學)
- **WHEN** the developer iterates over those IDs and checks `SPRITE_MAP['subject:' + id]`
- **THEN** each lookup SHALL return a unique real PNG URL
- **AND** no two families SHALL share the same sprite

#### Scenario: Sprite visual identity reflects family persona

- **GIVEN** the human reviewer opens `packages/theme-pixel-neurons/sprites/subjects/胚胎學.png` (Cajal-Retzius — Pioneer Architect)
- **THEN** the sprite SHALL display a Cajal-Retzius-style morphology cue (horizontal-bipolar dendrite signature) and a Glu-branch green color tint
- **AND** the sprite SHALL display an architect-related accessory (blueprint roll, hardhat, or similar)
- **AND** the same reviewer opening `生物化學.png` (Cerebellar Purkinje — Mathematician) SHALL see Purkinje-style elaborate dendritic-tree morphology, GABA blue tint, and abacus / equation / chalkboard accessory

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** items / cosmetics / skill placeholders / core scaffold keys' consumer capabilities have not yet shipped
- **WHEN** the developer reads `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-subject key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability requires real assets (separate future change)

### Requirement: ConnectomePage SHALL surface a first-time empty-state callout pointing users to the interaction surface

The `neurons-mode` umbrella SHALL ensure that when a user opens the homepage `/` (the connectome is now the homepage — there is no separate `/connectome` route) and their persisted state has zero formed synapses (`snapshot.synapses.length === 0`), the page prominently surfaces a friendly first-time callout that:

1. Welcomes the user and explains the game-loop mechanic in plain Traditional Chinese (1-2 sentences, ≤ 120 chars total)
2. Directs visual attention (via an arrow / pointer / clearly worded reference) toward the page's primary interaction surface — the **CTA toolbar above the tree panel** that opens the quiz (the 🎲 cross-family random entry and the 📚 `FamilyPicker` family-select entry); future changes MAY relocate this surface without invalidating this requirement
3. Auto-disappears the moment `snapshot.synapses.length` becomes ≥ 1 (the user's first wired synapse removes the callout naturally; no manual close button needed)

The callout SHALL serve as the action-guidance copy accompanying the dimmed-skeleton empty-state tree (per the `connectome-collection` "dimmed-skeleton empty state" requirement) — the skeleton is the visual, this callout is the guidance text.

The callout SHALL be:
- Visible above the fold on standard desktop viewport (≥ 1024 px width)
- Mobile-friendly (does not break layout at 360-820 px viewport widths)
- Annotated for accessibility (`role="region"` + Chinese `aria-label`)
- Stateless — visibility derived entirely from current `synapses.length`; NO localStorage / Dexie / SYNCED_META_KEYS flag persisted (this is distinct from, and may coexist with, the separately-persisted `homepageOnboardingDismissed` onboarding panel)

This requirement supersedes the prior implicit-only empty-state, which relied solely on a buried italic mechanic line under the page header.

#### Scenario: First-time user sees the callout above the fold
- **GIVEN** a user signs in and visits the homepage `/` for the first time (no synapses formed yet)
- **WHEN** the page loads and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render alongside the dimmed-skeleton tree
- **AND** the callout text SHALL include both a welcome opener and a 1-sentence game-loop mechanic explanation
- **AND** the callout SHALL include a visual cue (arrow / Unicode pointer / clear copy) pointing toward the CTA toolbar above the tree panel

#### Scenario: Callout auto-dismisses on first synapse
- **GIVEN** the callout is currently visible (synapses.length === 0)
- **WHEN** the user records correct answers and the first synapse forms (synapses.length becomes 1)
- **THEN** the next page render SHALL NOT include the callout
- **AND** the page SHALL transition smoothly without layout jank
- **AND** no localStorage / Dexie state SHALL be written to track the dismissal (visibility is purely derived)

#### Scenario: Returning user with existing synapses never sees the callout
- **GIVEN** a returning user with `snapshot.synapses.length >= 1`
- **WHEN** the homepage loads
- **THEN** the callout SHALL NOT render
- **AND** the rest of the homepage (toolbar, tree, family-detail grid) SHALL render as normal — no regression

#### Scenario: User who resets state sees the callout again
- **GIVEN** a user who previously had synapses but used `重設存檔（不可復原）` to reset
- **WHEN** the homepage reloads after reset and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render again
- **AND** this is acceptable / intentional — after a reset, the user IS effectively in the empty-state again

#### Scenario: Callout is responsive on mobile viewport
- **GIVEN** the callout is visible (synapses.length === 0)
- **WHEN** the viewport width is between 360 px and 820 px (typical phone widths)
- **THEN** the callout SHALL render without horizontal overflow
- **AND** the callout SHALL remain readable (text does not get clipped or truncated)
- **AND** the arrow / pointer cue SHALL remain visible

### Requirement: neurons-tw SHALL surface a user-facing quiz UI that presents content-pack questions and routes answers through recordCorrectAnswer / recordIncorrectAnswer

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application includes a user-facing quiz UI that:

1. Presents one question at a time from the loaded `ContentPack.questions` pool
2. Shows the question stem + all options as clickable / tappable selections
3. On user selection (reveal): records the result via the existing `recordCorrectAnswer(subjectId)` or `recordIncorrectAnswer(subjectId)` services so that downstream effects fire (synapse formation, variant gacha rolls, DMN behavior-axis triggers, achievement progress, mastery tier updates, streak counter)
4. Provides a way to advance to the next question and a way to exit the quiz at any time
5. Has an entry point reachable from the application's main routes (overview page at minimum)

The quiz UI MAY be feature-light for v1 (no SRS due-bias, no quality modifiers, no bookmarks, no bug reports inline) — these are deferred to follow-up changes. What MUST be true is that exam questions actually appear in front of users AND that selecting an option triggers the answer-recording chain.

Questions with `hasOptionImages === true` MAY be filtered out of the v1 quiz pool until image-option rendering ships.

Questions with `disputed === true` (送分題) SHALL be treated as auto-correct on any selection.

This requirement supersedes the prior implicit state where `ConnectomeDebugPanel`'s dev-flavored buttons were the only interaction surface.

#### Scenario: Quiz UI is reachable from the overview page

- **GIVEN** a user signs into neurons-tw and lands on the overview page (`/`)
- **WHEN** the page renders
- **THEN** an obvious entry button SHALL be visible to start a quiz (e.g., 「🎯 開始答題」 or similar Chinese CTA copy)
- **AND** clicking the button SHALL open the quiz UI

#### Scenario: Selecting an option records the result and advances the engine state

- **GIVEN** the quiz UI is open showing a question with `subject: '藥理學'` and `answer: 'B'`
- **WHEN** the user clicks option `B`
- **THEN** the quiz UI SHALL show that the answer is correct (visual cue + explanation)
- **AND** the service `recordCorrectAnswer('藥理學')` SHALL be invoked
- **AND** downstream effects SHALL fire (familyAccrual increment, possible synapse formation if today's other-family threshold met, possible variant slot unlock, possible DMN behavior-axis +1 draw, possible achievement unlock, mastery counter update)

#### Scenario: Selecting a wrong option records incorrect and resets streak

- **GIVEN** the quiz UI is open showing a question with `subject: '免疫學'` and `answer: 'C'`
- **WHEN** the user clicks option `A`
- **THEN** the quiz UI SHALL show that the answer is wrong + reveal the correct option `C` + show the explanation
- **AND** the service `recordIncorrectAnswer('免疫學')` SHALL be invoked
- **AND** the existing streak-break logic SHALL fire (resetting `currentQuizCorrectStreak` to 0)

#### Scenario: Disputed question (送分題) accepts any selection as correct

- **GIVEN** the quiz UI is open showing a question with `disputed: true`
- **WHEN** the user clicks any option
- **THEN** the quiz UI SHALL treat the selection as correct
- **AND** invoke `recordCorrectAnswer(question.subject)`
- **AND** display a notice (e.g., 「⚠️ 此題為送分題，任何選項皆計為答對」) before the explanation

#### Scenario: User can exit mid-quiz without committing all answers

- **GIVEN** the quiz UI is open and the user has answered 2 questions
- **WHEN** the user clicks 「結束」 or the close button BEFORE clicking 下一題
- **THEN** the modal SHALL close
- **AND** the 2 already-recorded answers SHALL remain persisted (no rollback)
- **AND** no error or warning SHALL block the close

#### Scenario: Image-option questions are filtered from the v1 quiz pool

- **GIVEN** the `pack.questions` corpus contains some questions with `hasOptionImages === true`
- **WHEN** the quiz UI initializes its in-session question pool
- **THEN** questions with `hasOptionImages === true` SHALL be excluded
- **AND** this is acceptable until image-option rendering ships (separate future change)

### Requirement: neurons-tw SHALL provide a reading-timer that accrues study minutes and publishes ticks to the DMN time-axis subscriber

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application provides a reading-timer service that:

1. Lets the user start / stop a reading session via a button reachable from a main route (overview page at minimum)
2. While reading is active, accrues elapsed time in-memory at a configurable tick interval
3. Each time accrued time crosses a 60-second (1 game-minute) boundary, fires BOTH of the following minute side-effects:
   - Increment `meta['totalStudyMinutes']` (a synced LWW counter — already in `SYNCED_META_KEYS` per `add-neurons-dmn-fate-card`)
   - Call `dmnReadingTimerSubscriber.onMinutesAccrued(1)` (the published interface at `dmn-trigger.ts:170` — activates DMN time-axis accrual per `neurons-dmn-fate-cards` Requirement)
4. Auto-pauses when the browser tab becomes hidden (via `visibilitychange` event)
5. Auto-pauses when the user has been idle for ≥ 90 seconds (no mousemove / keydown / touchstart events)
6. Does NOT auto-resume on tab focus return — explicit user action SHALL restart reading
7. Exposes its state (status / accumulated seconds / current minute count / pause reason) to UI consumers via a React hook

The achievement-stats builder (`apps/neurons-tw/src/lib/services/achievement.ts buildAchievementStats`) SHALL read the current value of `meta['totalStudyMinutes']` so the 4 `study-*` achievements (`study-warmup` / `study-hours-5` / `study-hours-20` / `study-marathon`) can unlock when the user accumulates sufficient reading time.

This requirement supersedes the prior implicit state where `totalStudyMinutes` was hardcoded to 0 in achievement stats and the DMN time-axis was inactive.

#### Scenario: User starts reading and 60 seconds of accrued time fires both minute side-effects

- **GIVEN** the user clicks 「📖 開始閱讀」 on the overview page
- **WHEN** 60 seconds of accrued reading time pass (with no idle pauses, no tab-hidden pauses)
- **THEN** `meta['totalStudyMinutes']` SHALL be incremented by 1 (from N to N+1)
- **AND** `accrueReadingMinutes(1)` SHALL be invoked, advancing the DMN time-axis accrual counter
- **AND** if DMN time-axis accrual crosses a 30-minute threshold, a +1 DMN draw SHALL be granted (per `neurons-dmn-fate-cards` Requirement)

#### Scenario: Visibility change auto-pauses the timer

- **GIVEN** the timer is in reading state (accrued seconds > 0, not paused)
- **WHEN** the user switches to another browser tab or window (`document.hidden` becomes true; `visibilitychange` fires)
- **THEN** the timer state SHALL transition to `paused` with reason `'visibility'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: 90s idle auto-pauses the timer

- **GIVEN** the timer is in reading state and the user has not generated a `mousemove` / `keydown` / `touchstart` event for ≥ 90 seconds
- **WHEN** the 90-second idle threshold elapses
- **THEN** the timer state SHALL transition to `paused` with reason `'idle'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: No auto-resume on tab focus return

- **GIVEN** the timer is in `paused` state with reason `'visibility'` (user switched to another tab)
- **WHEN** the user returns to the neurons-tw tab (`document.hidden` becomes false)
- **THEN** the timer SHALL remain in `paused` state
- **AND** the UI SHALL still show the pause indicator
- **AND** the user MUST explicitly click resume / restart to continue accruing

#### Scenario: Manual stop clears in-memory accumulated state but preserves persisted minute count

- **GIVEN** the timer has accrued 47 seconds of partial-minute time and 3 full minutes (3 prior side-effect fires already persisted to `meta['totalStudyMinutes']`)
- **WHEN** the user clicks 「⏹ 結束閱讀」
- **THEN** the timer state SHALL return to `idle`
- **AND** `accumulatedSeconds` SHALL reset to 0
- **AND** the 47 seconds of in-flight partial-minute progress SHALL be lost (NOT carried forward to next session — accepted trade-off)
- **AND** `meta['totalStudyMinutes']` SHALL retain the +3 from this session (the 3 minute side-effects already fired during the session)

#### Scenario: Study-category achievements unlock when totalStudyMinutes thresholds are crossed

- **GIVEN** the user has accumulated 9 reading minutes (totalStudyMinutes = 9)
- **WHEN** the user accrues 1 more minute (totalStudyMinutes becomes 10)
- **THEN** the `study-warmup` achievement (predicate: studyMin(10)) SHALL evaluate as unlocked on next achievement check
- **AND** the achievement-trigger chain MAY emit toast / modal per existing `achievement` capability behaviors
- **AND** the same pattern applies at 300 minutes (`study-hours-5`), 1200 minutes (`study-hours-20`), and 3000 minutes (`study-marathon`)
### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family card grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). Each card SHALL be its own direct-entry surface — the player clicks a per-card「🎯 答題」 button to open the QuizModal scoped to that family's pool in one action. There SHALL NOT be a filter-selection state on the picker; the click IS the action.

The picker SHALL behave as a **direct-entry grid**, not a selection filter:

- No `selectedFamilyId` React state, no Dexie row, no sync table, no localStorage key, no URL search param holding a「currently selected family」.
- When the player clicks a card's「🎯 答題」 button, Overview SHALL call `filterPoolByFamily(pack.questions, familyId)` (or equivalent) and pass the resulting `Question[]` to a freshly mounted `QuizModal` instance.
- The QuizModal close handler SHALL fully unmount the modal; there SHALL NOT be a「last-played family」 indicator preserved on Overview between sessions.
- Cross-family random entry (the prior「全部」 chip semantic) SHALL be hosted by a separate hero-level CTA per the「Overview SHALL surface a hero CTA for cross-family random quiz entry」 requirement; the picker itself contains only per-family direct-entry cards.

Each family card SHALL source identity from the `content-neurons-tw` family roster (canonical `subject.id` = 國考 subject name, `subject.displayName` = family persona, family sprite key from `theme-pixel-neurons`, NT-branch-derived accent color). Cards SHALL NOT hardcode any subject name, family name, or color.

**Card label hierarchy (primary / secondary):**

- The card's **primary** visible label SHALL be the canonical 國考 subject name (`subject.id`, e.g. `藥理學`, `公共衛生學`, `寄生蟲學`).
- The card's **secondary** supporting label SHALL be the family persona name (`subject.displayName`, e.g. `VTA Dopaminergic — Thrill-Seeker`), rendered as a single line in muted typography beside the primary label. Truncation via ellipsis on narrow viewport is allowed.
- The card's action `button`'s **title** attribute (hover tooltip) SHALL include both labels plus question count: `從 {subject.id} 抽題答題` (and `aria-label` on the parent article SHALL be `{subject.id} · {subject.displayName}` so screen readers get both contexts on focus).

**Per-card embedded chips:**

- Each card SHALL render an inline `MasteryChip` for that family (tier badge + correct/total count + accuracy %), so progression is visible alongside the entry point without requiring a separate「家族熟練度」 list section on Overview.
- Each card SHALL render a 題數 chip showing `{subject.totalQuestions} 題`.

**NT-branch grouping** SHALL be preserved: cards are visually grouped by their `subject.group` field (one of `DA` / `5HT` / `GABA` / `Glu`) under a small branch header (dot + label + count) per group. The branch grouping is the neuroanatomy teaching anchor and SHALL persist regardless of viewport.

The card grid SHALL be responsive: per-branch row uses `grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))` so cards reflow to 4 columns on wide desktop, 2 columns on mid-width (≈ 414px viewport), 1 column on narrow phone (≈ 360px viewport). NT-branch headers remain visible at all widths.

**Empty-pool defensive state**: if `family.totalQuestions === 0` (shouldn't happen with shipping content but defensive for fork developers / build issues), the card's 答題 button SHALL render in disabled visual state with `disabled={true}` and a `title` attribute of `本 family 目前無題目`. The card SHALL still render the sprite / labels / mastery chip.

#### Scenario: Card click opens QuizModal restricted to that family

- **GIVEN** the player is on Overview viewing the `藥理學` family card
- **WHEN** the player clicks that card's「🎯 答題」 button
- **THEN** Overview SHALL open `QuizModal` with a candidate pool restricted to questions whose `subjectId` resolves to family `藥理學` (via `filterPoolByFamily(pack.questions, '藥理學')`)
- **AND** no question outside `藥理學` SHALL be served in this session
- **AND** the rewards / SRS / DMN trigger / family-mastery pipelines SHALL operate identically to the unrestricted case

#### Scenario: Picker holds no filter selection state

- **GIVEN** the player clicks `藥理學`'s 答題 button and then closes the QuizModal (Esc / ✕ / backdrop)
- **WHEN** the player returns to Overview
- **THEN** no card SHALL render in any「selected / active / sticky」 visual state
- **AND** no React state, Dexie row, localStorage key, sync table, or URL param SHALL retain `藥理學` as a「last-played」 family
- **AND** the next quiz entry SHALL require a fresh click on any card or the hero random CTA

#### Scenario: Picker card identity sources from content pack

- **GIVEN** a developer changes the `displayName` of family `生理學` in `content-neurons-tw` to `Some New Persona — Tagline`
- **WHEN** the Overview re-renders
- **THEN** the card's primary label SHALL still be `生理學` (since `subject.id` did not change)
- **AND** the card's secondary label SHALL display `Some New Persona — Tagline` without any code change in `apps/neurons-tw/`

#### Scenario: Card primary label is the 國考 subject name

- **GIVEN** the Overview page renders the family card grid for the first time
- **WHEN** the player visually scans the 11 cards
- **THEN** each card's PRIMARY label SHALL display the canonical 國考 subject name (e.g. `藥理學`, `解剖學`, `生物化學`, `組織學`, `生理學`, `病理學`, `微生物學`, `免疫學`, `寄生蟲學`, `公共衛生學`, `胚胎學` — or whichever 11 subjects ship in `content-neurons-tw`)
- **AND** the family persona name (e.g. `VTA Dopaminergic — Thrill-Seeker`) SHALL appear as SECONDARY supporting text beside the primary on the same card
- **AND** hovering the card's 答題 button SHALL surface a tooltip referencing the subject id

#### Scenario: Cards group by NT branch with branch headers

- **GIVEN** the Overview page renders the family card grid
- **WHEN** the player scrolls through the picker section
- **THEN** the cards SHALL appear in NT-branch-grouped rows in this order: `DA · 多巴胺`, `5-HT · 血清素`, `GABA · γ-胺基丁酸`, `Glu · 麩胺酸`
- **AND** each branch header SHALL render with a colored dot matching the branch accent + branch label + family-count text
- **AND** branches with zero families in the roster SHALL not render a header (no empty rows)

#### Scenario: Mastery chip is inline on each card

- **GIVEN** the player has answered some `藥理學` questions raising mastery to silver tier (`16 / 24`, 67%)
- **WHEN** the Overview re-renders the family cards
- **THEN** the `藥理學` card SHALL render a `MasteryChip` inline next to the 題數 chip showing `銀 16/24 67%` (or equivalent tier label + count + accuracy)
- **AND** there SHALL NOT be a separate「🎓 家族熟練度」chip row elsewhere on Overview (mastery context lives only inside the cards)

#### Scenario: Empty-pool card disables the answer button

- **GIVEN** a family in `content-neurons-tw` has `totalQuestions === 0` (defensive — content edge case)
- **WHEN** the Overview renders that family's card
- **THEN** the card's「🎯 答題」 button SHALL render in disabled visual state (`disabled` attribute set, muted color)
- **AND** the button's `title` attribute SHALL be `本 family 目前無題目`
- **AND** the card SHALL still render the sprite / primary label / persona label / 0 題 chip

#### Scenario: Card grid is responsive across viewport widths

- **GIVEN** the Overview page renders the family card grid
- **WHEN** the viewport is approximately 768px (tablet)
- **THEN** each NT-branch row SHALL render cards in ~4 columns via `auto-fill, minmax(170px, 1fr)`
- **WHEN** the viewport is approximately 414px (iPhone Plus)
- **THEN** each NT-branch row SHALL render cards in ~2 columns
- **WHEN** the viewport is approximately 360px (iPhone SE)
- **THEN** each NT-branch row SHALL render cards in 1 column
- **AND** NT-branch headers SHALL remain visible at every width

#### Scenario: Other neurons-tw surfaces preserve family persona as primary

- **GIVEN** the player navigates to `/connectome` (connectome SVG tree page)
- **WHEN** the connectome tree renders the 11 family nodes
- **THEN** each family node SHALL continue to display the family persona name as primary (no change to connectome rendering)
- **AND** the same persona-primary behavior SHALL apply on `/achievements`, the leaderboard, and family-mastery surfaces
- **AND** the QuizModal interior framing SHALL continue to reference the family flavor as it does today (no change to quiz modal copy)

### Requirement: Overview SHALL surface a hero CTA for cross-family random quiz entry

Overview SHALL render a「🎲 隨機跨 family 答題」 CTA button in the hero-adjacent CTA section, paired side-by-side with the existing「📖 開始閱讀」 reading-timer CTA. The random CTA SHALL be the canonical entry point for cross-family random quiz sessions (the semantic previously hosted by the「全部」 chip inside the picker).

The random CTA SHALL:

- Open `QuizModal` with the unrestricted pool when clicked (`filterPoolByFamily(pack.questions, null)`, returning all questions).
- Display the total question count inline (e.g.「🎲 隨機跨 family 答題 [3291 題]」) so the player sees pool size before clicking.
- Use the project's warm GBA palette accent (`#d4a04d` background, white text, `#b8893a` border) — visually paired with the existing reading-timer CTA's green accent.
- Use `flex: 1 1 220px` styling so the CTA row renders side-by-side on wide viewports and stacks gracefully on narrow viewports.
- Carry an `aria-label="跨 family 隨機答題"` and a `title` attribute describing the action.

#### Scenario: Random CTA opens QuizModal with unrestricted pool

- **GIVEN** the player is on Overview and the family card grid is rendered
- **WHEN** the player clicks「🎲 隨機跨 family 答題」 in the hero CTA section
- **THEN** Overview SHALL open `QuizModal` with `filterPoolByFamily(pack.questions, null)` — i.e. the full unrestricted pool
- **AND** the served questions SHALL span any family per the QuizModal's random selection logic

#### Scenario: Random CTA visually pairs with reading-timer CTA

- **GIVEN** the Overview page renders the hero CTA section
- **WHEN** the player scans the CTA row
- **THEN** the「📖 開始閱讀」 (green) and「🎲 隨機跨 family 答題」 (gold) buttons SHALL render side-by-side at viewport widths ≥ ~500px
- **AND** at narrower widths the buttons SHALL stack via `flex-wrap` (each retains `flex: 1 1 220px`)
- **AND** the random CTA SHALL display the current `pack.questions.length` count as an inline chip pill

#### Scenario: Random CTA reflects pack reload

- **GIVEN** the content pack reloads with a different total question count (e.g. content bump from 3291 → 3500)
- **WHEN** Overview re-renders
- **THEN** the random CTA's inline count chip SHALL display the new total without code change in `apps/neurons-tw/`
- **AND** the click behavior SHALL still pass `null` to `filterPoolByFamily` (no hardcoded total)

### Requirement: QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll

The neurons-tw QuizModal SHALL respond to keyboard input from the moment it opens until it closes, in a two-phase contract that mirrors the modal's existing UI state. The hotkey path SHALL use a deliberate「highlight then commit」 pattern (parity with 二階) — mouse-click on an option still submits immediately so mouse users see no change.

**Asking phase** (`picked === null` — no option selected yet):

- Pressing `1`, `2`, `3`, or `4` SHALL set the highlighted option to A, B, C, or D respectively (order: `Object.keys(q.options)`). The highlighted option SHALL render with a visual accent ring (matching the existing mouse-hover style so the visual vocabulary stays consistent). The submission does NOT happen yet.
- Pressing `5`, `6`, `7`, `8`, `9`, or `0` SHALL be a no-op (defensive — content packs may extend option counts later; current rosters have 4).
- Pressing `Enter` SHALL submit the highlighted option IFF there is one. If no option is highlighted, `Enter` SHALL be a no-op (asking phase requires highlight before commit). Submission invokes the same handler path as a mouse click on that option button.

**Answered phase** (`picked !== null` — option already chosen, reveal showing):

- Pressing `Enter` or `Space` SHALL advance to the next question (equivalent to clicking the existing「下一題」 advance button), provided at least 150ms have elapsed since the asking → answered phase transition. The 150ms cooldown SHALL prevent a single Enter keypress from both submitting an option AND advancing past the reveal.
- **Pressing `1` SHALL toggle the bookmark for the current question** (wired by `add-neurons-question-bookmarks`). The hotkey hook SHALL accept an `onToggleBookmark: () => void` callback prop and dispatch `{ kind: 'toggle-bookmark' }`. The button-click + hotkey paths share the same `toggleBookmark(q)` service call.
- **Pressing `2` SHALL toggle the「✨ 太簡單」 flag** (wired by `add-neurons-srs-binary-modifiers`). The hotkey hook SHALL accept a non-optional `onToggleEasy: () => void` callback prop and dispatch `{ kind: 'toggle-easy' }`. Button-click + hotkey paths share the same `toggleEasy(q.id)` service call.
- **Pressing `3` SHALL toggle the「🤔 我亂猜的」 flag** (wired by `add-neurons-srs-binary-modifiers`). The hotkey hook SHALL accept a non-optional `onToggleGuessed: () => void` callback prop and dispatch `{ kind: 'toggle-guessed' }`. Same shared-callback pattern.

**Both phases — scroll bindings**:

- Pressing `Space` (no modifier) SHALL page-scroll the modal's body container DOWN by `0.8 × clientHeight` (smooth behavior). In answered phase this conflicts with the advance binding above; the dispatcher resolves by checking phase first — answered-phase Space advances, asking-phase Space scrolls down. Players who scrolled to read a long stem can keep using Space until they highlight (1–4), then Enter submits.
- Pressing `Shift+Space` SHALL page-scroll UP by `0.8 × clientHeight` (smooth).
- Pressing `↓` (ArrowDown) SHALL scroll down by 40px (`auto` behavior — instant for fine adjustments).
- Pressing `↑` (ArrowUp) SHALL scroll up by 40px.
- Pressing `Home` SHALL scroll to top of container (smooth).
- Pressing `End` SHALL scroll to bottom of container (smooth).
- All scroll operations target a dedicated `<div ref={scrollContainerRef}>` wrapping the modal body (NOT the page `<html>` or `<body>`). The container has `overflow-y: auto` + `max-height: calc(100vh - 200px)` so long question stems / explanations stay within the modal.

**Both phases — close**:

- Pressing `Escape` SHALL close the modal (this is the existing behavior — explicitly preserved, not regressed via the existing QuizModal `useEffect` Esc listener that lives alongside the hotkey hook).

**Both phases — input-focus guard**:

- When `event.target` is an `HTMLInputElement` or `HTMLTextAreaElement`, the hotkey handler SHALL skip dispatch entirely and let the keypress passthrough to native input handling. This is a defensive guard — neurons QuizModal currently has no inputs, but the guard ensures future inputs (e.g. note-taking field) don't break user typing.

**Dispatch architecture**:

- The hotkey logic SHALL be implemented as a pure `dispatchKey(key, shift, ctx)` function that maps a keypress + context to a discriminated-union `HotkeyAction` (`highlight` / `submit` / `advance` / `scroll` / `noop` / `skip`). The function SHALL have no DOM access, no React state mutation — pure for full unit-test coverage.
- A separate `useQuizHotkeys` hook SHALL own the `document.addEventListener('keydown')` lifecycle, gated on `isOpen`. The hook SHALL pass current phase / option keys / highlighted key / cooldown reference / scroll container ref into `dispatchKey` and execute the returned action via injected callbacks (`setHighlightedKey`, `onSubmit`, `onAdvance`) + DOM scroll on the container.
- The hook SHALL unsubscribe the document listener on modal close / unmount.
- The `HotkeyAction` union SHALL include `toggle-bookmark` / `toggle-easy` / `toggle-guessed` variants (all now wired — no reserved-noop placeholders remain).

**Visual feedback on highlight**:

- Highlighted option button SHALL render with a thicker / glowing border ring matching the existing mouse-hover style (DO NOT introduce a new visual idiom). `aria-pressed="true"` SHALL be set on the highlighted button; false on others.
- Switching highlight via `1` → `2` SHALL immediately update the visual ring (no animation delay).
- The reveal phase (after submit) SHALL clear the highlight visual since the answer + correct-key colors take over.

#### Scenario: Asking phase number key highlights option

- **GIVEN** the QuizModal is open, no option highlighted yet, and the served question has options `{ A: '...', B: '...', C: '...', D: '...' }`
- **WHEN** the player presses the `2` key
- **THEN** the modal SHALL set the highlighted key to `'B'` (the 2nd entry in `Object.keys(options)`)
- **AND** option B's button SHALL render with the accent ring + `aria-pressed="true"`
- **AND** no answer SHALL be submitted yet (the option-pick handler is NOT called)

#### Scenario: Asking phase Enter submits highlighted option

- **GIVEN** the QuizModal is open in asking phase with option C highlighted
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL invoke the option-pick handler with key `'C'`
- **AND** the modal SHALL transition to answered-phase rendering exactly as if the player had clicked option C with a mouse

#### Scenario: Asking phase Enter with no highlight is a no-op

- **GIVEN** the QuizModal is open in asking phase and no option has been highlighted
- **WHEN** the player presses `Enter`
- **THEN** no submission SHALL happen
- **AND** no visual state SHALL change

#### Scenario: Number key switches highlight to a different option

- **GIVEN** the QuizModal is open with option A currently highlighted
- **WHEN** the player presses `3`
- **THEN** the highlight SHALL move to option C
- **AND** option A's `aria-pressed` SHALL flip to `false` and option C's to `true`

#### Scenario: Out-of-bounds number key is a no-op

- **GIVEN** the QuizModal is open with a question that has only 3 options (e.g. `optionKeys=['A','B','C']`)
- **WHEN** the player presses `4`
- **THEN** no highlight SHALL change
- **AND** the dispatcher SHALL return `{kind:'noop'}`

#### Scenario: Answered phase Enter advances to next question

- **GIVEN** the QuizModal is open, the player has picked option C, the reveal is showing, and more than 150ms have elapsed since the pick
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL invoke the advance handler (equivalent to clicking「下一題」)
- **AND** the next question SHALL render with `picked` reset to `null` and `highlighted` reset to `null`

#### Scenario: Answered phase Space also advances

- **GIVEN** the QuizModal is open in answered phase with cooldown OK
- **WHEN** the player presses `Space`
- **THEN** the modal SHALL invoke the advance handler (equivalent to `Enter` in answered phase)

#### Scenario: Phase-change cooldown blocks immediate Enter advance

- **GIVEN** the QuizModal is open with option B highlighted in asking phase
- **WHEN** the player presses `Enter` (submits B, modal enters answered phase) and then presses `Enter` again within 150ms
- **THEN** the second `Enter` SHALL be a no-op (cooldown active)
- **AND** the reveal SHALL remain visible until the player presses `Enter` again after the cooldown expires (or clicks「下一題」)

#### Scenario: Asking phase Space scrolls modal body down

- **GIVEN** the QuizModal is open in asking phase with a long question stem requiring scroll, no option highlighted
- **WHEN** the player presses `Space` (no Shift modifier)
- **THEN** the modal's scrollable body container SHALL scroll DOWN by `0.8 × clientHeight` smoothly
- **AND** the page `<html>` / `<body>` SHALL NOT scroll
- **AND** no highlight SHALL change

#### Scenario: Shift+Space scrolls modal body up in either phase

- **GIVEN** the QuizModal is open (any phase) with the body scrolled partway down
- **WHEN** the player presses `Shift+Space`
- **THEN** the modal's body container SHALL scroll UP by `0.8 × clientHeight` smoothly

#### Scenario: Arrow keys provide fine-grained scroll

- **GIVEN** the QuizModal is open
- **WHEN** the player presses `↓`
- **THEN** the body container SHALL scroll DOWN by 40px (instant `auto` behavior)
- **WHEN** the player presses `↑`
- **THEN** the body container SHALL scroll UP by 40px

#### Scenario: Home / End jump to container edges

- **GIVEN** the QuizModal is open with the body partially scrolled
- **WHEN** the player presses `Home`
- **THEN** the body container SHALL scroll smoothly to the top
- **WHEN** the player presses `End`
- **THEN** the body container SHALL scroll smoothly to the bottom

#### Scenario: Escape closes the modal in any phase

- **GIVEN** the QuizModal is open
- **WHEN** the player presses `Escape` (regardless of asking / answered phase, regardless of highlight state)
- **THEN** the modal SHALL invoke the `onClose` handler (existing Esc behavior preserved via the existing useEffect listener — NOT through the hotkey hook)

#### Scenario: Input focus suspends hotkey dispatch

- **GIVEN** the QuizModal is open and a hypothetical `<input>` field inside the modal has focus (defensive — current modal has no inputs but the guard MUST exist)
- **WHEN** the player presses any key (e.g. `1`, `Enter`, `Space`)
- **THEN** the hotkey hook SHALL NOT dispatch any action
- **AND** the keypress SHALL passthrough to the native input handling

#### Scenario: Hook unmounts cleanly on modal close

- **GIVEN** the QuizModal is open with the hotkey hook active
- **WHEN** the modal closes (via Esc / ✕ / backdrop click / question exhaustion)
- **THEN** the hook's `document.addEventListener('keydown')` listener SHALL be removed
- **AND** subsequent keystrokes on Overview SHALL NOT trigger any quiz-related action

#### Scenario: Mouse click bypass — click submits immediately

- **GIVEN** the QuizModal is open in asking phase
- **WHEN** the player CLICKS option B with the mouse (no prior keyboard interaction)
- **THEN** the modal SHALL invoke the option-pick handler with key `'B'` IMMEDIATELY (no highlight intermediate)
- **AND** the modal SHALL transition to answered phase as today
- **AND** the highlight state SHALL remain `null` (irrelevant; reveal phase paints take over)

#### Scenario: Answered-phase `1` toggles bookmark (wired by add-neurons-question-bookmarks)

- **GIVEN** the QuizModal is open in answered phase showing question X (not yet bookmarked)
- **WHEN** the player presses `1`
- **THEN** the dispatcher SHALL return `{kind:'toggle-bookmark'}` and the hook SHALL invoke `onToggleBookmark()`
- **AND** the bookmark SHALL be added (Dexie `questionBookmarks` row written)
- **AND** the ⭐ button in the modal footer SHALL update to filled `★`
- **WHEN** the player presses `1` again
- **THEN** the bookmark SHALL be removed (row deleted + tombstone written)

#### Scenario: Answered-phase `2` toggles ✨ easy flag (wired by add-neurons-srs-binary-modifiers)

- **GIVEN** the QuizModal is open in answered phase showing question Y (no easyMarked flag)
- **WHEN** the player presses `2`
- **THEN** the dispatcher SHALL return `{kind:'toggle-easy'}` and the hook SHALL invoke `onToggleEasy()`
- **AND** Dexie `questionFlags` for Y SHALL set `easyMarked = true`
- **AND** the「✨ 太簡單」 button in the modal footer SHALL render with yellow accent + `aria-pressed="true"`

#### Scenario: Answered-phase `3` toggles 🤔 guessed flag (wired by add-neurons-srs-binary-modifiers)

- **GIVEN** the QuizModal is open in answered phase showing question Z (no guessedMarked flag)
- **WHEN** the player presses `3`
- **THEN** the dispatcher SHALL return `{kind:'toggle-guessed'}` and the hook SHALL invoke `onToggleGuessed()`
- **AND** Dexie `questionFlags` for Z SHALL set `guessedMarked = true`
- **AND** the「🤔 我亂猜的」 button in the modal footer SHALL render with blue accent + `aria-pressed="true"`

### Requirement: Overview SHALL surface a dismissible hotkey announcement banner

Overview SHALL render a one-time announcement banner promoting the QuizModal keyboard hotkeys, positioned above `LeaderboardPromoBanner` and below the top status chip. The banner SHALL be dismissible per-device and SHALL hide on touch-only devices where hotkeys are not applicable.

The banner SHALL:

- Display a `⌨️` icon + headline「新功能：答題系統鍵盤快捷鍵」+ inline copy describing the asking-phase `1`–`4` highlight + `Enter` submit, answered-phase `Enter` / `Space` advance, answered-phase `1` ⭐ bookmark toggle, **answered-phase `2` ✨ 太簡單**, **answered-phase `3` 🤔 我亂猜的**, scroll keys (`Space` / `Shift+Space` / `↓↑` / `Home` / `End`), and `Esc` close — all using `<kbd>` semantic elements.
- **Append a HelpMenu reference at the end of the copy**: `... 詳見右上 ❓ →「⌨️ 鍵盤快捷鍵」section。` so players who dismiss the banner know where to find a permanent reference.
- Render a ✕ dismiss button on the right that, when clicked, hides the banner immediately AND writes a localStorage key `neurons-quiz-hotkeys-banner-dismissed-v4` (BUMPED from `-v3` to `-v4` so previously-dismissed users see the new SRS flag key-mentioning copy ONCE) so the banner stays hidden on subsequent loads.
- Use CSS media query `@media (hover: hover) and (pointer: fine)` to render only on devices with a precise pointer (desktop + tablet with mouse) — touch-only devices SHALL not see the banner since they have no physical keyboard for hotkeys.
- Carry `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"` for screen-reader navigation; the dismiss button SHALL carry `aria-label="關閉公告"`.

The banner SHALL handle localStorage failures gracefully: if `localStorage.setItem` throws (private browsing / quota exceeded), the in-memory `hidden` state SHALL still update so the banner disappears for the current session; the banner re-renders on next page load, which is acceptable degraded behavior.

The localStorage key version suffix (currently `-v4`) SHALL be bumped (`-v5`, `-v6`, …) by future changes whenever banner copy revises materially, so re-discovery happens without migration code.

#### Scenario: Banner shows on first Overview load OR after v3→v4 key bump

- **GIVEN** a user lands on Overview for the first time after `add-neurons-srs-binary-modifiers` ships (no `neurons-quiz-hotkeys-banner-dismissed-v4` localStorage key — either fresh user OR user who dismissed v1 / v2 / v3 banner previously)
- **WHEN** Overview renders
- **THEN** the announcement banner SHALL appear above `LeaderboardPromoBanner`
- **AND** the banner content SHALL include `⌨️` icon + headline + hotkey hint copy + **mentions of `1` ⭐ bookmark, `2` ✨ 太簡單, `3` 🤔 我亂猜的** + the「詳見右上 ❓ →『⌨️ 鍵盤快捷鍵』section。」 trailing reference + dismiss button

#### Scenario: Dismiss persists across reload via v4 key

- **GIVEN** the banner is visible and the player clicks the ✕ dismiss button
- **WHEN** the player reloads the page
- **THEN** the banner SHALL NOT render
- **AND** the localStorage key `neurons-quiz-hotkeys-banner-dismissed-v4` SHALL equal `'true'`
- **AND** the legacy `-v1` / `-v2` / `-v3` keys (if present from prior dismissals) SHALL be ignored — only `-v4` gates display now

#### Scenario: Banner is hidden on touch-only devices

- **GIVEN** the user's device matches `@media (hover: none) or (pointer: coarse)` (typical phone / touch tablet)
- **WHEN** Overview renders
- **THEN** the banner SHALL NOT visually appear (via CSS `display: none` in the `@media` block)
- **AND** dismissing the banner SHALL not be required (since it's never visible)

#### Scenario: Banner content uses `<kbd>` semantic elements + HelpMenu reference

- **GIVEN** the announcement banner is rendered
- **WHEN** assistive technology or a CSS-disabled view parses the markup
- **THEN** key references (`1`, `2`, `3`, `4`, `Enter`, `Space`, `↓`, `↑`, `Home`, `End`, `Esc`) SHALL be wrapped in `<kbd>` elements
- **AND** the trailing「詳見右上 ❓ →『⌨️ 鍵盤快捷鍵』」 SHALL appear as natural-Chinese text

#### Scenario: localStorage failure does not break the page

- **GIVEN** localStorage is unavailable (private browsing / storage quota exceeded / SecurityError)
- **WHEN** the player clicks the dismiss button
- **THEN** the banner SHALL still disappear in the current session (via React state)
- **AND** Overview SHALL NOT throw an error
- **AND** on next page reload, the banner SHALL re-render (acceptable degraded behavior; no error message shown)

### Requirement: Neurons-tw SHALL surface a global HelpMenu accessible from every route

The neurons-tw app SHALL render a floating ❓ FAB at the top-right corner that opens a dismissible HelpMenu panel covering neurons mechanics + bug reporting paths. The FAB SHALL be mounted at the App-level (inside `<AuthProvider>` but outside the `<Routes>`), so it stays anchored on every route — Overview, ConnectomePage, DmnCollectionPage, AchievementsPage, LeaderboardPage, MotionDemoPage — without per-route wiring.

**FAB placement and styling**:

- Position `fixed` at `top: 1rem; right: 1rem` on desktop (≥ 600px viewport); `z-index: 900` so it sits above route content but below modals (`z-index: 1000+`).
- Renders as a circular 44×44px button (`border-radius: 50%`) with `❓` icon + accent border matching the warm GBA palette (`background: #fdf6e3; border: 2px solid #8c6d4a; color: #5a3f29`).
- `aria-label="開啟說明選單"`.
- Hover state: subtle lift + accent fill.
- Active state (panel open): `aria-expanded="true"` + accent fill visual.
- The FAB SHALL persist on the new `/bookmarks` route added by `add-neurons-question-bookmarks` (same App-level mount applies).

**Panel structure**:

- Click on FAB opens a panel below the FAB. Panel rendered as `role="dialog" aria-modal="true" aria-label="說明選單"` to signal semantic structure.
- Backdrop: semi-transparent dark overlay (`background: rgba(20, 12, 30, 0.4)`) behind the panel, clickable to close.
- Panel content: `max-width: 480px`, max-height: `calc(100vh - 6rem)`, overflow-y: auto; rounded corners + GBA-palette border + cream background matching modal pattern.
- Panel header: title「📖 說明選單」+ ✕ close button (`aria-label="關閉說明選單"`).
- Panel body: a `<ul role="list">` of accordion `<li>` sections, each containing a native `<details>` element (semantic HTML for keyboard-accessible accordion).

**Accordion sections** (7 sections after `add-neurons-question-bookmarks`, identified by stable `id`):

1. **id=`hotkeys`, icon=⌨️, title=「鍵盤快捷鍵」** — body covers full hotkey reference matching the `QuizModal SHALL accept keyboard hotkeys` requirement (asking-phase 1-4 highlight + Enter, answered-phase Enter/Space + 150ms cooldown, **answered-phase `1` bookmark toggle, `2` ✨ 太簡單, `3` 🤔 我亂猜的**, scroll keys, Esc, mouse-click bypass).
2. **id=`bookmark`, icon=⭐, title=「收藏題目」** — body covers the bookmark feature: 「答題時按 ⭐ 按鈕或 <kbd>1</kbd> 鍵收藏題目，到 <a href="/bookmarks">收藏</a> 頁面隨時複習。卡片可顯示 ✨ / 🤔 標記，BookmarksPage 也可按 family + ✨ / 🤔 篩選。收藏會跨裝置同步（需登入）。」
3. **id=`variant-unlock`, icon=🧬, title=「變體解鎖」** — body covers per-family AP threshold ladder + auto-pull on threshold + `/connectome` link.
4. **id=`synapse-formation`, icon=🔗, title=「Synapse 形成」** — body covers cross-family 同日各答對 5 題 → wire + weak→strong tier + 7-day decay.
5. **id=`dmn-draws`, icon=💎, title=「DMN 抽卡」** — body covers time-axis (30 min/draw, cap 2) + behavior-axis (variant slot unlock / synapse form / synapse strengthen, cap 3) + 20-card closed cap at `/dmn` + 5 event kinds.
6. **id=`leaderboard`, icon=🏆, title=「排行榜」** — body covers opt-in flow + nickname NFKC + lowercase 撞名檢查 + 6 filter columns + opt-out flow.
7. **id=`bug-report`, icon=🩺, title=「回報問題」** — body links out to GitHub Issues `https://github.com/fireman333/study-rpg/issues/new` (rendered as `<a target="_blank" rel="noopener">`); one-liner: 「目前 neurons 尚未接 in-app 回報，請開 GitHub Issue 並標 `neurons` label。也歡迎 PR。」. NOT a form modal (defer to future `add-neurons-bug-reporting` change if Supabase wiring lands).

**Single-expand accordion behavior**:

- Only ONE section may be expanded at a time. Opening section X SHALL collapse all others.
- Clicking the summary of an already-open section closes it (toggle behavior).
- State held in transient React state `expandedId: string | null`; not persisted to localStorage / Dexie / sync.

**Close affordances**:

- Click ✕ in panel header → panel closes.
- Click backdrop (outside the panel) → panel closes.
- Press `Esc` → panel closes (separate listener from QuizModal's Esc; both can coexist since QuizModal's Esc only fires when QuizModal is open).
- Panel does NOT close on section toggle (so player can read multiple sections without re-opening).

**Mobile fallback** (`@media (max-width: 600px)`):

- FAB repositions to bottom-right corner (`top: auto; bottom: 1rem; right: 1rem`).
- Panel becomes a bottom sheet: `bottom: 0; left: 0; right: 0; width: 100%; max-width: none; border-radius: 12px 12px 0 0; max-height: 80vh`.
- Sections stay accordion-style (no horizontal layout change).

#### Scenario: FAB renders on every route

- **GIVEN** the player navigates between `/` / `/connectome` / `/dmn` / `/achievements` / `/leaderboard`
- **WHEN** any route renders
- **THEN** the ❓ FAB SHALL appear at the same top-right position (or bottom-right on mobile)
- **AND** the FAB SHALL be clickable on every route (no per-route gating)

#### Scenario: Click FAB opens panel with 7 sections

- **GIVEN** the player is on any route with the panel closed
- **WHEN** the player clicks the ❓ FAB
- **THEN** the panel SHALL open with all 7 accordion sections rendered in collapsed state (hotkeys / bookmark / variant-unlock / synapse-formation / dmn-draws / leaderboard / bug-report)
- **AND** the panel SHALL have `role="dialog" aria-modal="true"` and the proper aria-label

#### Scenario: bookmark section links to /bookmarks page

- **GIVEN** the player expands the `bookmark` section
- **WHEN** the player clicks the「收藏」 link inside the body
- **THEN** the route SHALL navigate to `/bookmarks`

#### Scenario: Single-expand accordion behavior

- **GIVEN** the panel is open with section `hotkeys` expanded and other sections collapsed
- **WHEN** the player clicks the summary of section `dmn-draws`
- **THEN** section `dmn-draws` SHALL expand
- **AND** section `hotkeys` SHALL collapse (no two sections open simultaneously)

#### Scenario: Clicking expanded section closes it (toggle)

- **GIVEN** the panel is open with section `variant-unlock` expanded
- **WHEN** the player clicks `variant-unlock`'s summary again
- **THEN** the section SHALL collapse
- **AND** no other section SHALL be expanded (player can have zero sections expanded)

#### Scenario: Backdrop click closes panel

- **GIVEN** the panel is open
- **WHEN** the player clicks the semi-transparent backdrop outside the panel content
- **THEN** the panel SHALL close
- **AND** the FAB SHALL return to closed-state styling

#### Scenario: Esc key closes panel

- **GIVEN** the panel is open
- **WHEN** the player presses `Esc`
- **THEN** the panel SHALL close
- **AND** if a QuizModal is also open behind the HelpMenu, the QuizModal's Esc listener MAY also fire (both close — acceptable since both are dismissible modals)

#### Scenario: Bug-report section links out to GitHub Issues

- **GIVEN** the player expands the `bug-report` section
- **WHEN** the player clicks the「開 GitHub Issue」 link
- **THEN** the browser SHALL open `https://github.com/fireman333/study-rpg/issues/new` in a new tab
- **AND** the link SHALL carry `target="_blank" rel="noopener"` attributes

#### Scenario: Panel mounts at App level — does not interfere with QuizModal

- **GIVEN** the player has a QuizModal open via family-card click
- **WHEN** the player clicks the ❓ FAB
- **THEN** the HelpMenu panel SHALL open over the QuizModal (higher z-index)
- **AND** the QuizModal SHALL remain mounted underneath
- **WHEN** the player closes the HelpMenu
- **THEN** the QuizModal SHALL still be visible and the player can continue answering

#### Scenario: Mobile viewport positions FAB at bottom

- **GIVEN** the viewport is approximately 414px wide (iPhone Plus)
- **WHEN** the player views any route
- **THEN** the FAB SHALL render at bottom-right (NOT top-right)
- **WHEN** the player taps the FAB to open the panel
- **THEN** the panel SHALL slide up as a bottom sheet covering up to 80% of viewport height

#### Scenario: HelpMenu state does not persist

- **GIVEN** the player opens the panel, expands section `synapse-formation`, then closes the panel
- **WHEN** the player reopens the panel later
- **THEN** the panel SHALL re-open with ALL sections collapsed (no memory of `synapse-formation` being last-opened)
- **AND** no localStorage / Dexie / sync table SHALL retain `expandedId` state

### Requirement: Neurons-tw SHALL persist per-question bookmarks with cross-device sync

The neurons-tw app SHALL provide a per-question bookmark feature so players can mark interesting / hard / want-to-revisit questions for later review. Bookmarks SHALL persist locally (Dexie) and SHALL sync across devices via the existing R2 LWW bundle pipeline.

**Schema** (Dexie v7):

- Table name: `questionBookmarks`
- Primary key: `questionId` (string — a question is bookmarked or not, at most one row per question)
- Indexed columns: `family` (for fast filter queries), `addedAt` (for chronological listing), `updatedAt` (for LWW sync)
- Row shape: `{ questionId: string, family: string, addedAt: number, updatedAt: number }`
- `addedAt` is set once when the bookmark is created; it does NOT update on re-bookmark (re-add after remove sets a NEW `addedAt`).
- `updatedAt` updates on every write (add / remove → tombstone row with `updatedAt = Date.now()`).
- No `note` / `tags` fields in v1 (defer to future change if owner demands).

**Service surface** (`apps/neurons-tw/src/lib/services/bookmarks.ts`):

- `addBookmark(questionId, family): Promise<void>` — upsert row; if already bookmarked, no-op (preserves original `addedAt`).
- `removeBookmark(questionId): Promise<void>` — delete row + write tombstone for cross-device delete propagation.
- `toggleBookmark(question: Question): Promise<boolean>` — convenience returning the NEW bookmarked state.
- `isBookmarked(questionId): Promise<boolean>` — synchronous-style check.
- `useIsBookmarked(questionId): boolean` — React hook via `liveQuery + subscribe` for reactive `<button>` rendering.
- `useAllBookmarks(): QuestionBookmarkRow[]` — React hook returning all bookmarks ordered by `addedAt` desc.

**QuizModal ⭐ button**:

- Renders in the QuizModal footer with `margin-right: auto` (pushed left), `結束` / `下一題` buttons on the right.
- Visible in BOTH asking and answered phases — player can bookmark before or after seeing the answer.
- Icon: filled `★` (with accent color `#d4a04d`) when bookmarked; outline `☆` (muted) when not.
- Tooltip / `aria-label`: 「收藏 (1)」 when not bookmarked; 「取消收藏 (1)」 when bookmarked.
- `aria-pressed` reflects current bookmark state.
- Click toggles bookmark via `toggleBookmark(q)`.
- Mobile (`@media (max-width: 600px)`): button text label hidden (`.bookmark-btn-label { display: none }`); icon-only.

**Hotkey `1` in answered phase**:

- The answered-phase `1` slot SHALL dispatch `{ kind: 'toggle-bookmark' }` (wired by this change; previously reserved as noop by `wire-neurons-quiz-hotkeys`).
- `useQuizHotkeys` hook SHALL accept a non-optional `onToggleBookmark: () => void` callback prop.
- QuizModal SHALL pass `onToggleBookmark: () => void toggleBookmark(q)` when wiring the hook.
- The asking-phase `1` slot remains as `highlight` for option A (no conflict — different phase).

**`/bookmarks` route**:

- New route `BookmarksPage` mounted at path `/bookmarks` in `App.tsx`.
- Top nav link「收藏 →」 added to the App-level header between「DMN →」 and「成就 →」.
- Page lists all bookmarked questions in `addedAt` desc order.
- Each row renders as an `<li>`:
  - Family badge (matching NT branch accent color) + **✨ chip when `easyMarked`, 🤔 chip when `guessedMarked`** (wired by `add-neurons-srs-binary-modifiers`)
  - Question stem (truncated to 100 chars + ellipsis)
  - Added timestamp (relative format: 「剛剛」 / 「3 分鐘前」 / 「2 小時前」 / 「昨天」 / `YYYY-MM-DD`)
  - 「★ 取消」 unbookmark button (immediate remove — no separate confirm modal since the action is reversible)
  - 「🎯 重新作答」 button → opens QuizModal scoped to a 1-question pool of that question
- Empty state: 「📭 目前沒有收藏的題目。在答題時按 ⭐ 收藏 按鈕或鍵盤 <kbd>1</kbd> 加入收藏。」 + link back to `/`.
- Filter bars at top (two rows):
  - Row 1 (flag filter, per `add-neurons-srs-binary-modifiers`): 2 toggle chips「✨ 只看太簡單」 + 「🤔 只看我亂猜的」. Default both off (show all). AND-combined when both on.
  - Row 2 (family filter): chips of all 11 families grouped by NT branch; click toggles exclusion. Default: all families included.
- Both filter rows AND together (flag filter AND family filter).
- Cap at 200 visible rows (warns when > 200 — dogfood scope guard).

**Sync via R2 LWW**:

- New `questionBookmarksAdapter` and `questionBookmarkTombstonesAdapter` in `apps/neurons-tw/src/lib/sync/tables.ts`.
- Bundle `SCHEMA_VERSION` bumps from `2` → `3` in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`.
- Snapshot: read all rows; serialize as JSON-safe records.
- Apply: LWW per `questionId` using `updatedAt` — incoming row wins iff `incoming.updatedAt > local.updatedAt`. Tombstones gate: incoming bookmark < local tombstone → skip (delete preserved); incoming tombstone > local bookmark → delete the bookmark; re-add un-deletes (clear tombstone).
- Forward-compat: existing v2 clients silently drop the `questionBookmarks` / `questionBookmarkTombstones` keys per `validateBundleMeta` tolerance.

#### Scenario: ⭐ button toggles bookmark and updates icon

- **GIVEN** the QuizModal is open showing question X (not yet bookmarked)
- **WHEN** the player clicks the ⭐ button
- **THEN** the icon SHALL change from outline `☆` to filled `★`
- **AND** `aria-pressed` SHALL flip to `true`
- **AND** the aria-label SHALL change from 「收藏 (1)」 to 「取消收藏 (1)」
- **AND** a new row SHALL appear in Dexie `questionBookmarks` with `questionId === X.id` and `addedAt === Date.now()`
- **WHEN** the player clicks the ⭐ button again
- **THEN** the icon SHALL revert to outline `☆`
- **AND** the row SHALL be removed from `questionBookmarks` (and a tombstone written to `questionBookmarkTombstones`)

#### Scenario: BookmarksPage renders all bookmarks in addedAt desc order

- **GIVEN** the player has bookmarked questions X (added 1 min ago), Y (added 10 min ago), Z (added 1 hour ago)
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL render 3 rows in order: X (top, 「剛剛」), Y (「10 分鐘前」), Z (「1 小時前」)
- **AND** each row SHALL display the family badge + stem truncated to 100 chars + 「★ 取消」 + 「🎯 重新作答」 button

#### Scenario: Empty state surfaces when no bookmarks exist

- **GIVEN** the player has no bookmarks
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL render an empty-state message containing 「目前沒有收藏的題目」
- **AND** SHALL include a link「← 回總覽開始答題」 back to `/`

#### Scenario: Family filter excludes selected families from list

- **GIVEN** the player has bookmarks across 3 families (藥理學, 生理學, 病理學)
- **WHEN** the player clicks the 藥理學 chip in the filter bar to exclude it
- **THEN** the page SHALL hide all 藥理學 bookmarks
- **AND** 生理學 / 病理學 rows SHALL remain visible
- **AND** the excluded chip SHALL render in dashed-border / muted style with `aria-pressed="false"`

#### Scenario: 「重新作答」 opens QuizModal scoped to that question

- **GIVEN** the player has bookmark for question X
- **WHEN** the player clicks 「重新作答」 on X's row
- **THEN** a QuizModal SHALL open with a 1-question pool containing only X
- **AND** after submitting + advancing, the modal SHALL show「題庫已答完」 (since the pool is exhausted)

#### Scenario: R2 sync replicates bookmarks across devices

- **GIVEN** the player bookmarks question X on Device A (writes to local Dexie + queues sync push)
- **WHEN** the player loads neurons on Device B (signed in to the same account)
- **THEN** the sync pull SHALL include the X bookmark in the incoming bundle
- **AND** Device B's local Dexie SHALL apply the row via LWW
- **AND** subsequent `useIsBookmarked(X.id)` calls on Device B SHALL return `true`

#### Scenario: Tombstone propagates bookmark removal across devices

- **GIVEN** the player has bookmarked X on both Device A and Device B
- **WHEN** the player removes the bookmark on Device A (writes tombstone with `updatedAt = T2 > original addedAt`)
- **AND** Device B pulls the latest bundle
- **THEN** Device B's local `questionBookmarks` SHALL have the X row removed
- **AND** Device B's `questionBookmarkTombstones` SHALL contain the tombstone
- **AND** `useIsBookmarked(X.id)` on Device B SHALL return `false`

#### Scenario: Re-add after remove clears tombstone

- **GIVEN** the player removed bookmark X (tombstone exists with `updatedAt = T1`)
- **WHEN** the player re-adds bookmark X (`addBookmark` runs)
- **THEN** the new bookmark row SHALL be written with fresh `addedAt = T2 > T1`
- **AND** the local tombstone for X SHALL be deleted
- **AND** subsequent sync push SHALL carry the bookmark row, not the tombstone

#### Scenario: v2 client tolerates v3 bundle (forward-compat)

- **GIVEN** a v2 client (pre-`add-neurons-question-bookmarks`) pulls a v3 bundle from R2
- **WHEN** `validateBundleMeta` runs
- **THEN** it SHALL log an info message about unknown fields but SHALL NOT throw
- **AND** the v2 client SHALL silently drop the `questionBookmarks` and `questionBookmarkTombstones` fields
- **AND** the v2 client SHALL still apply all other v2-known adapters normally

### Requirement: Neurons-tw SHALL persist per-question binary modifier flags with cross-device sync

The neurons-tw app SHALL provide two binary modifier flags per question — `easyMarked` (「✨ 太簡單」) and `guessedMarked` (「🤔 我亂猜的」) — so players can self-label questions for later targeted review. Flags SHALL persist locally (Dexie) and SHALL sync across devices via the existing R2 LWW bundle pipeline.

When a future `add-neurons-srs-pipeline` change ships an SRS scheduler, the engine SHALL consume these flags as scheduling inputs (easy → longer interval, guessed → shorter / re-queue). Until then the flags' user-facing value is: BookmarksPage filter for「only review the questions I marked ✨ / 🤔」 + at-a-glance visual badges on bookmark cards.

**Schema** (Dexie v8):

- Table name: `questionFlags`
- Primary key: `questionId` (string — one row per question, regardless of which flags are set)
- Indexed columns: `easyMarked`, `guessedMarked` (for filter queries), `updatedAt` (for LWW sync)
- Row shape: `{ questionId: string, easyMarked: boolean, guessedMarked: boolean, updatedAt: number }`
- Both flags coexist on the same row — a question CAN be both easy and guessed (semantically unusual but not forbidden; user can flip their mind).
- Row is created lazily: if a question has never been flagged, no row exists. Reading missing row → both flags treated as `false`.

**Service surface** (`apps/neurons-tw/src/lib/services/question-flags.ts`):

- `getFlag(questionId): Promise<QuestionFlagRow | null>` — returns row if exists, else null.
- `setEasy(questionId, value: boolean)` / `setGuessed(questionId, value: boolean)` — upsert; refreshes `updatedAt` (preserves the other flag).
- `toggleEasy(questionId): Promise<boolean>` / `toggleGuessed(questionId): Promise<boolean>` — convenience returning new flag state.
- `useFlag(questionId): { easyMarked, guessedMarked }` — React hook via liveQuery+subscribe.
- `useAllFlags(): QuestionFlagRow[]` — React hook for filter queries.

**QuizModal buttons** (visible only in answered phase):

- 「✨ 太簡單」 button: yellow accent (`#d4a04d`) when `easyMarked === true`; outline when not. `aria-pressed` reflects state. Tooltip: 「標記 ✨ 太簡單（鍵盤 2）」 / 「取消 ✨ 標記（鍵盤 2）」.
- 「🤔 我亂猜的」 button: blue accent (`#6a9bc4`) when `guessedMarked === true`; outline when not. `aria-pressed` reflects state. Tooltip: 「標記 🤔 我亂猜的（鍵盤 3）」 / 「取消 🤔 標記（鍵盤 3）」.
- Layout: `[⭐ 收藏] [✨ 太簡單] [🤔 我亂猜的]    [結束] [下一題]` (flag/bookmark group left with margin-right: auto on first, action buttons right).
- Mobile (`@media (max-width: 600px)`): both buttons collapse to icon-only via `.flag-btn-label { display: none }`.
- These buttons SHALL render in answered phase only — the semantic「太簡單 / 我亂猜的」 requires having seen the answer.

**Hotkey `2` and `3` in answered phase** (covered by the main hotkey requirement above).

**BookmarksPage integration** (covered by the bookmarks requirement above): row badges + flag filter chips, AND-combined with family filter.

**Sync via R2 LWW**:

- New `questionFlagsAdapter` in `apps/neurons-tw/src/lib/sync/tables.ts` (LWW per `questionId` using `updatedAt`).
- Bundle `SCHEMA_VERSION` bumps from `3` → `4` in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`.
- No tombstones needed — flag rows are mergeable not deletable (setting both flags to `false` keeps the row alive with `easyMarked=false, guessedMarked=false`).
- Forward-compat: existing v3 clients silently drop the `questionFlags` field per existing `validateBundleMeta` tolerance.

#### Scenario: Click ✨ button toggles easyMarked and updates icon

- **GIVEN** the QuizModal is open in answered phase showing question X (no flags set)
- **WHEN** the player clicks the「✨ 太簡單」 button
- **THEN** the button SHALL render with yellow accent + `aria-pressed="true"`
- **AND** a row SHALL appear in Dexie `questionFlags` with `questionId === X.id`, `easyMarked === true`, `guessedMarked === false`
- **WHEN** the player clicks the「✨ 太簡單」 button again
- **THEN** the button SHALL revert to outline style + `aria-pressed="false"`
- **AND** the row SHALL update with `easyMarked === false` (row persists; both flags now false)

#### Scenario: Both flags can coexist on same question

- **GIVEN** the QuizModal is open in answered phase showing question Y
- **WHEN** the player clicks both「✨ 太簡單」 and「🤔 我亂猜的」
- **THEN** the `questionFlags` row for Y SHALL have `easyMarked === true` AND `guessedMarked === true`
- **AND** both buttons SHALL render in active accent style

#### Scenario: BookmarksPage shows flag badges on rows

- **GIVEN** the player has bookmarked question X with `easyMarked === true` and question Y with `guessedMarked === true`
- **WHEN** the player navigates to `/bookmarks`
- **THEN** X's row SHALL display ✨ badge next to family badge
- **AND** Y's row SHALL display 🤔 badge next to family badge
- **AND** rows without flags SHALL show only the family badge

#### Scenario: BookmarksPage filter chip ✨ restricts to easy-marked bookmarks

- **GIVEN** the player has 3 bookmarks: A (✨), B (🤔), C (no flags)
- **WHEN** the player clicks「✨ 只看太簡單」 filter chip
- **THEN** the page SHALL show only row A
- **AND** the chip SHALL render in `aria-pressed="true"` accented state
- **WHEN** the player clicks the chip again
- **THEN** the filter SHALL clear; all 3 rows SHALL reappear

#### Scenario: Both flag filters AND together

- **GIVEN** the player has bookmarks: A (✨ only), B (🤔 only), C (both ✨ + 🤔), D (no flags)
- **WHEN** the player toggles both「✨ 只看太簡單」 AND「🤔 只看我亂猜的」 chips ON
- **THEN** the page SHALL show only row C (the only bookmark with BOTH flags)

#### Scenario: v3 client tolerates v4 bundle (forward-compat)

- **GIVEN** a v3 client (pre-`add-neurons-srs-binary-modifiers`) pulls a v4 bundle from R2
- **WHEN** `validateBundleMeta` runs
- **THEN** it SHALL log an info message about unknown fields but SHALL NOT throw
- **AND** the v3 client SHALL silently drop the `questionFlags` field
- **AND** the v3 client SHALL still apply all other v3-known adapters normally

### Requirement: Rarity reveal animations SHALL share a centralized timing baseline with rarity-tiered minimums

All rarity-based reveal UI in neurons-tw — including `VariantUnlockModal` from `neuron-variant-gacha` and `DmnCardReveal` from `neurons-dmn-fate-cards` — SHALL consume reveal timing constants from `neurons-motion-library` (`apps/neurons-tw/src/lib/motion.ts` or equivalent module). No reveal component SHALL declare inline numeric duration literals for the rarity-tiered ceremony.

The motion library SHALL export a `RARITY_REVEAL_TIMINGS` (or equivalent named) constant mapping each rarity grade to a `{ durationMs, spinTurns }` pair. The mapping SHALL satisfy:

- **All 5 rarity grades** (P1 / P2 / P3 / P4 / P5) SHALL have `durationMs >= 1000`. No rarity is permitted to flash by faster than 1000ms.
- **P1 鑽** SHALL have `spinTurns >= 3` and `durationMs >= 1500`, producing a multi-rotation spectacle ("快轉 → 減速 → 定位" three-stage feel) befitting the rarest tier.
- **P2 金 / P3 銀 / P4 銅 / P5** SHALL have `spinTurns === 0` (no spin; use fade + scale + flash only). These tiers are reserved for the simpler ceremony.

The exact monotonic ordering and values (e.g., P5 = 1000ms, P4 = 1000ms, P3 = 1100ms, P2 = 1200ms, P1 = 1500ms) are an implementation detail tuned by the motion library and may evolve, **but the two hard constraints above (all ≥ 1000ms; P1 ≥ 3 spin turns) are normative and may not be relaxed without a new change**.

Components SHALL respect OS `prefers-reduced-motion`:

- When `useRespectsReducedMotion()` returns `true`, all reveal animations SHALL degrade to opacity-only fade-in of the same total duration.
- Spin rotation SHALL NOT play under reduced-motion preference, regardless of rarity.

#### Scenario: P1 reveal plays multi-rotation spectacle

- **GIVEN** a player triggers a P1 reveal (e.g., variant gacha P1 unlock or DMN P1 draw)
- **WHEN** the reveal modal mounts
- **THEN** the modal SHALL animate with a CSS / Framer Motion variant that rotates the artwork at least 3 full turns
- **AND** the animation total duration SHALL be at least 1500ms
- **AND** the easing SHALL produce a clear deceleration (e.g., ease-out cubic or equivalent) so the artwork "snaps into place" at the end

#### Scenario: All non-P1 reveals meet 1000ms baseline

- **GIVEN** a player triggers a P2, P3, P4, or P5 reveal
- **WHEN** the reveal modal or toast renders
- **THEN** the animation total duration SHALL be at least 1000ms
- **AND** no rotation SHALL be applied

#### Scenario: Reduced-motion users get opacity-only fade

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** any rarity reveal mounts
- **THEN** the reveal SHALL use only opacity fade-in over the same total duration
- **AND** rotation, scale bounce, and translate transforms SHALL NOT apply

#### Scenario: Reveal components forbid inline timing literals

- **GIVEN** a developer audits `apps/neurons-tw/src/components/VariantUnlockModal.tsx` (or any reveal component)
- **WHEN** the developer searches for numeric literals `1000`, `1500`, `3000` etc. in animation duration / turns position
- **THEN** those literals SHALL NOT appear inline
- **AND** the file SHALL import `RARITY_REVEAL_TIMINGS` (or the equivalent named export) from `'../lib/motion'` (or the motion library path)

### Requirement: Production build SHALL NOT surface dev-only diagnostic UI

The neurons-tw production build (`pnpm build`, deployed to `med-study-rpg.com/neurons/` and `fireman333.github.io/study-rpg/` if applicable) SHALL NOT render or expose dev-only diagnostic UI to end users. Specifically:

- The `/motion-demo` route SHALL NOT be linked from the main `<nav>` element. The route itself MAY remain reachable by direct URL for developer self-verification, but no user-facing entry point SHALL exist.
- The `ConnectomeDebugPanel` component (containing buttons such as「重設存檔」/「+1 答對」/「時間 +1 天」) SHALL NOT render in `ConnectomePage` or any other production page. The component MAY be deleted from the codebase entirely.
- The `ConnectomeTreeSvg` `fireRandomCascade` demo button (typically labeled「⚡ 觸發傳遞 (demo)」) and its driving function SHALL NOT render or be invocable in production.

Diagnostic capability for developers SHALL be available via DEV-only hooks (e.g., `import.meta.env.DEV` gated `globalThis.__db` / `globalThis.__sync` / Dexie browser devtools), not via production-visible UI surfaces.

#### Scenario: Production navbar omits motion-demo

- **GIVEN** the production build is deployed
- **WHEN** the player loads any page and inspects the top `<nav>` element
- **THEN** no `<a>` or `<button>` SHALL link to `/motion-demo`
- **AND** the 5 user-facing tabs (or however many are decided post-polish) SHALL be the only nav entries

#### Scenario: ConnectomePage does not render debug panel in production

- **GIVEN** a user visits `/connectome` on the production build
- **WHEN** the page renders
- **THEN** the component tree SHALL NOT include `<ConnectomeDebugPanel>` or any component containing dev-only reset / counter-bump buttons
- **AND** the page header / sidebar SHALL only contain user-facing content (empty state callout, family card grid, etc.)

#### Scenario: ConnectomeTreeSvg has no cascade demo button

- **GIVEN** a user views the connectome SVG on `/connectome`
- **WHEN** the SVG renders
- **THEN** no button labeled "⚡ 觸發傳遞" or marked `(demo)` SHALL exist in the SVG overlay
- **AND** the `fireRandomCascade` function (if it ever existed) SHALL either be deleted or be unreachable from any production render path

### Requirement: Leaderboard push SHALL include real reading minutes from totalStudyMinutes counter

The neurons-tw leaderboard upsert payload (sent by `neurons-leaderboard.ts` to the Cloudflare Worker's `/leaderboard/upsert` endpoint and persisted to D1 column `total_study_min`) SHALL reflect the real `meta['totalStudyMinutes']` counter accrued by the `reading-timer` service. The previously-shipped placeholder value of hardcoded `0` SHALL be replaced with the actual counter read via the existing `readTotalStudyMinutes()` helper.

The Worker D1 schema, KV cron snapshot columns, and leaderboard UI rendering SHALL NOT change — the column has always accepted this field but the client was sending 0. After this requirement is implemented, the column SHALL begin reflecting non-zero values for any user with active reading-timer sessions.

#### Scenario: Leaderboard push reads totalStudyMinutes

- **GIVEN** a user has accrued 42 minutes via the reading-timer (i.e., `meta['totalStudyMinutes'] === 42`)
- **WHEN** the leaderboard sync runs (e.g., on `onPushComplete` after a sync session)
- **THEN** the POST body to `/leaderboard/upsert` SHALL include `total_study_min: 42`
- **AND** the D1 row for that user SHALL be updated to `total_study_min = 42` (LWW per `updated_at`)
- **AND** the next leaderboard KV snapshot cron SHALL surface that value in the relevant `top100` filter (if applicable)

#### Scenario: First-time user with zero accrual still pushes zero (no regression)

- **GIVEN** a fresh user who has never started the reading-timer (i.e., `meta['totalStudyMinutes']` undefined or 0)
- **WHEN** the leaderboard sync runs
- **THEN** the POST body SHALL include `total_study_min: 0`
- **AND** no exception SHALL be raised due to missing meta key
