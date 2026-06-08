## Context

The `❓` HelpMenu reference drawer (`apps/neurons-tw/src/components/HelpMenu.tsx`) is the persistent in-app explainer for neurons mechanics. Its existence/placement/accordion behavior is governed by `neurons-mode` ("global HelpMenu accessible from every route"). That requirement, however, hard-codes "**7 sections**" with a scenario asserting exactly 7 enumerated `id`s, and its section-7 description still names the retired GitHub-Issues bug placeholder even though `add-neurons-bug-report` later replaced it with a `BugReportModal`. Meanwhile the working tree already carries a HelpMenu edit expanding to 15 sections (covering connector neurons, acceleration, companions, achievements, question bank, expedition modes, wrong-review). The spec and the implementation have drifted.

## Goals / Non-Goals

**Goals:**
- Bring the HelpMenu reference drawer in sync with the full shipped player loop, especially the connector neuron.
- De-enumerate the `neurons-mode` HelpMenu requirement so it owns the drawer *mechanism* (FAB / panel / single-expand accordion / close affordances / mobile sheet) and stops asserting a fixed section count — section *content* tracks shipped features.

**Non-Goals:**
- The first-visit `HomepageOnboarding` 4-step panel and its `neurons-homepage` requirement (untouched).
- Re-specifying per-section content as normative requirements (bug-report content stays owned by `neurons-bug-report`; DMN by `neurons-dmn-fate-cards`; etc.).
- Any schema / sync / Worker / dependency change.

## Decisions

**Decision: De-enumerate the section list rather than re-pin it to "15 sections".**
The requirement currently locks "7 sections" + a `Click FAB opens panel with 7 sections` scenario. Re-pinning to the new count would just re-incur drift on the next help addition. Instead, the MODIFIED requirement asserts the drawer *mechanism* and that it surfaces a set of accordion sections covering current neurons mechanics + a bug-reporting entry, with the list illustrative (not a locked count). Section-specific behavior is deferred to the owning capability spec. *Alternative considered:* lock the new 15-section list — rejected (owner chose generic; re-pinning guarantees future churn). *Alternative considered:* no spec delta — rejected (the existing requirement actively asserts the wrong count + a retired GitHub placeholder, so it must change).

## Risks / Trade-offs

- [Loosening the spec means a regression dropping a help section wouldn't be caught by spec scenarios] → Acceptable: help copy is low-risk, owner explicitly chose generic over locked, and Chrome MCP smoke this change verifies the drawer renders the expanded section set.
- [Stale section-7 GitHub description removed from `neurons-mode` without re-asserting modal behavior here] → Acceptable: `neurons-bug-report` already owns the `BugReportModal` behavior normatively; de-enumeration defers to it rather than duplicating.
