// add-neurons-rescue-anon-authed-claim — the anonymous→authed cloud-wins gate lifecycle.
// Locks the hook-orchestration logic Codex flagged as untested, including the residual
// (errored startup → landed push to empty cloud → later applied pull must NOT misfire).
import { describe, it, expect } from 'vitest'
import { createAdoptionCloudWins } from '../lib/sync/adoption-cloud-wins'

describe('createAdoptionCloudWins — anonymous→authed cloud-wins lifecycle', () => {
  it('inactive (non-adoption sign-in): never protects', () => {
    const g = createAdoptionCloudWins(false)
    expect(g.isPending()).toBe(false)
    expect(g.consumeForPull()).toBe(false)
  })

  it('active: consumeForPull protects exactly once, then reverts to normal LWW', () => {
    const g = createAdoptionCloudWins(true)
    expect(g.isPending()).toBe(true)
    expect(g.consumeForPull()).toBe(true) // first pull → cloud-wins
    expect(g.consumeForPull()).toBe(false) // later pulls → normal LWW
    expect(g.isPending()).toBe(false)
  })

  it('startup settled with a definitive cloud read clears protection (blobMissing/applied/notModified) → no leak', () => {
    const g = createAdoptionCloudWins(true)
    g.onStartupSettled(true)
    expect(g.isPending()).toBe(false)
    expect(g.consumeForPull()).toBe(false) // Finding 1: no leak to a later pull for a new account
  })

  it('startup settled with an ERROR keeps protection for a later pull', () => {
    const g = createAdoptionCloudWins(true)
    g.onStartupSettled(false)
    expect(g.isPending()).toBe(true)
    expect(g.consumeForPull()).toBe(true) // a later recovery/visibility pull still protects an existing cloud plan
  })

  it('errored startup + landed push (empty cloud): protection cleared → later applied pull does NOT misfire (Codex residual)', () => {
    const g = createAdoptionCloudWins(true)
    g.onStartupSettled(false) // startup pull errored → protection kept
    expect(g.isPending()).toBe(true)
    g.onPushLanded() // first push lands with If-None-Match:* → cloud was empty, nothing to protect
    expect(g.isPending()).toBe(false)
    expect(g.consumeForPull()).toBe(false) // later applied pull → normal LWW, no cloud-wins
  })

  it('onPushLanded on an inactive gate stays inactive', () => {
    const g = createAdoptionCloudWins(false)
    g.onPushLanded()
    expect(g.isPending()).toBe(false)
  })
})
