import { useState } from 'react'
import { thresholdForIndex, unlockedCount, type SkillBranch } from '@study-rpg/core'
import { SkillTreeNode } from './SkillTreeNode'

interface Props {
  branch: SkillBranch
  statLabel: string
  statColor: string
  statValue: number
  sprites: Record<string, string>
}

export function SkillTreeBranch({ branch, statLabel, statColor, statValue, sprites }: Props) {
  const unlocked = unlockedCount(statValue, branch)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  return (
    <div className="skill-branch" style={{ '--branch-accent': statColor } as React.CSSProperties}>
      <div className="skill-branch-header">
        <span className="skill-branch-stat">{statLabel}</span>
        <span className="skill-branch-value">{statValue}</span>
      </div>
      <div className="skill-branch-track">
        {branch.nodes.map((node, i) => (
          <SkillTreeNode
            key={i}
            node={node}
            unlocked={i < unlocked}
            expanded={expandedIdx === i}
            spriteUrl={sprites[node.spriteKey]}
            threshold={thresholdForIndex(i)}
            onToggle={() => setExpandedIdx((prev) => (prev === i ? null : i))}
          />
        ))}
      </div>
    </div>
  )
}
