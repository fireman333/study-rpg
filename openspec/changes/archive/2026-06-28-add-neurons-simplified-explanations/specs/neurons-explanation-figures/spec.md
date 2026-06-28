## REMOVED Requirements

### Requirement: Inline figure render with no silent drop

**Reason**: Superseded by `neurons-simplified-explanations`. The shared explanation renderer now shows the per-option 簡答 list, not inline 詳解 figures.

**Migration**: `explanationFigures` data + the recovered figure assets + the build injection are retained unchanged; the recovered figures are reached via the 「看原始詳解 PDF」 button. Only `Explanation.tsx`'s inline rendering of the figure tier is removed.
