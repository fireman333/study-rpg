## Purpose

The shared sync Worker (`api.med-study-rpg.com`) must run inside the Workers Free plan's per-invocation CPU limit, so that the account can leave Workers Paid without losing the leaderboard refresh, the note-image reclamation, or the ability to roll a player's cloud save back to a known point. Player save sync is already far inside the limit; this capability governs the scheduled jobs, which were not, and the pre-deploy snapshot that replaces the one job removed outright.

## ADDED Requirements

### Requirement: One scheduled job per invocation

Each cron expression declared for the sync Worker SHALL dispatch to exactly one job, and a scheduled invocation SHALL NOT run a second job after the first completes. Two jobs that want the same cadence SHALL be given two distinct cron expressions, offset in time, so that each invocation's CPU cost is one job's cost and a limit applied per invocation is a limit applied per job.

#### Scenario: Two jobs at the same cadence get two expressions

- **WHEN** the 二階 leaderboard refresh and the neurons leaderboard refresh both run twice per hour
- **THEN** they SHALL be declared as two separate cron expressions (`0,30 * * * *` and `5,35 * * * *`), each dispatching to its own job only

#### Scenario: A dispatch case runs one job

- **WHEN** the scheduled handler matches an `event.cron` value
- **THEN** the matched case SHALL invoke one job function and return; it SHALL NOT sequence a second job function in the same case

### Requirement: Scheduled jobs fit a 10 ms CPU budget, measured not assumed

Every scheduled job of the sync Worker SHALL complete within 10 ms of CPU time per invocation, the Workers Free plan limit, and the claim that a job fits SHALL rest on production measurement (`workersInvocationsAdaptive` `cpuTimeP99` per `datetimeMinute`, over at least seven consecutive days) rather than on reasoning about the code. A job that is measured over budget SHALL be split, moved off the Worker, or removed — the budget SHALL NOT be met by lowering the job's frequency to reduce how often it fails.

#### Scenario: The downgrade gate

- **WHEN** seven consecutive days of production measurement show `cpuTimeP99 < 10 ms` for every `datetimeMinute` bucket of the sync Worker, cron minutes included
- **THEN** the account MAY be downgraded to Workers Free; before that reading exists, it SHALL NOT be

#### Scenario: A job measured over budget is not left in place

- **WHEN** a scheduled job's `cpuTimeP99` exceeds 10 ms in the measurement window
- **THEN** the job SHALL be split into smaller invocations, relocated off the Worker, or removed, and the measurement window SHALL restart; running it less often is not a remedy

#### Scenario: A job under measurement is read from platform records, not from itself

- **WHEN** a scheduled job whose fit is not yet established runs at a minute no other invocation shares
- **THEN** its CPU cost SHALL be read from the platform's per-invocation records for that minute (the analytics bucket, or the Workers Logs invocation record), because script code cannot observe its own CPU time; where a relocation decision needs to know how much of the cost is connection setup versus work, that split SHALL be obtained by running a controlled variant (connect, trivial query, return) and subtracting, not inferred from reading the code

### Requirement: No daily in-Worker backup; a pre-deploy snapshot instead

The sync Worker SHALL NOT run a scheduled job that copies player cloud saves between buckets. Instead, every deploy of a client app or of the Worker itself SHALL be preceded by a snapshot of all player cloud-save objects (`users/*` in the primary bucket) into the backup bucket under a timestamped prefix, taken server-side so that no object bytes transit the operator's machine. The deploy SHALL NOT proceed if the snapshot fails. Retention of snapshots SHALL be enforced by a bucket lifecycle rule (30 days), not by code that lists and deletes.

#### Scenario: Deploy takes a snapshot first

- **WHEN** an operator runs the deploy command of either client app or of the Worker
- **THEN** a snapshot of every `users/*` object SHALL be written to `backup/<timestamp>/users/*` in the backup bucket before any artifact is published, and the timestamp SHALL be printed so the restore point is known

#### Scenario: A failed snapshot blocks the deploy

- **WHEN** the snapshot step exits non-zero (missing credentials, tool not installed, bucket unreachable)
- **THEN** the deploy command SHALL stop before publishing and SHALL name what was missing; it SHALL NOT publish with a warning

#### Scenario: Old snapshots expire without Worker involvement

- **WHEN** a snapshot prefix is older than 30 days
- **THEN** it SHALL be removed by the backup bucket's lifecycle rule; no Worker code SHALL list or delete backup objects on a schedule

#### Scenario: A deleted account's snapshot copies expire, as today

- **WHEN** a player deletes their account after one or more snapshots captured their objects
- **THEN** those copies SHALL disappear when their snapshot prefix passes the 30-day lifecycle rule; nothing SHALL delete them earlier, which is the retention the daily backup already had (account deletion never reached the backup bucket)
