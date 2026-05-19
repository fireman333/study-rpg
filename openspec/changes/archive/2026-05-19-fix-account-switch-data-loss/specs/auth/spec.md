## MODIFIED Requirements

### Requirement: Sign-out clears session but preserves local data

The app SHALL provide a "Sign out" action that revokes the Supabase session and clears auth-only client state, while leaving IndexedDB gameplay state intact. The action SHALL FIRST await any pending sync engine `pushAllNow()` so that recent dirty writes are persisted to cloud BEFORE the engine is torn down (see `cloud-sync` capability "Sign-out flushes pending writes before signing out" requirement).

#### Scenario: Sign-out preserves local save

- **WHEN** the user signs out
- **THEN** the Supabase client SHALL clear its session
- **AND** the IndexedDB `Player` and `ItemInstance[]` records SHALL remain unchanged
- **AND** the user SHALL be able to continue playing offline immediately

#### Scenario: Sign-out awaits in-flight push

- **GIVEN** the user has dirty writes within the engine's debounce window (push timer not yet fired)
- **WHEN** the user invokes sign-out via the UI
- **THEN** the sign-out flow SHALL first invoke `engine.pushAllNow()` to flush dirty writes
- **AND** SHALL await its resolution
- **AND** ONLY then call `supabase.auth.signOut()`
- **AND** total sign-out latency MAY exceed the previous baseline by ~200-500ms

#### Scenario: Push failure during sign-out does not block sign-out

- **GIVEN** the user has pending dirty writes AND the network is offline (or push fails for any reason)
- **WHEN** the user invokes sign-out
- **THEN** the push error SHALL be recorded but SHALL NOT block sign-out
- **AND** the user SHALL still be signed out (best-effort flush, mandatory signOut)
- **AND** dirty writes remain in local IndexedDB; next sign-in's cold-start force-pull reconciles with cloud state
