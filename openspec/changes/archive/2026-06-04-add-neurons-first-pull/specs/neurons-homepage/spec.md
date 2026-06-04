## MODIFIED Requirements

### Requirement: Homepage SHALL surface a one-tap-dismissable first-visit onboarding that never reappears once dismissed

The homepage SHALL render a brief, skippable onboarding panel gated on a persisted `meta['homepageOnboardingDismissed']` flag. Dismissing it SHALL set the flag so it never reappears, including after F5 reload. The account-reset path SHALL clear the flag so a reset user sees the onboarding again. The existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`). The onboarding panel SHALL host the one-time 首抽 (first-pull) CTA while `meta['firstPullDone']` is absent/false. The 首抽 availability SHALL be gated on `meta['firstPullDone']` independently of `meta['homepageOnboardingDismissed']`; if the player dismisses onboarding before first-pulling, a compact 首抽 entry SHALL remain available (e.g., in the CTA toolbar) until `firstPullDone` is true.

#### Scenario: First-time user sees onboarding
- **WHEN** the homepage loads and `meta['homepageOnboardingDismissed']` is absent or false
- **THEN** the onboarding panel renders above the fold with a one-tap dismiss control

#### Scenario: Dismissed onboarding does not reappear
- **WHEN** the user dismisses the onboarding and later reloads the homepage (including F5)
- **THEN** the onboarding does not render and `meta['homepageOnboardingDismissed']` is true

#### Scenario: Account reset re-surfaces onboarding
- **WHEN** the user resets account data
- **THEN** `meta['homepageOnboardingDismissed']` is cleared and the onboarding renders again on next homepage load

#### Scenario: Connectome callout is unchanged
- **WHEN** a first-time user navigates directly to `/connectome` with no synapses
- **THEN** the existing `/connectome` empty-state callout still renders (it is not removed by this change)

#### Scenario: Onboarding hosts the first-pull CTA
- **WHEN** the onboarding renders and `meta['firstPullDone']` is absent or false
- **THEN** the onboarding panel presents the one-time 首抽 CTA

#### Scenario: First-pull entry survives onboarding dismissal
- **WHEN** the player dismisses onboarding while `meta['firstPullDone']` is still false
- **THEN** a compact 首抽 entry remains available (CTA toolbar) until `firstPullDone` becomes true
- **AND** once `firstPullDone` is true, no 首抽 entry is shown anywhere
