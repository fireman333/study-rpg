## ADDED Requirements

### Requirement: Mock attempts persist across reload

The Dexie schema SHALL include a `mockAttempts` object store with primary key `id` (string, client-generated UUID v4) and a secondary index on `paperId`. Each record SHALL persist a single mock-exam submission with enough fidelity to render the result screen offline and to compute the progress curve.

Record shape:

| Field | Type | Required | Semantics |
|---|---|---|---|
| `id` | `string` (UUID v4) | yes | Primary key; generated at submit time |
| `paperId` | `string` | yes | `"<year>-<session>-<paper>"` (e.g. `"114-1-medexam-1"` for 民國 114 第 1 session 醫一); indexed |
| `startedAt` | `number` | yes | Epoch ms when "開始作答" was clicked |
| `finishedAt` | `number` | yes | Epoch ms when "交卷" was clicked |
| `elapsedSec` | `number` | yes | Net active seconds (excluding paused intervals) |
| `totalScore` | `number` | yes | Count of correctly-answered questions (0 ≤ score ≤ paper total Q count, typically ≈100) |
| `perQuestionAnswers` | `Array<{ questionId: string; userSelection: string \| null; isCorrect: boolean }>` | yes | Per-question record; `userSelection: null` for unanswered |

#### Scenario: Submit writes a complete mockAttempt record

- **WHEN** the user clicks "交卷" on a mock with all fields present
- **THEN** a single `mockAttempts.put()` SHALL be invoked with the record described above
- **AND** the write SHALL complete within 500 ms (per existing persistence write-debounce SLA)

#### Scenario: Reload rehydrates the picker's "last attempt" overlay

- **WHEN** the app is reloaded and the mock picker mounts
- **THEN** for each paper cell, the picker SHALL query `mockAttempts.where('paperId').equals(paperId)` and select the record with the latest `finishedAt`
- **AND** SHALL render the last attempt's score + timestamp in the picker cell overlay

#### Scenario: Schema bump preserves existing player state

- **WHEN** an existing player (with prior Dexie state from before this change) opens the app after upgrade
- **THEN** the Dexie version bump SHALL add the `mockAttempts` store without altering any existing store
- **AND** the player's existing player state, SRS cards, and prior data SHALL remain intact
- **AND** no migration of existing rows SHALL be required

### Requirement: In-progress mock state persists across reload

While a mock is in progress (between "開始作答" and "交卷"), the runner's volatile state SHALL be persisted to a Dexie singleton key so that a page reload mid-mock returns the user to the same question with state intact.

Singleton shape (key: `'mockInProgress'`):

| Field | Type | Required | Semantics |
|---|---|---|---|
| `paperId` | `string` | yes | The paper being attempted |
| `startedAt` | `number` | yes | Epoch ms when "開始作答" was clicked |
| `currentQuestionIndex` | `number` | yes | 0-based index of currently-viewed question (0..79) |
| `selections` | `Record<string, string>` | yes | `questionId → optionKey`; missing keys = unanswered |
| `elapsedSecAtPause` | `number` | yes | Net active seconds accumulated up to the last freeze point |
| `lastResumedAt` | `number \| null` | yes | Epoch ms of last resume; `null` if currently paused |

#### Scenario: Writes happen at least every 5 seconds while active

- **WHEN** a mock is in progress and the user is actively answering
- **THEN** the singleton SHALL be written at least every 5 seconds (debounced) so that a sudden crash loses ≤ 5 seconds of progress

#### Scenario: Reload reads the singleton and resumes

- **WHEN** the app mounts AND the `mockInProgress` singleton exists with a non-stale `paperId`
- **THEN** the app SHALL route the user to `/mock/run` with state restored exactly from the singleton
- **AND** the stopwatch SHALL resume from `elapsedSecAtPause` (plus any active interval since `lastResumedAt` if non-null)
- **AND** a one-time toast SHALL inform the user "已從上次中斷處恢復"

#### Scenario: Submit clears the singleton

- **WHEN** the user submits a mock
- **THEN** after the `mockAttempts.put()` succeeds, the `mockInProgress` singleton SHALL be deleted
- **AND** subsequent `/mock` visits SHALL return to the picker (no auto-resume)

#### Scenario: Abandoning mid-mock leaves the singleton for next session

- **WHEN** the user closes the app mid-mock without submitting
- **THEN** the singleton SHALL persist
- **AND** the next session SHALL offer to resume (per "Reload reads the singleton and resumes" scenario)
- **AND** the user SHALL have an option to "放棄這次 mock" which clears the singleton without writing to `mockAttempts`
