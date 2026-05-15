import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  RARITY_LABELS,
  RARITY_ORDER,
  getRoomHintForSubject,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB } from '../db/schema'
import { lookupSprite } from '../lib/sprite-lookup'
import { formatMasteryPercent } from '../lib/mastery'

const RARITY_FILTER_OPTIONS: ('all' | Rarity)[] = ['all', ...[...RARITY_ORDER].reverse()]

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
  const [rarityFilter, setRarityFilter] = useState<'all' | Rarity>('all')

  const subjects = useMemo(() => {
    const set = new Set<string>()
    for (const d of doctors) set.add(d.subjectId)
    return ['all', ...Array.from(set)]
  }, [doctors])

  const filtered = doctors.filter((d) => {
    if (subjectFilter !== 'all' && d.subjectId !== subjectFilter) return false
    if (rarityFilter !== 'all' && d.rarity !== rarityFilter) return false
    return true
  })

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
            <label>
              稀有度
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as 'all' | Rarity)}
              >
                {RARITY_FILTER_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r === 'all' ? '全部' : `${r} ${RARITY_LABELS[r]}`}
                  </option>
                ))}
              </select>
            </label>
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
                <h3 className="doctor-card__name">{d.name}</h3>
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
    </main>
  )
}
