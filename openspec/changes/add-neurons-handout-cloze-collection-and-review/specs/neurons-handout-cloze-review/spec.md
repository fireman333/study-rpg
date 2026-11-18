## ADDED Requirements

### Requirement: Card learner state SHALL be stored per card in a synced Dexie table keyed by cardId

The app SHALL store a learner's state for handout cloze cards in a Dexie table `handoutClozeState`, introduced by Dexie version 21, with one row per card the learner has ever collected and `cardId` as the primary key. A card that was never collected SHALL have no row.

Each row SHALL record at least:
- `cardId`, the card's `anchorId`, and the `subjectId` and `leafId` parsed from that `anchorId` (`<subjectId>::<leafId>`);
- `collected` (whether the card is currently collected), `firstCollectedAt`, `lastCollectedAt`, and `collectedFrom`, the source of the last collection, one of `keypoint-tail`, `cards-page` or `highlight-preview` (the last reserved for the reader highlight layer);
- the SRS fields `interval`, `easeFactor` and `nextDueAt`;
- `reviewCount`, `firstReviewedAt`, `lastReviewedAt` and `lastRating`;
- `seenSentenceHash`, the corpus `sentenceHash` the learner last saw the card with;
- `maturedAt`, the maturity latch defined in this capability;
- `updatedAt`, the time of the row's last learner-initiated change.

`cardId` is the corpus's stable identity (`neurons-handout-cloze-corpus`). A topic ordinal, a bullet position or a sentence hash SHALL NOT be used as a row key.

The version 21 upgrade SHALL add only this table, SHALL NOT change any existing table's primary key, SHALL have no upgrade callback, and SHALL be accompanied by an upgrade fixture that first opens a version 20 database with representative rows and then reopens it at version 21.

Apart from applying rows pulled from the cloud — including the `maturedAt` write-back the sync requirement below demands — nothing SHALL write this table at app start. Every locally initiated write SHALL follow a learner action: collecting, uncollecting, or a due-review rating.

#### Scenario: Upgrading a version 20 save
- **GIVEN** a version 20 database holding representative rows in `questionHistory`, `meta` (including DMN counters) and at least one other synced table
- **WHEN** it is reopened at version 21
- **THEN** opening SHALL NOT throw, every existing row SHALL be unchanged, and `handoutClozeState` SHALL exist and be empty

#### Scenario: Opening the app writes nothing to the card table
- **GIVEN** a save with no card rows, and the learner is signed out or the cloud bundle holds no card rows
- **WHEN** the app starts and the learner does not collect or review anything
- **THEN** `handoutClozeState` SHALL still be empty

### Requirement: Card state SHALL sync in the neurons bundle by per-row last-writer-wins, and the maturity latch SHALL never regress

`handoutClozeState` SHALL ride the existing R2 `'neurons'` bundle as its own top-level key through its own table adapter. It SHALL NOT use a new bundle.

On pull, a cloud row SHALL replace the local row only when the cloud row's own `updatedAt` is later than the local row's. The sync engine's row-level bookkeeping timestamp SHALL NOT be the comparator.

After that choice, `maturedAt` SHALL be the earlier of the two finite values, or whichever is finite. A row whose `maturedAt` is set SHALL never lose it through a merge, whichever side wins. When the local row wins but the cloud row carries an earlier or the only `maturedAt`, the local row SHALL be rewritten with that `maturedAt`, and that rewrite SHALL be carried by the next push.

**Accepted loss under concurrent review.** Every other field merges as one unit. When two devices each rate the same card before either has synced, the row with the later `updatedAt` SHALL replace the other whole, and the losing device's review — its `reviewCount` increment, its schedule and its rating — SHALL be discarded. The SRS state that survives is a complete, valid state from one device, never a mixture of the two, and the cost is at most one review's worth of spacing per conflicting card. The maturity latch is the only field exempt from it.

