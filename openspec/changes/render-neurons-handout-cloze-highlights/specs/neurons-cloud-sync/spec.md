## ADDED Requirements

### Requirement: The neurons bundle SHALL carry the handout 顯示重點 preference from bundle schema version 30 with an explicit LWW post-pass

The meta key `handoutPrefs:v1:showHighlights`, whose value is the JSON string of `{ on: boolean, updatedAt: number }`, SHALL be listed in `SYNCED_META_KEYS`. Because the meta adapter's transport is first-write-wins and the value mutates, a registered post-pull backfill pass SHALL define its merge: the value with the greater `updatedAt` SHALL win; when the `updatedAt` values are equal, the value whose canonical JSON string (keys in fixed order) is lexicographically greater SHALL win, so two devices exchanging values in either order converge to the same value. A malformed incoming value SHALL lose to a well-formed local value; a malformed local value SHALL be treated as absent.

The key SHALL be the only `handoutPrefs:v1:` key that syncs; no prefix matcher SHALL be registered for it. The account-switch wipe SHALL delete it as a `SYNCED_META_KEYS` entry.

Adding it SHALL raise the bundle's `SCHEMA_VERSION` from 29 to 30, so that the existing downgrade refusal stops a client that predates the key from overwriting the cloud bundle with a meta snapshot that lacks it. A version 30 client reading a bundle of version 29 or older SHALL treat the missing key as absent, which means the toggle is on.

#### Scenario: Equal timestamps converge in any order
- **GIVEN** device A holds `{on:false, updatedAt:100}` and device B holds `{on:true, updatedAt:100}`
- **WHEN** A pulls B's value and B pulls A's value, in either order
- **THEN** both devices SHALL hold the same value

#### Scenario: The newer preference wins
- **GIVEN** local `{on:true, updatedAt:100}` and incoming `{on:false, updatedAt:200}`
- **WHEN** the post-pull backfill runs
- **THEN** local SHALL become `{on:false, updatedAt:200}`

#### Scenario: A malformed incoming value loses
- **GIVEN** local `{on:false, updatedAt:100}` and an incoming value that is not valid JSON
- **WHEN** the post-pull backfill runs
- **THEN** local SHALL remain `{on:false, updatedAt:100}`

#### Scenario: Account switch removes the preference
- **WHEN** the account-switch wipe runs on a device holding `handoutPrefs:v1:showHighlights`
- **THEN** the key SHALL be deleted
