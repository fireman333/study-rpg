import { describe, it, expect } from 'vitest'
import {
  onMazeFocus,
  emitMazeFocus,
  onMazeRecenter,
  emitMazeRecenter,
} from '../lib/maze/maze-focus'

/**
 * Bus contract for the maze focus/recenter signals (add-neurons-maze-zoom-and-focus).
 * The sticky-vs-auto precedence + recenter-clears-sticky behavior lives in the
 * MazeGrid renderer (verified via the Chrome MCP smoke); here we lock the pure bus.
 */
describe('maze-focus bus', () => {
  it('emitMazeFocus delivers manual=false by default and manual=true when opted', () => {
    const calls: Array<{ id: string; manual: boolean }> = []
    const off = onMazeFocus((id, manual) => calls.push({ id, manual }))
    emitMazeFocus('藥理學')
    emitMazeFocus('生理學', { manual: true })
    off()
    emitMazeFocus('解剖學') // after unsubscribe — not recorded
    expect(calls).toEqual([
      { id: '藥理學', manual: false },
      { id: '生理學', manual: true },
    ])
  })

  it('emitMazeRecenter notifies recenter listeners; unsubscribe stops delivery', () => {
    let n = 0
    const off = onMazeRecenter(() => {
      n += 1
    })
    emitMazeRecenter()
    emitMazeRecenter()
    off()
    emitMazeRecenter()
    expect(n).toBe(2)
  })

  it('a thrown focus listener does not break the other listeners', () => {
    const seen: string[] = []
    const offBad = onMazeFocus(() => {
      throw new Error('boom')
    })
    const offGood = onMazeFocus((id) => seen.push(id))
    emitMazeFocus('藥理學')
    offBad()
    offGood()
    expect(seen).toEqual(['藥理學'])
  })
})