A row missing `cardId` or a finite `updatedAt` SHALL be rejected on apply, counted, and SHALL NOT overwrite a local row. An account-switch "use cloud" apply SHALL replace local rows verbatim, as every other adapter does on that path.

#### Scenario: A newer review on another device wins
- **GIVEN** device A last changed card `c1` at 10:00 and device B changed it at 10:05
- **WHEN** device A pulls
- **THEN** device A's row for `c1` SHALL equal device B's

#### Scenario: A stale row cannot erase maturity
- **GIVEN** device A's row for `c1` has `maturedAt` set, and device B's row for `c1` has a later `updatedAt` and no `maturedAt`
- **WHEN** device A pulls
- **THEN** device A's row SHALL take device B's other fields AND SHALL keep its `maturedAt`

#### Scenario: The local row wins but the cloud row had matured
- **GIVEN** device B's row for `c1` has a later `updatedAt` and no `maturedAt`, and the cloud row for `c1` has an earlier `updatedAt` and `maturedAt` set
- **WHEN** device B pulls
- **THEN** device B's row SHALL keep its own other fields AND SHALL gain the cloud row's `maturedAt`, AND device B's next push SHALL carry it

#### Scenario: Two devices review the same card before syncing
- **GIVEN** card `c1` at interval 7 on both devices; device A rates it 有把握 at 10:00 and device B rates it 答錯 at 10:05, neither having synced
- **WHEN** both devices sync
- **THEN** both SHALL hold device B's row whole, AND device A's review SHALL be absent from the result

#### Scenario: An old bundle without the key
- **GIVEN** a cloud bundle written before this capability, with no card-state key
- **WHEN** it is applied
- **THEN** no error SHALL be thrown and local card rows SHALL be unchanged

### Requirement: Every local wipe of synced data SHALL cover the card table

The card table is not keyed by user id, so a wipe that skips it would leave one account's cards to be merged into the next account's cloud save. Therefore:
- the account-switch local wipe SHALL clear `handoutClozeState`, through the table list it derives from the adapter registry, and a test SHALL fail if the table is registered for sync but not cleared;
- every other local wipe of synced tables, including the in-place account reset, SHALL clear it.

The device-local card telemetry log SHALL NOT be cleared by an account switch. It describes this device's use of the feature, not an account's progress.

The daily push journal (defined below) belongs to the learner, not the device: it SHALL be kept separately for each account on the device, so that one account using up its daily quantity does not reduce another account's quantity.

#### Scenario: Switching account clears the previous account's cards
- **GIVEN** account A has collected three cards on this device
- **WHEN** the learner switches to account B and the account-switch wipe runs
- **THEN** `handoutClozeState` SHALL hold none of account A's rows

#### Scenario: Two accounts on one device each get their own daily quantity
- **GIVEN** account A has used up today's push quantity on this device
- **WHEN** account B signs in on the same device the same local day
- **THEN** account B's pushed set SHALL again hold up to the full push quantity

### Requirement: The shipped corpus SHALL be loaded once, fail soft, and only playable cards SHALL be shown

The app SHALL load `handout-cloze.json` at most once per session from the `import.meta.env.BASE_URL`-prefixed content path. A failed load SHALL NOT be cached, so a later caller retries.

A card is **playable** only when all of these hold:
- its `cardId` is in the loaded corpus;
- every mask's `prefix + exact + suffix` is found in the card's `bulletText`;
- the corpus `sentenceHash` equals the djb2 hash of `bulletText` with its `citeRanges` removed, computed by the same function the corpus build uses.

A card that fails any check SHALL NOT be shown or reviewed. The app SHALL log how many cards it loaded and how many it skipped.

While the corpus is loading, every count derived from it SHALL be treated as not loaded, never as zero. When the load fails:
- the 我的字卡 page SHALL show a visible error state;
- the keypoint-tail card row SHALL render nothing.

#### Scenario: A card whose mask no longer resolves
- **GIVEN** a shipped card whose answer text does not occur in its `bulletText`
- **WHEN** the app builds its card index
- **THEN** that card SHALL be excluded from every surface AND the skipped count SHALL include it

