# neurons-single-subject-rescue — delta

## ADDED Requirements

### Requirement: Anonymous rescue does not clobber an account's cloud plan on first sign-in

Rescue plan/confidence/override state is account-owned but is writable while signed out (device-local anonymous play). On the FIRST cloud pull after an anonymous device signs into an account (the account-switch gate's `proceed-and-write` / marker-was-null path), the account's cloud rescue plan SHALL be authoritative when it carries an active (non-null) plan: the incoming cloud plan envelope SHALL replace the local plan envelope regardless of `updatedAt`, so an anonymous local plan with a later `updatedAt` cannot last-write-wins-overwrite the account's real rescue plan.

When the account has no cloud rescue plan (the plan key is absent, or the cloud envelope is an explicit `null`), the anonymous local plan SHALL carry over via normal last-write-wins, so a genuinely-new account keeps the anonymous progress.

This cloud-wins override SHALL apply ONLY to the first pull after adoption; every subsequent pull SHALL reconcile the plan envelope by normal latest-action-wins last-write-wins.

#### Scenario: Anonymous plan does not overwrite the account's cloud plan
- **WHEN** a device holding an anonymous local rescue plan with a later `updatedAt` signs into an account whose cloud bundle already carries an active (non-null) rescue plan with an earlier `updatedAt`
- **THEN** after the first pull the local plan envelope equals the account's cloud plan
- **AND** the anonymous plan is not uploaded on the subsequent push

#### Scenario: New account keeps anonymous rescue progress
- **WHEN** a device holding an anonymous local rescue plan signs into an account whose cloud bundle has no rescue plan (the key is absent or the envelope is explicit-null)
- **THEN** the anonymous local plan is retained after the first pull

#### Scenario: Later pulls use normal last-write-wins
- **WHEN** any pull after the first post-adoption pull reconciles the rescue plan envelope
- **THEN** the plan envelope is merged by latest-action-wins last-write-wins with no cloud-wins override
