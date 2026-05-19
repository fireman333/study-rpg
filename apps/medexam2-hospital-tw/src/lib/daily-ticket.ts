/**
 * Display label for the next daily ticket refresh.
 *
 * The underlying mechanic in `refreshDailyTickets` (see `db/schema.ts`) uses
 * UTC epoch days (`Math.floor(Date.now() / 86400000)`), which for Taiwan
 * (UTC+8, no DST) means the +1 grant fires at local 08:00 every day.
 *
 * Per `recruitment-gacha` spec UI-affordance sub-clause and `clarify-daily-ticket-ux`
 * design D1, the display is hard-pinned to Taiwan-local time regardless of the
 * user's actual browser timezone — 100% of current dogfood users are in Taiwan
 * and showing local-local time elsewhere would be wrong (the mechanic still
 * fires at UTC midnight, not the user's local midnight).
 *
 * Pure function: returns the suffix string to append after `🎟️ N / 99 ·`.
 * `now` is passed in so tests can supply any fixed time.
 */
export function getNextDailyRefreshLabel(
  now: Date,
  available: number,
  cap: number,
): string {
  if (available >= cap) return '已滿'
  const taiwanHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    hour12: false,
  }).format(now)
  const taiwanHour = parseInt(taiwanHourStr, 10)
  return taiwanHour < 8 ? '今日 08:00 +1' : '明日 08:00 +1'
}