#### Scenario: Corpus fetch fails
- **WHEN** fetching `handout-cloze.json` fails
- **THEN** the 我的字卡 page SHALL show 「字卡載入失敗」 AND a later visit SHALL fetch again

### Requirement: The card face SHALL blank every mask and SHALL show citation years as tags

Every surface that shows a card face — the keypoint-tail preview, the 我的字卡 page and the review — SHALL render the card's `bulletText` with:
- the `answer` mask replaced by 「［　　］」;
- every `gloss` mask and every `hint` mask replaced by 「（…）」;
- each `citeRanges` span rendered as a visually distinct year tag rather than as text run into the sentence.

The placeholders SHALL NOT depend on the hidden text's length. No text other than the placeholders and the year tags SHALL be added to the bullet's characters. Revealing the answer SHALL show the `answer` and every `gloss` and `hint` text in place. Only the `answer` is the prompt; `hint` and `gloss` masks SHALL NOT be graded.

#### Scenario: A card with an answer, a gloss and a hint
- **GIVEN** the shipped card whose answer is 「蛔蟲」, with a gloss 「Ascaris lumbricoides」 and a hint 「蛔蟲區別於其他腸道線蟲」
- **WHEN** its face is rendered before reveal
- **THEN** none of the three masked texts SHALL appear, AND the trailing cite year SHALL appear as a year tag

#### Scenario: Reassembling the face
- **WHEN** the face's segments are concatenated with each placeholder replaced by the text it hides and each year tag by its text
- **THEN** the result SHALL equal `bulletText`

### Requirement: A handout topic with cards SHALL offer a card row after its content

In the `/cram/handout` scene, every `.hdt-topic` that carries `data-leaf-ids` and has at least one playable card SHALL render a card row at the end of that topic, after all of the topic's authored HTML and after any per-topic control the scene already renders there. The row SHALL show:
- how many of the topic's cards the learner has collected, out of how many exist;
- a 「收藏本考點 N 張」 control that collects every uncollected card of the topic;
- a disclosure that lists each card's face with a per-card collect / uncollect toggle.

A topic with no playable card SHALL render no card row. The row SHALL be hidden in the handout's print and PDF output.

The row SHALL be mounted into an app-owned container appended at the end of the topic element; it SHALL NOT be written into the handout HTML string, and it SHALL NOT insert, remove, wrap or rewrite any node inside a `ul.hdt-must`, `p.hdt-teach`, table or heading of the authored HTML. Its root element SHALL carry the fixed class `keypoint-cloze-row`, so that a later layer that searches a topic's authored bullets can exclude the row's own list items.

The row SHALL obtain its data by the topic's concept id alone (the subject and the first `data-leaf-ids` token). Collecting or uncollecting from this row SHALL go through this capability's write action with the source `keypoint-tail`; the handout page component and the code that renders the handout HTML SHALL contain no storage-write code of their own.

#### Scenario: Collecting a topic's cards
- **GIVEN** a topic with three playable cards, none collected
- **WHEN** the learner activates 「收藏本考點 3 張」
- **THEN** three rows SHALL exist, each collected with source `keypoint-tail`, with first due dates assigned by the push schedule
- **AND** the row SHALL read 已收藏 3 / 3

#### Scenario: The authored bullets are unchanged
- **WHEN** a carded topic renders with its card row
- **THEN** the serialised HTML of every `ul.hdt-must` in that topic SHALL equal its serialisation without this capability

#### Scenario: A topic without cards
- **WHEN** a topic has no playable card, or carries no `data-leaf-ids`
- **THEN** no card row SHALL render in it

### Requirement: 我的字卡 SHALL list collected cards, let the learner browse and collect, and start a review

The app SHALL serve a full-screen page at `/cram/cards`. The page SHALL survive a direct URL and a reload on the production host. It SHALL offer:

