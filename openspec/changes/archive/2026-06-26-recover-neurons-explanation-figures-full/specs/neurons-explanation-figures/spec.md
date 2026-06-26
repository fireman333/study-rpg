## MODIFIED Requirements

### Requirement: Pilot scope and batch-extensible contract

The in-scope id set SHALL cover the **106-114** booklets: the original pilot booklets (112-1, 112-2, 113-1, 113-2, 114-1, 114-2) plus the follow-up booklets 106-1 through 111-2 — EXCEPT the two booklets 109-1 醫學一 and 111-1 醫學二, which (like the 104-105 booklets) lack `題號` row-label anchors so the detector's region-split degenerates; those two, together with 104-105, are deferred to a later follow-up that adds a no-`題號`-anchor layout-parser fallback. The contract SHALL be extensible across batches: questions added in a later batch (e.g. 104-105 and the deferred reflow booklets once their layout-parser fallback lands) SHALL be governed by the identical contract (rasterized provenance-recorded crop, lazy-loaded, question text byte-identical) without changing it, and earlier-shipped figures SHALL be unaffected by later batches. A question outside the in-scope set SHALL NOT gain a figure.

#### Scenario: In-scope booklets gain figures, deferred booklets do not

- **WHEN** the 106-111 follow-up batch has shipped on top of the 112-114 pilot
- **THEN** recovered figures SHALL cover the in-scope 106-114 booklet questions, and no question in a deferred booklet (104-105, 109-1 醫學一, 111-1 醫學二) or outside the in-scope set SHALL gain a figure

#### Scenario: A later batch is attached under the same contract

- **WHEN** a later batch of figure-questions is added (e.g. 104-105 / the deferred reflow booklets after the no-anchor fallback lands)
- **THEN** it SHALL be attached under the identical contract (rasterized provenance-recorded crop, lazy-loaded, question text unchanged) and earlier batches' already-shipped figures SHALL be unaffected

#### Scenario: Earlier-shipped pilot figures are unaffected by the follow-up batch

- **WHEN** the 106-111 batch is extracted and merged into the figure manifest
- **THEN** the already-shipped 112-114 pilot figures SHALL remain attached and unchanged (the extractor merges by question id rather than overwriting the manifest)
