interface Props {
  onOpen: () => void
}

export function StarterPullCard({ onOpen }: Props) {
  return (
    <article className="starter-pull-card" role="region" aria-label="首抽">
      <header className="starter-pull-card__head">
        <h3 className="starter-pull-card__title">⭐ 首抽機會</h3>
        <span className="starter-pull-card__badge">保底 P4+</span>
      </header>
      <p className="starter-pull-card__copy">
        歡迎來到醫院！選一科開啟你的首抽，保證抽到 P4 或更高級別醫師（不需親密度、不消耗券）。
      </p>
      <button type="button" className="starter-pull-card__button" onClick={onOpen}>
        開始首抽
      </button>
    </article>
  )
}
