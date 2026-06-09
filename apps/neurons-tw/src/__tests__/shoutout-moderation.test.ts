/**
 * Shoutout moderation / validation pure-function tests (core contract).
 *
 * Covers the client-side mirror in @study-rpg/core. The Worker
 * (cloudflare/sync-worker/src/shoutout.ts) holds the authoritative copy with the
 * same logic; these tests lock the shared semantics.
 *
 * Spec: openspec/changes/add-neurons-shoutout-board/specs/{shoutout-board-backend,core-npm-package}
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeShoutoutText,
  graphemeLen,
  isBlockedText,
  hasPII,
  isValidAvatar,
  validateShoutoutMessage,
  shoutoutContentHash,
  MESSAGE_MAX_GRAPHEMES,
} from '@study-rpg/core'

describe('normalizeShoutoutText', () => {
  it('NFKC-folds full-width to half-width', () => {
    expect(normalizeShoutoutText('ＦＵＣＫ')).toBe('fuck')
  })
  it('strips zero-width characters (obfuscation defeat)', () => {
    expect(normalizeShoutoutText('fu​ck')).toBe('fuck')
  })
  it('collapses whitespace and trims', () => {
    expect(normalizeShoutoutText('  hello   world  ')).toBe('hello world')
  })
})

describe('graphemeLen', () => {
  it('counts CJK by character', () => {
    expect(graphemeLen('一階加油')).toBe(4)
  })
  it('counts emoji as one grapheme where supported', () => {
    // Either 1 (Intl.Segmenter) or codepoint fallback — both ≤ 2; just assert bounded.
    expect(graphemeLen('👍')).toBeLessThanOrEqual(2)
  })
})

describe('isBlockedText', () => {
  it('catches a seed term', () => {
    expect(isBlockedText(normalizeShoutoutText('你這個智障'))).toBe(true)
  })
  it('catches obfuscation via zero-width after normalize', () => {
    expect(isBlockedText(normalizeShoutoutText('智​障'))).toBe(true)
  })
  it('passes clean text', () => {
    expect(isBlockedText(normalizeShoutoutText('一階加油一起上岸'))).toBe(false)
  })
})

describe('hasPII', () => {
  it('detects TW mobile', () => {
    expect(hasPII(normalizeShoutoutText('找我 0912345678'))).toBe(true)
  })
  it('detects email', () => {
    expect(hasPII(normalizeShoutoutText('mail me a@b.com'))).toBe(true)
  })
  it('detects TW national id', () => {
    expect(hasPII(normalizeShoutoutText('A123456789'))).toBe(true)
  })
  it('passes clean text', () => {
    expect(hasPII(normalizeShoutoutText('加油 2026 上岸'))).toBe(false)
  })
})

describe('validateShoutoutMessage', () => {
  it('accepts a normal message', () => {
    expect(validateShoutoutMessage('一階加油，一起上岸！').ok).toBe(true)
  })
  it('rejects empty', () => {
    expect(validateShoutoutMessage('   ')).toEqual({ ok: false, reason: 'empty' })
  })
  it('rejects > 40 graphemes', () => {
    const long = '字'.repeat(MESSAGE_MAX_GRAPHEMES + 1)
    expect(validateShoutoutMessage(long)).toEqual({ ok: false, reason: 'too_long' })
  })
  it('rejects > 2 lines', () => {
    expect(validateShoutoutMessage('a\nb\nc')).toEqual({ ok: false, reason: 'too_many_lines' })
  })
  it('rejects blocklist content', () => {
    expect(validateShoutoutMessage('你白痴').reason).toBe('blocked')
  })
  it('rejects PII', () => {
    expect(validateShoutoutMessage('打給我 0912345678').reason).toBe('pii')
  })
})

describe('isValidAvatar', () => {
  it('accepts a structured neuron avatar', () => {
    expect(isValidAvatar({ avatarType: 'neuron', assetId: 'dopamine' })).toBe(true)
  })
  it('rejects a URL in assetId (injection guard)', () => {
    expect(isValidAvatar({ avatarType: 'neuron', assetId: 'http://evil/x.svg' })).toBe(false)
  })
  it('rejects HTML in assetId', () => {
    expect(isValidAvatar({ avatarType: 'neuron', assetId: '<img src=x>' })).toBe(false)
  })
  it('rejects a non-object / missing fields', () => {
    expect(isValidAvatar(null)).toBe(false)
    expect(isValidAvatar({ avatarType: 'neuron' })).toBe(false)
  })
})

describe('shoutoutContentHash', () => {
  const avatar = { avatarType: 'neuron', assetId: 'dopamine' }
  it('is stable for identical content (no-op-edit detection)', () => {
    expect(shoutoutContentHash(avatar, 'hi')).toBe(shoutoutContentHash(avatar, 'hi'))
  })
  it('changes when the message changes', () => {
    expect(shoutoutContentHash(avatar, 'hi')).not.toBe(shoutoutContentHash(avatar, 'hello'))
  })
  it('changes when the avatar changes', () => {
    expect(shoutoutContentHash(avatar, 'hi')).not.toBe(
      shoutoutContentHash({ avatarType: 'neuron', assetId: 'serotonin' }, 'hi'),
    )
  })
})