- **已收藏**: every collected card, grouped by subject and topic. Each card SHALL show its face, its source topic, and when it is next due. A card SHALL carry 「來源已更新」 when its source changed, and 「已下架」 when it has been retired. Each card SHALL offer uncollect.
- **可收藏**: every playable card, browsable by subject, then topic, with collect / uncollect per card and per topic. A collection made here SHALL record `cards-page` as its source.
- a 「開始複習（N 張）」 control over today's pushed cards, as defined below;
- a 「繼續複習」 control over every other due card, and a 「提前複習」 practice control over collected cards not yet due. Neither is limited by the daily push quantity. 提前複習 is practice only, as defined below.

When the learner has collected nothing, 開始複習 SHALL be disabled with a note saying so. When nothing is pushed today but cards are collected, it SHALL be disabled with a note stating when the next card is due, and 提前複習 SHALL remain available.

#### Scenario: Reloading the page
- **WHEN** the learner reloads `/cram/cards` on the production host
- **THEN** the page SHALL render its lists, not a 404 and not the hub

#### Scenario: Nothing collected yet
- **GIVEN** a save with no card rows
- **WHEN** the page opens
- **THEN** 已收藏 SHALL be empty with a note pointing to the 可收藏 tab and to the handout, AND 開始複習 SHALL be disabled

### Requirement: Review SHALL grade a revealed card with three ratings mapped onto the existing core SRS functions

A review SHALL present one card face at a time, a 「顯示答案」 control that reveals the masks, and then three ratings: **有把握**, **沒把握** and **答錯**. A rating SHALL be possible only after the answer is revealed.

A rating given in a **due review** — a review of a due card, whether pushed or reached through 「繼續複習」 — SHALL update the card's SRS fields through the existing SRS functions of `@study-rpg/core`. A rating given in 提前複習 SHALL NOT; see the push requirement. This capability SHALL NOT carry a scheduling formula of its own. The mapping SHALL be:

| rating | SRS function |
|---|---|
| 有把握 | the binary review, answered correctly |
| 沒把握 | the guessed review |
| 答錯 | the binary review, answered incorrectly |

A due-review rating SHALL also increment `reviewCount`, set `lastReviewedAt` (and `firstReviewedAt` if empty), record `lastRating`, set `seenSentenceHash` to the corpus's current `sentenceHash`, and set `updatedAt`.

The review SHALL support Space or Enter to reveal, and 1, 2 and 3 for the three ratings in that order.

#### Scenario: First confident review
- **GIVEN** a newly collected card with interval 0
- **WHEN** the learner reveals it and chooses 有把握
- **THEN** its interval and `nextDueAt` SHALL equal what the core binary review returns for a correct answer from interval 0

#### Scenario: Rating before reveal is impossible
- **GIVEN** a card whose answer is not yet revealed
- **WHEN** the learner presses 1
- **THEN** no rating SHALL be recorded

### Requirement: The system SHALL push a bounded number of cards per day, while the learner MAY review without limit

There is no cap on what a learner may choose to review, but there SHALL be a bound on how many cards the system itself puts in front of the learner each day. Once the day's quantity is used, the system pushes nothing more that day.

A card is **due** when it is collected, playable, and its `nextDueAt` is at or before now. Uncollected, retired and unplayable rows SHALL NOT be due and SHALL be excluded from every count.

**The daily push journal.** For each account on the device, the device SHALL keep a journal of the cards it has pushed today: the local day and the set of card ids, stored in device-local browser storage outside Dexie and outside the sync engine. The journal SHALL reset when the local day changes, SHALL NOT be synced, and SHALL be kept separately per account. A card is **consumed** — added to the journal — at the moment it is first shown in a review started from a push surface. Consumption SHALL be idempotent: showing the same card again, reopening the review, cancelling and restarting, or retrying a failed write SHALL NOT consume it twice. Cards of a push-started review that were never shown SHALL NOT be consumed. Opening a push surface, or building the pushed set, SHALL NOT consume anything.

