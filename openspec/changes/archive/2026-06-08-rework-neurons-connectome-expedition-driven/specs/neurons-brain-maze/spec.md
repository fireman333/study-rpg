## REMOVED Requirements

### Requirement: Strong synapse SHALL confer a capped cross-family energy bonus

**Reason**: 舊「自乘式」加成（每條 strong synapse 把該家族 accrual 自乘 +6%、cap +30%）又小又後置、玩家無感。改為可見的 **additive「突觸傳導」**（Synaptic Conduction）——wire 把來源科批次能量以可見 pulse 跨流給鄰科（純加分、有上限），規格在 `connectome-collection`。connectome 不再「隱形自乘」、也不是「零數值」。

**Migration**: 移除 `apps/neurons-tw/src/lib/maze/economy.ts` 的 `synapseBonus` **自乘乘數**及其呼叫；`accrueMazeEnergy` 乘數鏈變 `base × mazeSpeedMultiplier × speedAccel`（不含 synapse 自乘項）。新增獨立 **additive 傳導步驟**（在批次 accrual 點計算、寫鄰科 pool、emit `connectome.conductionPulse`），規格見 `connectome-collection` 的「Synapses SHALL confer visible, additive, capped synaptic conduction」需求。`db.synapses` state 由 overlay 渲染（見下方 overlay 需求）。

## MODIFIED Requirements

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-FAMILY **neural-energy** pool (11 pools) that is BOTH the exploration fuel and the pull cost (one currency per family, no separate manual-pull balance). A correct quiz answer in subject S SHALL accrue energy into family S's own pool directly (S is the family — no neurotransmitter-branch indirection). Reading time SHALL accrue **entirely to the single subject family the player has selected for the current reading session** (the per-subject reading model — there SHALL be no even-split across families); switching the reading subject SHALL end the prior session before the new family begins accruing. Accrual SHALL be scaled by the active answer streak, by that family's mastery tier, by the capped acceleration energy multiplier `energyAccel`, and by the capped acceleration speed multiplier `speedAccel`, plus the collected-count exploration-speed buff. **A family's own accrual SHALL NOT be self-multiplied by any synapse factor** (the prior self-multiplying strong-synapse `synapseBonus` is removed). Instead, a separate ADDITIVE **synaptic conduction** step (per `connectome-collection`) MAY grant a family extra energy from its wired neighbors' batched earnings — this is additive cross-flow into the pool, not a multiplier on the family's own accrual, and an unwired family is never affected. The settle cost SHALL follow the front-loaded **capped** pacing schedule `cost(N) = round(PACING_BASE × (1 + PACING_K · min(N, RAMP_CAP_N)))` for the N-th cumulative settle within a family (0-indexed); the ramp climbs for the first `RAMP_CAP_N` settles and then **flattens** to a constant `round(PACING_BASE × (1 + PACING_K · RAMP_CAP_N))` for every later settle. First-cut constants (dogfood-telemetry-tunable): `PACING_BASE = 11`, `PACING_K = 0.10`, `RAMP_CAP_N = 20`, `CORRECT_ENERGY = 3`, `READING_ENERGY = 3`. The cumulative settle **index** N itself SHALL remain uncapped; only the per-settle `cost(N)` function is capped. A family's frontier advances inward from its border entry while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: Correct answer accrues energy scaled by the non-synapse multipliers

- **WHEN** the player answers correctly in subject S
- **THEN** earned energy is added to family S's pool, scaled by streak, S's mastery, capped `energyAccel`, capped `speedAccel`, and the collected-count buff
- **AND** no synapse self-multiplier SHALL be applied to S's own accrual (conduction, if any, is a separate additive step to neighbors per `connectome-collection`)

#### Scenario: A family's own accrual is unchanged by its synapses

- **GIVEN** family A participates in several `strong` synapses
- **WHEN** the player answers correctly in A
- **THEN** A's OWN energy accrual SHALL be identical to the case where A has zero synapses (the self-multiplying `synapseBonus` is removed)
- **AND** A's wired neighbors MAY separately receive additive conduction from A's batched earnings (per `connectome-collection`), which does not alter A's own pool

### Requirement: Synapse network overlay on the maze grid

The system SHALL render the synapse network as an overlay on the maze grid: each formed synapse (a co-firing **/ co-repair** family pair, per `connectome-collection`) SHALL be drawn at/through its synapse-intersection cell(s), with visual weight reflecting synapse state (dormant / weak / strong). The overlay SHALL be read-only with respect to synapse STATE — it SHALL NOT create, strengthen, or decay synapses (that mechanic is owned by `connectome-collection`). The overlay SHALL update as synapse state changes and SHALL be toggleable consistent with the maze's display model, and SHALL default to visible as the homepage's prominent connectome layer. The overlay SHALL ALSO surface synaptic conduction: when a `connectome.conductionPulse` event fires (per `connectome-collection`), the overlay SHALL animate a pulse traveling the corresponding wire from source family to target family. The overlay remains read-only with respect to synapse STATE and the conduction mechanic (it renders; it does not create/strengthen/decay synapses nor compute conduction energy — those are owned by `connectome-collection`).

#### Scenario: Formed synapse renders at its intersection

- **WHEN** a synapse exists between families A and B
- **THEN** an edge/marker is drawn at the A–B synapse-intersection cell on the grid
- **AND** its visual weight reflects the synapse's current state

#### Scenario: Overlay is render-only and default-visible

- **WHEN** a synapse strengthens or decays
- **THEN** the overlay updates its visual weight
- **AND** the synapse data/state itself is unchanged by the overlay
- **AND** the overlay defaults to visible (prominent connectome layer) and remains toggleable

#### Scenario: Conduction pulse animates along the wire

- **WHEN** a `connectome.conductionPulse { fromFamily, toFamily, amount }` event fires
- **THEN** the overlay SHALL animate a pulse traveling that wire from `fromFamily` toward `toFamily`
- **AND** the overlay SHALL NOT itself grant or modify any energy (it renders the already-granted conduction)
