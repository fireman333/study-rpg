> ⚠️ NOT owner-confirmed — requirement wording drafted by an agent (hash-leaderboard-user-ids, 2026-09-24) and pending review.

## Purpose

Login-free leaderboard and 留言 surfaces identify a player by an opaque, per-app keyed hash of their account id instead of the account id itself, so the public can tell rows apart and a signed-in player can find their own row, without the Supabase `user_id` ever being published.

## ADDED Requirements

### Requirement: Public surfaces identify players by a player key, not the account id

Every response the sync Worker serves without authentication that identifies a player — the five 二階 leaderboard snapshots (`GET /leaderboard/:filter`), the five neurons leaderboard snapshots (`GET /leaderboard/neurons/:filter`), and each app's 留言 board (`GET /shoutouts/:app`) — SHALL identify the player by their player key and SHALL NOT contain the player's account id (`user_id` / `author_key`) under any field name. A leaderboard row SHALL carry the key as `player_key`; a 留言 message SHALL carry it as `playerKey`. The echo returned to an author after posting SHALL follow the same rule. A leaderboard snapshot written to KV SHALL likewise carry `player_key` and not the account id, so that the stored snapshot is not a second copy of the identifier. A stored snapshot row that still carries `user_id` (written before this requirement, or during the rollout compatibility window) SHALL be keyed when it is served, under the secret in force at that moment, unless the snapshot records that its keys were derived under that same secret; so the account id stops leaving the Worker on deploy, and the window's keys stop at its deadline, rather than at the next refresh. Internal storage and joins (the leaderboard tables, masks, bans, reports, the audit log, the owner back-office) SHALL continue to use the account id.

These rules hold outside the rollout compatibility window defined below.

#### Scenario: A refreshed snapshot stores no account id

- **WHEN** either leaderboard refresh writes its five snapshots
- **THEN** no stored snapshot SHALL contain any value shaped like an account id, and every row SHALL carry a `player_key`

#### Scenario: No public read carries an account id

- **WHEN** any of the ten leaderboard snapshot reads or either 留言 board read is served
- **THEN** the response body SHALL contain no value shaped like an account id, in any field

#### Scenario: A snapshot stored before the change is keyed on read

- **WHEN** the stored snapshot still carries rows with `user_id` and no `player_key`
- **THEN** the public read SHALL return those rows with a `player_key` derived from the stored id and without `user_id`

#### Scenario: The post echo carries the author's key

- **WHEN** a signed-in player posts to a 留言 board
- **THEN** the echoed message SHALL carry that player's `playerKey` and SHALL NOT contain their account id

### Requirement: A player key is stable, per app, and not computable without the Worker's secret

A player key SHALL be derived by the Worker from the account id with a keyed hash whose key is a Worker secret, so that holding a candidate account id is not enough to confirm or compute a player's key. The same player SHALL have the same key on every surface of one app (the app's leaderboard snapshots and its 留言 board), and unrelated keys in different apps, so that the two apps' public surfaces cannot be joined against each other. A key SHALL be a fixed-format opaque string, distinguishable from an account id, that a client can use as a list key and compare for equality.

#### Scenario: Stable within an app

- **WHEN** the same player appears in several rankings of one app and on that app's 留言 board
- **THEN** every appearance SHALL carry the same key

#### Scenario: Unrelated across apps

- **WHEN** one player has rows in both the 二階 and the neurons leaderboard
- **THEN** their two keys SHALL differ

#### Scenario: Depends on the secret

- **WHEN** the secret is changed
- **THEN** every key SHALL change

### Requirement: Player keys fail closed when the secret is unavailable

When the Worker's player-key secret is absent or shorter than 32 characters, the Worker SHALL NOT fall back to publishing the account id. A leaderboard refresh SHALL write no snapshot at all in that run (the previous snapshots stay, so the page's「上次更新」time stops advancing). A request whose response would have to derive a key — a public read of a snapshot stored before this change, a 留言 board read not answered from the edge cache, a post, a report, or `GET /leaderboard/me` — SHALL be refused with HTTP 503 and `{ "error": "player_key_unavailable" }`. A public read of a snapshot whose rows all carry a stored key needs no derivation and SHALL still be served, without the account id. A post refused this way SHALL write nothing.

#### Scenario: The refresh writes nothing