**Pushed cards.** The push quantity SHALL be one constant, defined in one place, separate from the question SRS cap. Today's pushed set SHALL be every card consumed today that is still due, plus due cards not consumed today, up to the push quantity minus the number consumed today, ordered by `nextDueAt` earliest first and allocated round-robin across subjects. Once the number consumed today reaches the push quantity, no further card SHALL be added that day.

The push surfaces SHALL be the homepage due-card reminder (`neurons-homepage`), the hub 我的字卡 block's today count, and 開始複習 on 我的字卡; all SHALL use the pushed set, not the full due count. A card review SHALL NOT consume or change the question SRS queue, and a question review SHALL NOT consume the card push quantity.

**Learner-chosen review is not capped.** From 我的字卡 the learner SHALL be able to review every due card outside the pushed set through 「繼續複習」 — a due review that updates the schedule — and collected cards not yet due through 「提前複習」 — **practice only**: a rating there SHALL NOT change the card's SRS fields, `reviewCount`, review timestamps, `lastRating`, `seenSentenceHash` or `maturedAt`, and SHALL NOT write the card row at all. It MAY be recorded in the device-local telemetry log. Neither consumes the push journal.

**Staggered first due dates.** Collecting a card that has no schedule SHALL set its first `nextDueAt` to the start of the earliest local day, today or later, on which fewer than the push quantity of collected cards are due; cards overdue before today count toward today. Re-collecting a card that already has a schedule SHALL keep its schedule.

#### Scenario: More cards due than the push quantity
- **GIVEN** 50 due cards across two subjects, a push quantity of 30, and nothing consumed today
- **WHEN** the pushed set is built
- **THEN** it SHALL hold 30 cards allocated round-robin across the two subjects, AND the hub today count SHALL read 30

#### Scenario: No second batch on the same day
- **GIVEN** 50 due cards, a push quantity of 30, and the learner has been shown and has rated today's 30 pushed cards
- **WHEN** the pushed set is rebuilt later that same local day
- **THEN** it SHALL be empty, AND the hub today count SHALL read 0 and the homepage reminder SHALL NOT render, AND the remaining 20 due cards SHALL still be offered through 「繼續複習」

#### Scenario: A card shown but not rated stays pushed
- **GIVEN** a push quantity of 30, and a push-started review in which the learner was shown 5 cards, rated 3 and closed the review
- **WHEN** the pushed set is rebuilt the same local day
- **THEN** it SHALL hold the 2 shown-but-unrated cards plus up to 25 further due cards

#### Scenario: Opening and cancelling does not use the quantity twice
- **GIVEN** a push-started review that has shown one card
- **WHEN** the learner closes it and starts a push-started review again, which shows the same card first
- **THEN** exactly one card SHALL be recorded as consumed today

#### Scenario: Looking at a push surface consumes nothing
- **WHEN** the learner opens the homepage, `/cram` and `/cram/cards` without starting a review
- **THEN** nothing SHALL be consumed and the push journal SHALL NOT be written

#### Scenario: The quantity resets the next day
- **GIVEN** the push quantity was used up yesterday and cards are still due
- **WHEN** the first pushed set of the new local day is built
- **THEN** it SHALL again hold up to the full push quantity

#### Scenario: Practising ahead of schedule changes nothing
- **GIVEN** a collected card due in five days, at interval 7, with no `maturedAt`
- **WHEN** the learner practises it through 「提前複習」 and chooses 有把握 four times in a row
- **THEN** its `nextDueAt`, interval, ease, `reviewCount` and `maturedAt` SHALL all be unchanged, AND its row SHALL NOT have been written

#### Scenario: A large collection is spread over days
- **GIVEN** no card is due today or later, and a push quantity of 30
- **WHEN** the learner collects 70 cards at once
- **THEN** 30 of them SHALL be first due today, 30 tomorrow, and 10 the day after

