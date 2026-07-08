// One-shot "anonymous → authed rescue cloud-wins" gate (add-neurons-rescue-anon-authed-claim).
//
// On first sign-in (account gate 'proceed-and-write' / marker was null), the account's
// cloud rescue plan must win over any anonymous local plan (see backfill/rescue.ts).
// "Protection" holds from sign-in until the device has reconciled with the account's
// cloud rescue state EXACTLY ONCE, then reverts to normal LWW. Reconciled means either:
//
//   - a pull DEFINITIVELY read cloud (`onStartupSettled(true)` for the startup pull; or
//     a later pull whose backfill `consumeForPull()` returns true and applies cloud-wins), OR
//   - a push LANDED (`onPushLanded()`) — with `clearEtag` on adoption the first push uses
//     `If-None-Match:*`, so a landed push proves the cloud blob did not pre-exist → there
//     was no account plan to protect; an existing plan would 412 → a recovery pull consumes
//     protection instead.
//
// This closes two leaks Codex found pre-ship: (1) a `blobMissing` startup (new account)
// never fires onPullComplete → without `onStartupSettled` the flag would leak to a later
// pull; (2) an ERRORED startup keeps protection, but if the first push then lands to empty
// cloud, `onPushLanded` clears it so a later applied pull can't misfire cloud-wins.

export interface AdoptionCloudWins {
  /** Read + consume protection for one pull's cloud-wins decision. */
  consumeForPull(): boolean
  /** Startup force-pull settled: clear on a definitive cloud read (true); keep on error (false). */
  onStartupSettled(readCloud: boolean): void
  /** A push landed → the account's cloud state is reconciled; stop protecting. */
  onPushLanded(): void
  /** Current protection state (introspection / tests). */
  isPending(): boolean
}

export function createAdoptionCloudWins(active: boolean): AdoptionCloudWins {
  let pending = active
  return {
    consumeForPull(): boolean {
      const wins = pending
      pending = false
      return wins
    },
    onStartupSettled(readCloud: boolean): void {
      if (readCloud) pending = false
    },
    onPushLanded(): void {
      pending = false
    },
    isPending(): boolean {
      return pending
    },
  }
}
