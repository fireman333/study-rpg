import { Link } from 'react-router-dom'
import type { PlayerStats, SkillTreeContent, StatSchema } from '@study-rpg/core'
import { SkillTreeBranch } from '../components/SkillTreeBranch'

interface Props {
  content: SkillTreeContent
  statSchema: StatSchema
  stats: PlayerStats
  sprites: Record<string, string>
}

export function SkillTreeRoute({ content, statSchema, stats, sprites }: Props) {
  return (
    <div className="skill-tree-page">
      <header className="skill-tree-header">
        <Link to="/" className="skill-tree-back">← 回家</Link>
        <h2>技能樹</h2>
        <span className="skill-tree-hint">每 100 點解一個節點 · 點亮節點可看心法</span>
      </header>
      <div className="skill-tree-grid">
        {content.branches.map((branch) => (
          <SkillTreeBranch
            key={branch.statKey}
            branch={branch}
            statLabel={statSchema.labels[branch.statKey] ?? branch.statKey}
            statColor={statSchema.colors[branch.statKey] ?? 'var(--accent-gold)'}
            statValue={stats[branch.statKey] ?? 0}
            sprites={sprites}
          />
        ))}
      </div>
    </div>
  )
}
