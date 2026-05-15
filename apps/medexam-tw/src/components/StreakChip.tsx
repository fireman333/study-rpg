interface Props {
  currentStreak: number
  longestStreak: number
}

/**
 * Small fire-chip showing the player's current daily streak. Shows a
 * "從今天開始" prompt when no streak is active so the chip never disappears
 * entirely.
 */
export function StreakChip({ currentStreak, longestStreak }: Props) {
  const active = currentStreak > 0
  return (
    <div
      className="streak-chip"
      title={
        active
          ? `當前連續 ${currentStreak} 天 · 歷史最佳 ${longestStreak} 天`
          : `每日累積 5 分鐘閱讀或 5 題答題即開始新一輪 · 歷史最佳 ${longestStreak} 天`
      }
    >
      <span className="streak-chip-icon" aria-hidden="true">🔥</span>
      <span className="streak-chip-label">
        {active ? `連續 ${currentStreak} 天` : '從今天開始'}
      </span>
    </div>
  )
}
