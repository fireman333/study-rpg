## REMOVED Requirements

### Requirement: Inline image-table rendering

**Reason**: Superseded by `neurons-simplified-explanations`. The shared explanation renderer now shows the per-option 簡答 list, not inline 詳解 table-image crops.

**Migration**: `explanationTableImages` data + the cropped WebP assets + the build injection are retained unchanged; the cropped tables are reached via the 「看原始詳解 PDF」 button. Only `Explanation.tsx`'s inline rendering of the image-table tier is removed.
