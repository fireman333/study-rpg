import type { SkillNode } from '@study-rpg/core'

interface Props {
  node: SkillNode
  unlocked: boolean
  expanded: boolean
  spriteUrl: string | undefined
  threshold: number
  onToggle: () => void
}

export function SkillTreeNode({ node, unlocked, expanded, spriteUrl, threshold, onToggle }: Props) {
  const className = `skill-node ${unlocked ? 'unlocked' : 'locked'}${expanded ? ' expanded' : ''}`
  return (
    <div className="skill-node-wrap">
      <button
        type="button"
        className={className}
        onClick={onToggle}
        disabled={!unlocked}
        aria-label={unlocked ? `${node.name} (unlocked)` : `locked, requires ${threshold}`}
        title={unlocked ? node.name : `需要 ${threshold} 點解鎖`}
      >
        <div className="skill-node-art">
          {spriteUrl ? (
            <img src={spriteUrl} alt="" />
          ) : (
            <span className="skill-node-placeholder" aria-hidden="true">
              {unlocked ? '★' : '🔒'}
            </span>
          )}
        </div>
        {unlocked ? (
          <span className="skill-node-name">{node.name}</span>
        ) : (
          <span className="skill-node-threshold">{threshold}</span>
        )}
      </button>
      {expanded && unlocked && (
        <div className="skill-node-flavor" role="tooltip">
          <strong>{node.name}</strong>
          <p>{node.flavor}</p>
        </div>
      )}
    </div>
  )
}