- **WHEN** a leaderboard refresh runs without the secret
- **THEN** no KV snapshot SHALL be written and the previous snapshots SHALL be unchanged

#### Scenario: A read that needs a key is refused, not answered with the id

- **WHEN** a public read, a 留言 read, a post, a report, or `/me` needs to derive a key and the secret is missing
- **THEN** the response SHALL be 503 `player_key_unavailable`

#### Scenario: An already-keyed snapshot is still served

- **WHEN** the stored snapshot already carries `player_key` on every row and the secret is missing
- **THEN** the public read SHALL succeed and carry no account id

### Requirement: A signed-in player obtains their own key from their authenticated read

`GET /leaderboard/me` and `GET /leaderboard/neurons/me` SHALL return, at the top level of the response, a `player_key` equal to the key that app's public surfaces carry for the requesting player, derived from the verified token subject. It SHALL be present whether or not the player has a leaderboard row. A client SHALL recognise its own leaderboard row and its own 留言 message only by comparing this key with the row's `player_key` or the message's `playerKey`; it SHALL NOT compare a public row or message against the authenticated user id, and when it cannot obtain its key it SHALL treat no row and no message as its own.

#### Scenario: Key returned with or without a row

- **WHEN** a signed-in player with no leaderboard row calls `/me`
- **THEN** the response SHALL be `{ row: null, player_key: <their key> }`

#### Scenario: The neurons page finds its own row by key

- **WHEN** the neurons leaderboard page renders a snapshot containing the signed-in, opted-in player's row
- **THEN** that row SHALL be highlighted and the player's rank derived from it by matching `player_key` against the key from `/leaderboard/neurons/me`

#### Scenario: No key, no own row

- **WHEN** the client cannot obtain its key (older Worker, 503, network)
- **THEN** no row or message SHALL be treated as the player's own, and the client SHALL NOT fall back to the account id

### Requirement: A rollout compatibility window lets the Worker deploy before the clients

The Worker SHALL support a rollout compatibility window, configured as a deadline, during which it additionally carries the account id in the fields that clients built before this change read — `user_id` on a snapshot row, and the raw id in a 留言 message's `id` and `authorKey` — alongside the player key, and accepts a raw id as a report target. The window SHALL be open only while all of the following hold: the configured deadline is a real calendar date or a timestamp with an explicit offset, the current time is before it, it is no more than 14 days away, and a separate window secret is configured, usable, and different from the permanent secret. In every other case — the deadline absent, empty, unparseable, passed, or too far away, or the window secret missing, too short, or equal to the permanent secret — the window SHALL be closed (the default and the end state), and none of these fields SHALL carry the account id. The configuration committed to the repository SHALL NOT hold the window open. The 留言 board's edge-cache entry SHALL be keyed by both the identity format and whether the window is open, so neither a deploy nor the deadline serves a cached body of the other shape.

#### Scenario: Old clients keep working during the window

- **WHEN** the window is open
- **THEN** snapshot rows SHALL carry both `user_id` and `player_key`, and 留言 messages SHALL carry the raw id in `id` / `authorKey` and the key in `playerKey`

#### Scenario: The deadline closes the window without a deploy

- **WHEN** the configured deadline passes
- **THEN** the next public read SHALL carry no account id, including a read of a snapshot written while the window was open

#### Scenario: A deadline that cannot be read keeps the window closed

- **WHEN** the configured deadline is absent, empty, not a real date, a timestamp without an offset, or more than 14 days away
- **THEN** the window SHALL be closed

#### Scenario: The committed configuration keeps the window closed

- **WHEN** the repository's Worker configuration is checked
- **THEN** its deadline SHALL be empty, or a real date no more than 14 days away, and the retired open-ended flag SHALL NOT be present

### Requirement: The keys published during the window are retired when it closes

While the compatibility window is open, every player key SHALL be derived with the window secret; once it closes, with the permanent secret. `GET /leaderboard/me` SHALL follow the same rule, so a signed-in client always receives the key the surfaces currently carry. Every stored snapshot SHALL record a fingerprint of the secret its keys were derived under, and a stored row that still carries the account id SHALL be re-keyed on read under the secret in force whenever that fingerprint differs, so the first read after the deadline already carries permanent keys; the top-N halo SHALL follow the same rule. A record of (account id, key) pairs made during the window SHALL therefore resolve no key published after it.

