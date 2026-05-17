/**
 * Event-icon registry — maps modal event id to a 192×192 transparent pixel
 * sprite shown in the EventModal header. Used by `apps/medexam2-hospital-tw`
 * EventModal component as a visual cue for the event type.
 *
 * Generated via codex `gpt-image-2`:
 *   - All 4 icons (2026-05-17 `redesign-hospital-economy` §6 follow-up)
 *
 * Uses Vite's `import.meta.glob` with `?url`. Returns `undefined` if any icon
 * is missing — caller (EventModal) gracefully degrades by hiding the icon
 * slot and falling back to the emoji-only header.
 *
 * Toast events (negative-news / peer-criticism / research-award) don't have
 * dedicated icons since toasts auto-dismiss in 5s — too brief for an icon to
 * register visually.
 */

const eventIconModules = import.meta.glob('../sprites/events/event-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function extractEventKey(path: string): string {
  const match = path.match(/\/event-(malpractice|vip|emergency|audit)\.png$/)
  return match ? match[1] : ''
}

const eventIconEntries = Object.entries(eventIconModules)
  .map(([path, url]) => [extractEventKey(path), url] as const)
  .filter(([key]) => key)

export const EVENT_ICONS_MAP: Record<string, string> = Object.fromEntries(eventIconEntries)

export const EVENT_ICONS:
  | { malpractice: string; vip: string; emergency: string; audit: string }
  | undefined =
  EVENT_ICONS_MAP.malpractice &&
  EVENT_ICONS_MAP.vip &&
  EVENT_ICONS_MAP.emergency &&
  EVENT_ICONS_MAP.audit
    ? {
        malpractice: EVENT_ICONS_MAP.malpractice,
        vip: EVENT_ICONS_MAP.vip,
        emergency: EVENT_ICONS_MAP.emergency,
        audit: EVENT_ICONS_MAP.audit,
      }
    : undefined
