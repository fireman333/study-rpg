/**
 * QuizHotkeysAnnouncementBanner — Overview banner promoting the keyboard
 * hotkey feature shipped via wire-neurons-quiz-hotkeys.
 *
 * Per-device dismissal via localStorage (key versioned to `-v1` so future
 * banner copy revisions can bump to `-v2` and re-show).
 *
 * Desktop-only: CSS `@media (hover: hover) and (pointer: fine)` gates display
 * since touch users have no physical keyboard for hotkeys.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Overview SHALL surface a dismissible hotkey announcement banner"
 */

import { useState } from 'react'

// v1 → v2 bump (add-neurons-helpmenu, 2026-05-29): added HelpMenu reference.
// v2 → v3 bump (add-neurons-question-bookmarks, 2026-05-29): added bookmark
// key mention「答題後 1 收藏」.
// v3 → v4 bump (add-neurons-srs-binary-modifiers, 2026-05-29): added
// flag key mentions「答題後 2 ✨ 太簡單 / 3 🤔 我亂猜的」.
const STORAGE_KEY = 'neurons-quiz-hotkeys-banner-dismissed-v4'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // localStorage unavailable — banner re-renders next load, acceptable.
  }
}

export default function QuizHotkeysAnnouncementBanner(): JSX.Element | null {
  const [hidden, setHidden] = useState<boolean>(() => isDismissed())

  if (hidden) return null

  function handleDismiss(): void {
    markDismissed()
    setHidden(true)
  }

  return (
    <>
      {/* Inline <style> — neurons uses inline-style React objects elsewhere
          but @media queries need real CSS. Scoped via the class name so it
          doesn't leak to other components. */}
      <style>{`
        .neurons-quiz-hotkeys-banner { display: none; }
        @media (hover: hover) and (pointer: fine) {
          .neurons-quiz-hotkeys-banner {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            padding: 0.55rem 0.85rem;
            margin-bottom: 0.85rem;
            background: linear-gradient(135deg, #fff5e0 0%, #fdebcc 100%);
            border: 2px solid #d4a04d;
            border-radius: 6px;
            color: #3a2a1a;
            font-size: 0.82rem;
            line-height: 1.55;
          }
          .neurons-quiz-hotkeys-banner__icon {
            font-size: 1.1rem;
            flex-shrink: 0;
          }
          .neurons-quiz-hotkeys-banner__msg {
            flex: 1;
            min-width: 0;
          }
          .neurons-quiz-hotkeys-banner__msg strong {
            color: #5a3f29;
          }
          .neurons-quiz-hotkeys-banner__msg kbd {
            display: inline-block;
            padding: 0.04rem 0.32rem;
            margin: 0 0.1rem;
            background: #fdf6e3;
            border: 1px solid #8c6d4a;
            border-bottom-width: 2px;
            border-radius: 3px;
            font-family: 'VT323', 'Courier New', monospace;
            font-size: 0.92em;
            color: #3a2a1a;
            line-height: 1;
          }
          .neurons-quiz-hotkeys-banner__dismiss {
            flex-shrink: 0;
            padding: 0.2rem 0.5rem;
            background: transparent;
            border: 1px solid #8c6d4a;
            border-radius: 3px;
            color: #5a3f29;
            font-size: 0.85rem;
            cursor: pointer;
            font-family: inherit;
          }
          .neurons-quiz-hotkeys-banner__dismiss:hover {
            background: #fdf6e3;
          }
        }
      `}</style>
      <div
        className="neurons-quiz-hotkeys-banner"
        role="region"
        aria-label="新功能公告：鍵盤快捷鍵"
      >
        <span className="neurons-quiz-hotkeys-banner__icon" aria-hidden="true">
          ⌨️
        </span>
        <span className="neurons-quiz-hotkeys-banner__msg">
          <strong>新功能：答題系統鍵盤快捷鍵</strong> — 題目階段 <kbd>1</kbd>–<kbd>4</kbd> 選答案、
          <kbd>Enter</kbd> 送出；答題後 <kbd>Enter</kbd> 或 <kbd>Space</kbd> 下一題、
          <kbd>1</kbd> ⭐ 收藏、<kbd>2</kbd> ✨ 太簡單、<kbd>3</kbd> 🤔 我亂猜的；
          長題幹 <kbd>Space</kbd>/<kbd>Shift+Space</kbd> 翻頁、<kbd>↓</kbd><kbd>↑</kbd> 微捲、
          <kbd>Home</kbd>/<kbd>End</kbd> 跳邊；<kbd>Esc</kbd> 隨時關閉。
          詳見右上 ❓ →「⌨️ 鍵盤快捷鍵」section。
        </span>
        <button
          type="button"
          className="neurons-quiz-hotkeys-banner__dismiss"
          onClick={handleDismiss}
          aria-label="關閉公告"
        >
          ✕
        </button>
      </div>
    </>
  )
}
