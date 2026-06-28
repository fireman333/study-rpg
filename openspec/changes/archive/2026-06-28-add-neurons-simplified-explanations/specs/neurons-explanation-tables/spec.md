## REMOVED Requirements

### Requirement: Explanations SHALL render structured blocks as real tables, with a flat-string fallback

**Reason**: Superseded by `neurons-simplified-explanations`. The shared explanation renderer now shows the per-option 簡答 list instead of the prose/table 詳解 inline (the prose had the PDF-flatten / AI-drift quality issues this whole effort targets). The `explanationBlocks` data + its build-time reconstruction are retained on questions unchanged — only the inline rendering is removed.

**Migration**: The reconstructed prose/tables are reached via the 「看原始詳解 PDF」 button (the authoritative source). No data migration: `explanationBlocks` remains build-injected and available to any future renderer; only `Explanation.tsx`'s inline rendering of it is removed.
