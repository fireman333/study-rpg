import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'

/**
 * add-neurons-bug-report §7.1 + §7.2 — auto-context opt-out + console ring.
 *
 * Node test env has no window/navigator → stub minimal globals before importing
 * the service (buildAutoContext reads window.location / innerWidth / navigator).
 * Dexie counts run against fake-indexeddb (empty db → zeros, which is fine: we
 * assert SHAPE + opt-out behaviour, not magnitudes).
 */

beforeAll(() => {
  // node globals `navigator` is getter-only → use vi.stubGlobal (handles both).
  vi.stubGlobal('window', {
    location: { hash: '#/maze', pathname: '/' },
    innerWidth: 1024,
    innerHeight: 768,
  })
  vi.stubGlobal('navigator', { userAgent: 'vitest-agent', onLine: true })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('console-error ring buffer', () => {
  it('keeps only the newest CONSOLE_ERROR_RING_SIZE entries, newest inclusive', async () => {
    const mod = await import('../lib/services/console-error-buffer')
    mod._resetConsoleErrorBuffer()
    const total = mod.CONSOLE_ERROR_RING_SIZE + 2
    for (let i = 0; i < total; i++) {
      mod._recordConsoleError({ message: `err-${i}`, timestamp: i })
    }
    const recent = mod.getRecentConsoleErrors()
    expect(recent).toHaveLength(mod.CONSOLE_ERROR_RING_SIZE)
    // Newest inclusive, oldest-first.
    expect(recent[recent.length - 1].message).toBe(`err-${total - 1}`)
    expect(recent[0].message).toBe(`err-${total - mod.CONSOLE_ERROR_RING_SIZE}`)
  })

  it('empty buffer returns an empty list', async () => {
    const mod = await import('../lib/services/console-error-buffer')
    mod._resetConsoleErrorBuffer()
    expect(mod.getRecentConsoleErrors()).toEqual([])
  })
})

describe('buildAutoContext opt-out', () => {
  const auth = { authStatus: 'authed', userId: 'user-1' }

  beforeEach(async () => {
    const mod = await import('../lib/services/console-error-buffer')
    mod._resetConsoleErrorBuffer()
  })

  it('includes all auto-context fields by default', async () => {
    const { buildAutoContext } = await import('../lib/services/bug-report')
    const ctx = await buildAutoContext({}, auth)
    expect(ctx.app_version).toBeDefined()
    expect(ctx.route).toBe('#/maze')
    expect(ctx.game_state).toBeDefined()
    expect(ctx.user_agent).toBe('vitest-agent')
    expect(ctx.viewport).toBe('1024×768')
    expect(Array.isArray(ctx.recent_console_errors)).toBe(true)
    expect(ctx.sync_metadata).toBeDefined()
    expect(ctx.sync_metadata?.authStatus).toBe('authed')
    expect(ctx.sync_metadata?.online).toBe(true)
  })

  it('omits opted-out fields', async () => {
    const { buildAutoContext } = await import('../lib/services/bug-report')
    const ctx = await buildAutoContext(
      { game_state: true, user_agent: true, sync_metadata: true },
      auth,
    )
    expect(ctx.game_state).toBeUndefined()
    expect(ctx.user_agent).toBeUndefined()
    expect(ctx.sync_metadata).toBeUndefined()
    // Non-opted-out fields still present.
    expect(ctx.route).toBe('#/maze')
    expect(ctx.viewport).toBe('1024×768')
  })

  it('game_state is PII-free: top-level values are numbers (except the meta sub-object)', async () => {
    const { buildAutoContext } = await import('../lib/services/bug-report')
    const ctx = await buildAutoContext({}, auth)
    const gs = ctx.game_state as Record<string, unknown>
    expect(typeof gs.variantSlots).toBe('number')
    expect(typeof gs.synapseTotal).toBe('number')
    expect(typeof gs.questionsAnswered).toBe('number')
    for (const [k, v] of Object.entries(gs)) {
      if (k === 'meta') {
        expect(typeof v).toBe('object')
        continue
      }
      expect(typeof v, `game_state.${k} should be numeric`).toBe('number')
    }
  })
})