#### Scenario: Question and card queues are independent
- **GIVEN** a family with 12 due questions in its 🔄 錯題 pool and 10 pushed cards
- **WHEN** the learner reviews all 10 cards
- **THEN** that family's due-question count SHALL still be 12

### Requirement: Card collection and review SHALL grant nothing and SHALL write nothing outside the card table

Collecting, uncollecting, rating and practising a card, and showing a card in a push-started review, SHALL write only:
- `handoutClozeState` (never by 提前複習);
- the device-local card telemetry log;
- the acting account's daily push journal, and only when a card is consumed.

The telemetry log and the push journal live in device-local browser storage, not in Dexie.

They SHALL NOT:
- grant AP, maze energy, DMN draw entitlement (`dmnGrantsTotal`, `dmnDrawsAvailable` or any DMN axis counter), equipment, consumables or achievements;
- write `questionHistory`, family mastery, study minutes, streaks, expedition progress, the daily prescription families, rescue state or the wrong-answer list.

This follows the rule that study-only practice surfaces do not feed the game economy. Any maturity reward belongs to a later change and SHALL be the only exception it introduces.

#### Scenario: A review session leaves the economy untouched
- **GIVEN** a snapshot of every Dexie store except `handoutClozeState`
- **WHEN** the learner collects three cards, reviews ten cards with mixed ratings, practises two cards and closes the review
- **THEN** every store in the snapshot SHALL be byte-for-byte unchanged

### Requirement: Source updates SHALL be flagged without resetting progress, and retired cards SHALL be kept but not reviewed

When a collected card's corpus `sentenceHash` differs from its row's `seenSentenceHash`, the card SHALL be shown with 「來源已更新」 on the 我的字卡 page and on the review card. Its SRS fields SHALL be kept unchanged. One due-review rating SHALL update `seenSentenceHash`, after which the flag SHALL disappear. A 提前複習 rating SHALL NOT clear it.

When a row's `cardId` is absent from the loaded corpus, the card is **retired**: it SHALL be listed under 「已下架」 on the 我的字卡 page, SHALL be excluded from every due count and every review, and its row SHALL NOT be deleted. If a later corpus restores the same `cardId`, the card SHALL resume with its history intact.

#### Scenario: The handout sentence was edited
- **GIVEN** a collected card whose row records `seenSentenceHash` `aaaa1111`, while the corpus now ships `bbbb2222` for it
- **WHEN** the learner opens 我的字卡
- **THEN** the card SHALL show 「來源已更新」 AND its interval SHALL be unchanged

#### Scenario: A card is removed from the corpus
- **GIVEN** a collected, due card whose `cardId` is no longer in the corpus
- **WHEN** the due queue is built
- **THEN** the card SHALL NOT be in it AND its row SHALL still exist

### Requirement: The first due review that reaches a 21-day interval SHALL latch maturity once

A card **matures** when a due-review rating produces an interval of at least 21 days while its row has no `maturedAt`. A 提前複習 rating SHALL NOT mature a card. The review SHALL then set `maturedAt` to the time of that rating.

`maturedAt` SHALL NOT be cleared or moved later by a later rating (including 答錯), by uncollecting, or by a sync merge.

The synced meta key `clozeMaturityDrawsCredited` SHALL exist in `SYNCED_META_KEYS` and SHALL merge across devices by numeric MAX through the post-pull counter backfill, in both directions. This change SHALL NOT read it, write it, or grant anything for maturity.

#### Scenario: Maturity is latched once
- **GIVEN** a card at interval 18 with no `maturedAt`
- **WHEN** the learner chooses 有把握 in a due review and the new interval is 45
- **THEN** `maturedAt` SHALL be set
- **AND** a later 答錯 on the same card SHALL leave `maturedAt` unchanged

#### Scenario: Maturity grants nothing yet
- **WHEN** a card matures
- **THEN** no DMN draw, AP, maze energy or other reward SHALL be granted AND `clozeMaturityDrawsCredited` SHALL be unchanged

