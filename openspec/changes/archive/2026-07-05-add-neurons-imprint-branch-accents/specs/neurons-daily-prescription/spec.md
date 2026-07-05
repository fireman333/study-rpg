## MODIFIED Requirements

### Requirement: The lineage imprint UI SHALL render only grown branches and SHALL NEVER expose a denominator or gap

The imprint UI SHALL render **only families that have already grown an imprint**. A subject without an imprint SHALL NOT be rendered at all — no empty slot, no greyed placeholder, no "尚未解鎖" label, and nothing that occupies a position implying a gap. The UI SHALL NEVER display a fixed denominator or remaining-count in any form (no `X/11`, no `已解鎖 3/11`, no「還差 X 科」, no completion percentage, no progress bar toward a total). Grown imprints SHALL render as dendritic buds branching from the existing NG-0717 mascot inside `DailyPrescriptionCard`, with an optional expandable branch detail; NO separate collection page/tab SHALL be introduced. Each grown bud MAY carry a small **per-NT-branch accent motif** (a purely-decorative glyph derived from the subject's neurotransmitter branch — DA / 5-HT / GABA / Glu — layered over the tinted bud) to deepen the bud's visual identity; the accent SHALL be programmatic (no new sprite asset), SHALL render ONLY on already-grown buds, and SHALL NOT introduce any legend, key, per-branch tally, or otherwise imply a finite branch/subject set to be completed. Copy SHALL use accumulate-the-positive vocabulary (「長出」「留下印記」「今天固化」「新生分支」) and SHALL NOT use completion/deficit vocabulary (「收集完成」「解鎖全部」「尚缺」「還差 X 科」). This requirement governs user-facing copy/visuals only; the finite subject count MAY exist in backend state but SHALL NEVER be surfaced as a task or ceiling.

#### Scenario: Only grown branches render; ungrown subjects are absent
- **WHEN** the player has grown imprints for 3 subjects
- **THEN** exactly those 3 buds SHALL render, and the other 8 subjects SHALL NOT be shown in any form (no placeholder, grey slot, or gap)

#### Scenario: No denominator or remaining-count anywhere in the imprint UI
- **WHEN** the imprint UI (in-card buds and any expanded branch detail) renders
- **THEN** no `X/11`, no remaining-subject count, no completion percentage, and no progress-toward-total bar SHALL appear

#### Scenario: Copy stays accumulate-positive
- **WHEN** an imprint is grown or its detail is shown
- **THEN** the copy SHALL read as growth/keepsake (e.g.「新生分支：藥理學」) and SHALL NOT reference collection completion, unlock-all, or any「尚缺／還差」deficit

#### Scenario: Per-NT-branch accent is decorative and introduces no legend or tally
- **WHEN** a grown bud renders with its per-NT-branch accent motif
- **THEN** the accent SHALL be programmatic (no sprite asset), SHALL appear only on grown buds, and SHALL NOT add any legend, per-branch count, or implication of a complete branch/subject set to fill
