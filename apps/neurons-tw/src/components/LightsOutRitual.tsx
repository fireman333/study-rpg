/**
 * LightsOutRitual — 熄燈儀式 (the "close" half of the daily one-open-one-close
 * ritual). A low-stimulus closure overlay the player can trigger at ANY time of
 * day to give themselves permission to be done.
 *
 * Anti-anxiety contract (neurons-lights-out spec):
 *   - Qualitative only: shows which neuron families were touched today as soft
 *     glowing name chips — NEVER 題數 / 分鐘 / accuracy / score / countdown /
 *     pass-fail.
 *   - A calming sleep-consolidation reframe line (evidence-anchored, phrased as a
 *     general mechanism — NOT a guaranteed personal outcome). design.md anchors:
 *     Brodt 2023 Neuron; Takehara-Nishiuchi 2021 Eur J Neurosci.
 *   - Zero-activity day → honest「休息也是機制的一部分」framing, no deficit.
 *   - Degrades under prefers-reduced-motion to a static night end-state.
 *
 * Presentation only — the touched-family list is derived + passed in; this
 * component never reads metrics.
 *
 * Spec: openspec/specs/neurons-lights-out/spec.md
 */

import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import { EmojiIcon } from './EmojiIcon'

interface Props {
  /** Qualitative display labels of families the player touched today. */
  touchedFamilyLabels: readonly string[]
  /** Dismiss the overlay (the lights-out state itself persists for the day). */
  onClose: () => void
}

export function LightsOutRitual({ touchedFamilyLabels, onClose }: Props): JSX.Element {
  const prefersReduced = useRespectsReducedMotion()
  const hadActivity = touchedFamilyLabels.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="今天到此為止"
      style={backdropStyle}
      onClick={onClose}
    >
      <div
        style={{
          ...panelStyle,
          animation: prefersReduced ? 'none' : 'lightsOutFade 0.6s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={moonStyle} aria-hidden><EmojiIcon char="🌙" size={40} decorative /></div>
        <h2 style={titleStyle}>今天到此為止</h2>

        {hadActivity ? (
          <>
            <p style={leadStyle}>今天你點亮過這些神經元家族：</p>
            <div style={glowWrapStyle}>
              {touchedFamilyLabels.map((label, i) => (
                <span
                  key={label}
                  style={{
                    ...glowChipStyle,
                    animation: prefersReduced
                      ? 'none'
                      : `lightsOutGlow 1.6s ease ${i * 0.12}s both`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p style={leadStyle}>今天休息，休息也是機制的一部分。</p>
        )}

        <p style={consolidationStyle}>接下來交給睡眠——記憶固化多在這時發生</p>

        <button type="button" style={closeBtnStyle} onClick={onClose}>
          晚安
        </button>
      </div>

      {/* Keyframes are scoped inline so the ritual is self-contained; both are
          skipped under prefers-reduced-motion (animation:none above). */}
      <style>{`
        @keyframes lightsOutFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lightsOutGlow {
          0% { opacity: 0.35; box-shadow: 0 0 0 rgba(120, 160, 220, 0); }
          40% { opacity: 1; box-shadow: 0 0 14px rgba(120, 160, 220, 0.7); }
          100% { opacity: 0.85; box-shadow: 0 0 6px rgba(120, 160, 220, 0.3); }
        }
      `}</style>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  // Warm night scene (deep indigo, not black — non-punishing).
  background: 'radial-gradient(circle at 50% 30%, #2a2a52 0%, #171730 70%, #10101f 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  padding: '1rem',
}

const panelStyle: React.CSSProperties = {
  width: 'min(400px, 92vw)',
  maxHeight: '86vh',
  overflowY: 'auto',
  padding: '1.6rem 1.4rem',
  borderRadius: '12px',
  background: 'rgba(30, 30, 58, 0.85)',
  border: '1px solid rgba(150, 160, 210, 0.35)',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.7rem',
  textAlign: 'center',
  color: '#e6e8f5',
}

const moonStyle: React.CSSProperties = {
  fontSize: '2.4rem',
  lineHeight: 1,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.2rem',
  fontWeight: 700,
  color: '#f0f1fb',
}

const leadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  color: '#c7cbe6',
  lineHeight: 1.6,
}

const glowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '0.4rem',
}

const glowChipStyle: React.CSSProperties = {
  padding: '0.28rem 0.7rem',
  borderRadius: '999px',
  background: 'rgba(90, 110, 180, 0.28)',
  border: '1px solid rgba(150, 170, 230, 0.4)',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#dfe4f7',
}

const consolidationStyle: React.CSSProperties = {
  margin: '0.3rem 0 0',
  fontSize: '0.84rem',
  fontStyle: 'italic',
  color: '#a9b0d6',
  lineHeight: 1.6,
}

const closeBtnStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.55rem 1.6rem',
  borderRadius: '999px',
  border: '1px solid rgba(160, 170, 220, 0.5)',
  background: 'rgba(70, 80, 140, 0.5)',
  color: '#eef0fb',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
}
