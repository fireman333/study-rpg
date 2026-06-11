# cloud-sync — Delta Spec (add-worker-bundle-scoped-delete)

## ADDED Requirements

### Requirement: Worker delete endpoints accept an optional bundle scope

The sync Worker's `POST /reset` and `POST /delete-account` SHALL accept an optional JSON body `{ "bundle": "m2" | "bookmarks" | "neurons" }`. WHEN a valid `bundle` is provided, the Worker SHALL delete only that bundle's R2 object (key resolved by the same `bundleKey()` mapping the presign path uses). WHEN the body is absent, not JSON, or lacks a `bundle` field, the Worker SHALL preserve the legacy behavior of deleting every object under `users/<sub>/` (backward compatibility with existing 二階 clients). WHEN `bundle` is present but not a known bundle name, the Worker SHALL respond 400 and delete nothing (fail-closed — a typo must never escalate to a full-account wipe). The response JSON SHALL include a `scope` field (`"all"` or the bundle name) reflecting what was actually deleted.

#### Scenario: Scoped delete removes only the named bundle

- **WHEN** an authenticated client POSTs `/reset` with body `{ "bundle": "m2" }`
- **THEN** only `users/<sub>/m2-snapshot.json.gz` is deleted; `bookmarks.json.gz` and `neurons-snapshot.json.gz` survive, and the response carries `scope: "m2"`

#### Scenario: Legacy no-body request keeps full-prefix behavior

- **WHEN** an authenticated client POSTs `/reset` with no body (today's 二階 client)
- **THEN** every object under `users/<sub>/` is deleted, exactly as before this change, and the response carries `scope: "all"`

#### Scenario: Unknown bundle name fails closed

- **WHEN** an authenticated client POSTs `/reset` with body `{ "bundle": "m3" }`
- **THEN** the Worker responds 400 and deletes nothing
