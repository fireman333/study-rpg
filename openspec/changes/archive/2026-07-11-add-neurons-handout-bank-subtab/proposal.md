## Why

The 考前講義(beta) handout is currently reachable only from a button on the `/cram` page. The owner wants it also discoverable as a sub-tab of the 題庫 top-nav tab, alongside 題庫 and 考前猜題, so it sits where users browse question-bank / exam-prep surfaces.

## What Changes

- Add a third sub-tab 「考前講義」to the 題庫 top-nav tab's sub-tab bar (`SUBTAB_GROUPS.bank`), after 題庫 (`/bank`) and 考前猜題 (`/cram`), navigating to the existing `/cram/handout` route. Activating it launches the existing full-screen handout scene (Link/Launch — the handout is a `document.body` portal, so embedding it inline was assessed as a high-risk refactor and is out of scope). The 題庫 top-nav tab stays active while on `/cram/handout` via the existing `startsWith('/cram/')` group match.

## Capabilities

### Modified Capabilities
- `neurons-anatomy-handout`: adds the 題庫 sub-tab as a second entry point to the handout scene (the `/cram` entry button is unchanged).

## Impact

- **UI**: `apps/neurons-tw/src/App.tsx` — one entry appended to `SUBTAB_GROUPS.bank`. No new route (`/cram/handout` already exists), no `BANK_GROUP_PATHS` change (already covers `/cram/` via `startsWith`), no handout-scene change.
- **Zero** content / build / Dexie / R2 / sync change.
