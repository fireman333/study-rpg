## REMOVED Requirements

### Requirement: Content build default subject scope

**Reason**: This requirement governed the `packages/content-medexam-tw` build script's `MEDEXAM_SUBJECTS` default-to-all-subjects behavior. That package is deleted by `remove-medexam-tw-and-promote-neurons`. The general build-tooling requirements that remain — "Production build does not pollute source directories" and "Build prints imported / skipped / total counter" — are package-agnostic and continue to apply to the surviving content pack (`packages/content-neurons-tw`). A neurons-specific content-scope requirement, if needed, belongs to a neurons capability, not this 一階-specific one.