#### Scenario: Window keys differ from permanent keys

- **WHEN** a player's row is served while the window is open, and again after the deadline
- **THEN** the two `player_key` values SHALL differ, and the later one SHALL equal the key `/me` returns after the deadline

#### Scenario: The first read after the deadline is re-keyed

- **WHEN** KV still holds snapshots written during the window and the deadline has passed
- **THEN** the public read SHALL carry permanent keys and no account id, and the 留言 top-N halo SHALL still flag the authors in the composite top-N

#### Scenario: A later rotation of the permanent secret

- **WHEN** the permanent secret is changed and the stored snapshot carries keys but no account id
- **THEN** the stored keys SHALL be served until the next refresh replaces them

### Requirement: Reports and the top-N halo are resolved through the key

`POST /shoutouts/:app/report` SHALL accept, as its target, the key the board published, and SHALL resolve it to the author by comparing it with the keys of the authors whose messages are not deleted — including hidden ones, since a cached board can still show a message that has since been hidden, and reporting it SHALL answer as before this change (`{ ok: true, hidden }`). A key that matches no such author (including another app's key, and a key from a window that has closed) SHALL be refused with 400 `invalid_target`, as SHALL, outside the compatibility window, a target that is not a player key; no report SHALL be recorded for a refused target. The top-N halo on the 留言 board SHALL be decided by matching each author's key against the keys of the app's composite snapshot, and SHALL still work against a stored snapshot that predates this change.

#### Scenario: A report by key reaches the author

- **WHEN** three distinct players report a message using the `authorKey` the board showed
- **THEN** the report SHALL be counted against that message's author and the message SHALL be hidden at the threshold

#### Scenario: Reporting an already-hidden message

- **WHEN** a player reports, by its key, a message that reports have already hidden
- **THEN** the Worker SHALL answer `{ ok: true, hidden: true }`

#### Scenario: A raw id is refused outside the window

- **WHEN** the flag is unset and a report names an account id
- **THEN** the Worker SHALL respond 400 `invalid_target` and record nothing

#### Scenario: Halo from a pre-change snapshot

- **WHEN** the composite snapshot still carries only `user_id` on its rows
- **THEN** authors in its top-N SHALL still be flagged

### Requirement: The owner's mask command resolves snapshot rows through the key

The owner command that masks and unmasks a 二階 leaderboard nickname SHALL locate a player's rows in the public snapshots by that player's key, derived with the same secret as the Worker from a copy the owner keeps locally (an environment variable, or a private file). Finding a player by filter and rank SHALL resolve the row's key to an account id by deriving the keys of the public rows' account ids and matching, reading no nickname. The subcommands that need the key SHALL refuse, before writing anything, when the secret is not available, and when the snapshot rows carry keys only and the snapshot's recorded secret fingerprint does not match the local copy (the Worker's secret was rotated and the copy was not); the secret SHALL NOT be printed or passed on a command line.

#### Scenario: Find by rank resolves the id

- **WHEN** the owner finds rank N of a filter whose snapshot carries only keys
- **THEN** the output SHALL name the account id whose key matches that row, with tier and reputation, and no nickname

#### Scenario: Missing secret refuses before writing

- **WHEN** the owner runs find, mask, or unmask without the secret
- **THEN** the command SHALL exit non-zero naming the missing secret and SHALL have made no database or snapshot write

#### Scenario: A stale local copy refuses before writing

- **WHEN** the owner runs find, mask, or unmask with a local secret other than the one the snapshots were keyed under
- **THEN** the command SHALL exit non-zero saying the local secret is not the Worker's, and SHALL have made no database or snapshot write

### Requirement: Key derivation in the refresh stays inside the leaderboard CPU budget

Each leaderboard refresh SHALL derive each distinct player's key at most once per run (plus one fingerprint of the secret), and the added cost SHALL be counted against the budget of「Leaderboard jobs fit a 10 ms CPU budget, measured not assumed」. The refresh's CPU after this change SHALL be read from production measurement after deploy; if a refresh then exceeds the budget, the key SHALL be moved out of the refresh (for example, stored when the row is written) rather than the refresh run less often.

#### Scenario: One derivation per player per run

- **WHEN** a player appears in all five rankings of one refresh
- **THEN** their key SHALL be derived once for that run, which an automated check SHALL count
