import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  RARITY_LABELS,
  RARITY_ORDER,
  getRoomHintForSubject,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { lookupSprite } from '../lib/sprite-lookup'
import { formatMasteryPercent } from '../lib/mastery'
import { RenameDoctorModal } from '../components/RenameDoctorModal'

const RARITY_FILTER_OPTIONS: ('all' | Rarity)[] = ['all', ...[...RARITY_ORDER].reverse()]
const RARITY_OPTIONS: Rarity[] = RARITY_FILTER_OPTIONS.filter((r): r is Rarity => r !== 'all')

export function DoctorRoster() {
  const db = getHospitalDB()
  const doctors = useLiveQuery(() => db.doctors.orderBy('obtainedAt').reverse().toArray(), []) ?? []
  const masteryRows = useLiveQuery(() => db.mastery.toArray(), []) ?? []
  const masteryMap = useMemo(() => {
    const m: Record<string, { subjectId: string; correct: number; total: number }> = {}
    for (const r of masteryRows) m[r.subjectId] = r
    return m
  }, [masteryRows])
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [rarityFilterOpen, setRarityFilterOpen] = useState(false)
  const [selectedRarities, setSelectedRarities] = useState<Rarity[]>([])
  const [renaming, setRenaming] = useState<DoctorRow | null>(null)
  const rarityFilterRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!rarityFilterOpen) return

    function handlePointerDown(e: MouseEvent) {
      if (rarityFilterRef.current?.contains(e.target as Node)) return
      setRarityFilterOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [rarityFilterOpen])

  const subjects = useMemo(() => {
    const set = new Set<string>()
    for (const d of doctors) set.add(d.subjectId)
    return ['all', ...Array.from(set)]
  }, [doctors])

  const filtered = doctors.filter((d) => {
    if (subjectFilter !== 'all' && d.subjectId !== subjectFilter) return false
    if (selectedRarities.length > 0 && !selectedRarities.includes(d.rarity)) return false
    return true
  })

  const rarityFilterLabel =
    selectedRarities.length === 0
      ? '全部'
      : selectedRarities.length <= 2
        ? selectedRarities.join('、')
        : `${selectedRarities.length} 種`

  function toggleRarity(rarity: Rarity) {
    setSelectedRarities((prev) =>
      prev.includes(rarity)
        ? prev.filter((r) => r !== rarity)
        : RARITY_OPTIONS.filter((r) => r === rarity || prev.includes(r)),
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>醫師名冊</h1>
        <Link to="/" className="nav-link">
          ← 回主畫面
        </Link>
      </header>

      {doctors.length === 0 ? (
        <section className="empty-state">
          <p>名冊空空的。回主畫面解鎖科別後試試招募。</p>
          <Link to="/" className="empty-state__cta">
            前往招募
          </Link>
        </section>
      ) : (
        <>
          <section className="filter-bar">
            <label>
              科別
              <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? '全部' : s}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-bar__field" ref={rarityFilterRef}>
              <span className="filter-bar__label">稀有度</span>
              <button
                type="button"
                className="filter-bar__multi-trigger"
                aria-haspopup="menu"
                aria-expanded={rarityFilterOpen}
                onClick={() => setRarityFilterOpen((v) => !v)}
              >
                <span>{rarityFilterLabel}</span>
                <span className="filter-bar__chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {rarityFilterOpen && (
                <div className="filter-bar__multi-menu frame" role="menu">
                  <label className="filter-bar__multi-option">
                    <input
                      type="checkbox"
                      checked={selectedRarities.length === 0}
                      onChange={() => setSelectedRarities([])}
                    />
                    <span>全部</span>
                  </label>
                  {RARITY_OPTIONS.map((r) => (
                    <label key={r} className="filter-bar__multi-option">
                      <input
                        type="checkbox"
                        checked={selectedRarities.includes(r)}
                        onChange={() => toggleRarity(r)}
                      />
                      <span>{r} {RARITY_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span className="filter-bar__count">
              {filtered.length} / {doctors.length}
            </span>
          </section>

          <section className="roster-grid">
            {filtered.map((d) => (
              <article
                key={d.id}
                className="doctor-card"
                style={{ ['--rarity-color' as string]: `var(--rarity-${d.rarity.toLowerCase()})` }}
              >
                <header className="doctor-card__head">
                  <span className="doctor-card__rarity">{d.rarity}</span>
                  <span className="doctor-card__rarity-label">{RARITY_LABELS[d.rarity]}</span>
                </header>
                <div className="doctor-card__sprite">
                  {(() => {
                    const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
                    return spriteUrl ? (
                      <img src={spriteUrl} alt="" className="doctor-card__sprite-img" />
                    ) : (
                      <span aria-hidden>🩺</span>
                    )
                  })()}
                </div>
                <h3 className="doctor-card__name">
                  <span className="doctor-card__name-text">{d.name}</span>
                  <button
                    type="button"
                    className="doctor-card__rename"
                    aria-label={`為 ${d.name} 改名`}
                    onClick={() => setRenaming(d)}
                  >
                    ✏️
                  </button>
                </h3>
                <dl className="doctor-card__meta">
                  <div>
                    <dt>科別</dt>
                    <dd>{d.subjectId}</dd>
                  </div>
                  <div>
                    <dt>×力</dt>
                    <dd>{d.powerMultiplier.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>適合</dt>
                    <dd>{getRoomHintForSubject(d.subjectId)}</dd>
                  </div>
                  <div>
                    <dt>{d.subjectId}</dt>
                    <dd>{formatMasteryPercent(masteryMap[d.subjectId])}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        </>
      )}

      {renaming && (
        <RenameDoctorModal doctor={renaming} onClose={() => setRenaming(null)} />
      )}
    </main>
  )
}