### Requirement: A reviewed card SHALL name its source, link back to it, and be reportable

The review card and each card on the 我的字卡 page SHALL name the handout subject and topic the card comes from. The topic's display name SHALL be resolved from the shipped handout data by the card's `anchorId`, not stored on the row.

The review card SHALL offer 「📖 回去看這段」, which opens `/cram/handout?subject=<subjectId>&leaf=<leafId>` so the existing leaf resolver of `neurons-unit-correspondence` lands on the card's topic.

The review card SHALL offer a 🐞 report through the existing neurons bug-report flow. The report SHALL carry a card-specific context — the card's `cardId`, `anchorId`, `sentenceHash`, subject and topic — and SHALL NOT invent fields a card review cannot know.

#### Scenario: Going back to the topic
- **GIVEN** a review card from 寄生蟲學 whose `anchorId` is `寄生蟲學::intestinal-nematodes-soil-transmitted`
- **WHEN** the learner activates 「📖 回去看這段」
- **THEN** the handout SHALL open on 寄生蟲學 and land on the topic whose first `data-leaf-ids` token is `intestinal-nematodes-soil-transmitted`

### Requirement: Collection and review SHALL be measured on the device and from synced rows

The app SHALL keep a bounded, device-local telemetry log for this feature in device-local browser storage, outside Dexie and outside the sync engine, so it never enters a bundle. It SHALL record collect, uncollect, due-rating and practice events, each with its card, its source or rating, and whether the card was flagged 「來源已更新」. It SHALL hold at most 500 events. It SHALL be readable through a development-only handle. A telemetry failure SHALL NOT break collection or review.

The synced row fields defined above SHALL be sufficient for the owner to derive, from R2 bundle snapshots and without reading any per-player identity: how many players have at least five collected cards; a lower bound on how many of them reviewed on at least two distinct days within seven days of their first collection; and how collections split between collection sources.

#### Scenario: Telemetry never syncs
- **WHEN** the `'neurons'` bundle is built
- **THEN** it SHALL contain neither the card telemetry log nor any push-journal key

### Requirement: The help menu SHALL explain cards, and every card icon SHALL be a pixel sprite

The HelpMenu SHALL contain a 講義字卡 section. Its summary SHALL say where cards are collected and that they are reviewed on 我的字卡. Its details SHALL state what the three ratings do; the daily push quantity, rendered from its constant, and that the learner may keep reviewing past it; that 提前複習 is practice only and does not move a card's schedule or count toward maturity; and that a card whose source changed keeps its progress.

Every icon this feature renders as a UI element SHALL be a pixel sprite rendered through the app's emoji icon component, not a system emoji glyph.

#### Scenario: The push quantity is not a literal
- **WHEN** the daily push quantity constant changes
- **THEN** the help section SHALL show the new value without a copy edit

### Requirement: Collecting SHALL be one write action, reachable from any entry through one path

Collecting and uncollecting a card SHALL each be one action of this capability, keyed by `cardId` alone. Every entry that lets the learner collect or uncollect SHALL call that action and SHALL NOT write the card table by any other path. The entry is recorded only as the action's `source` argument.

This capability SHALL expose:
- collect a card, with a `source` of `keypoint-tail`, `cards-page` or `highlight-preview`;
- collect every uncollected playable card of a topic, by its concept id, with a `source`;
- uncollect a card;
- observe whether cards are currently collected, reactively;
- the playable cards of a topic by its concept id, with each mask's position and role in `bulletText`.

An unknown `source` value SHALL be rejected, not stored.

#### Scenario: One write path
- **WHEN** production source is searched for writes to `handoutClozeState`
- **THEN** every write SHALL be inside this capability's own collection or review module, or the sync layer's adapter and wipe paths

#### Scenario: An unknown source
- **WHEN** a collect is called with a `source` outside the three listed values
- **THEN** it SHALL throw AND no row SHALL be written
