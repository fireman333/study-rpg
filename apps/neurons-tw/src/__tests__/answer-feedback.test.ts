import { describe, it, expect } from 'vitest'
import {
  onAnswerCorrect,
  emitAnswerCorrect,
  onAnswerWrong,
  emitAnswerWrong,
} from '../lib/maze/answer-feedback'

/**
 * Bus contract for the answer-feedback signals (polish-neurons-juice-animations).
 * The visual reactions (companion pulse on correct / band synapse-decay dim on
 * wrong) live in the MazeExpedition renderer (verified via Chrome MCP smoke);
 * here we lock the pure bus: per-channel delivery, unsubscribe, throw isolation.
 */
describe('answer-feedback bus', () => {
  it('delivers correct + wrong on separate channels; unsubscribe stops delivery', () => {
    const correct: string[] = []
    const wrong: string[] = []
    const offC = onAnswerCorrect((id) => correct.push(id))
    const offW = onAnswerWrong((id) => wrong.push(id))

    emitAnswerCorrect('藥理學')
    emitAnswerWrong('解剖學')
    emitAnswerCorrect('生理學')

    offC()
    offW()
    emitAnswerCorrect('生化學') // after unsubscribe — not recorded
    emitAnswerWrong('微生物學') // after unsubscribe — not recorded

    expect(correct).toEqual(['藥理學', '生理學'])
    expect(wrong).toEqual(['解剖學'])
  })

  it('a correct listener never receives wrong signals and vice versa', () => {
    const correct: string[] = []
    const wrong: string[] = []
    const offC = onAnswerCorrect((id) => correct.push(id))
    const offW = onAnswerWrong((id) => wrong.push(id))
    emitAnswerWrong('病理學')
    emitAnswerCorrect('胚胎學')
    offC()
    offW()
    expect(correct).toEqual(['胚胎學'])
    expect(wrong).toEqual(['病理學'])
  })

  it('a thrown listener does not break the other listeners', () => {
    const seen: string[] = []
    const offBad = onAnswerCorrect(() => {
      throw new Error('boom')
    })
    const offGood = onAnswerCorrect((id) => seen.push(id))
    emitAnswerCorrect('藥理學')
    offBad()
    offGood()
    expect(seen).toEqual(['藥理學'])
  })
})
