# cloud-sync (delta)

## ADDED Requirements

### Requirement: A single push intent SHALL NOT amplify into unbounded R2 PUT retries

A single logical push (one debounce cycle's worth of dirty state for one user/bundle) SHALL issue a **bounded** number of R2 `PutObject` attempts. On an `If-Match` precondition failure (412/409), the engine SHALL NOT spin a tight multi-retry loop that multiplies one push intent into several PUT attempts plus several pull GETs; instead it SHALL cap retries to at most one in-cycle attempt and, on continued conflict, leave the state dirty (`pending`) to be re-attempted on the next debounced cycle after a fresh pull. Backoff and debounce timing SHALL include jitter so that concurrent writers on different devices de-synchronize rather than re-collide in lockstep. This requirement is mechanism-agnostic: it holds for the current presigned-direct-PUT path and for any future server-mediated write path.

#### Scenario: A conflicted push does not multiply into a retry burst

- **GIVEN** a user whose push receives a 412 (another device wrote the bundle concurrently)
- **WHEN** the engine handles the conflict
- **THEN** it SHALL issue at most one in-cycle retry PUT (not a 3× burst)
- **AND** on continued conflict it SHALL leave the state dirty and defer to the next debounced cycle rather than hard-erroring or looping

#### Scenario: Concurrent devices de-synchronize via jitter

- **GIVEN** two devices of the same user whose debounce timers would otherwise fire together
- **WHEN** each schedules its next push
- **THEN** the debounce/backoff timing SHALL be jittered so repeated collisions are not deterministic

### Requirement: Cross-device concurrent writes SHALL converge without data loss

When the same user writes from multiple devices, the system SHALL converge all devices to a merged state that preserves every device's monotonic contributions (everWrong OR, event-log UNION, MAX counters, last-writer-wins for LWW fields) with no silent dropping of a device's write. A push that cannot land this cycle due to a precondition conflict SHALL retain its dirty markers so the write is not lost, and SHALL re-attempt after pulling and re-merging the latest cloud state.

#### Scenario: A losing writer is not dropped

- **GIVEN** device A and device B both push new progress concurrently and B's PUT 412s
- **WHEN** B defers and re-attempts on its next cycle
- **THEN** B SHALL pull A's merged state, re-merge its own still-dirty contributions, and push the union
- **AND** neither A's nor B's monotonic contributions SHALL be lost in the converged bundle
