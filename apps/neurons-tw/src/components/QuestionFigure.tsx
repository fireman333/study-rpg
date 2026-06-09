import { useState, type CSSProperties } from 'react'
import type { Question } from '@study-rpg/core'

/**
 * Renders a question's figure: the image (BASE_URL-prefixed path) with an
 * onError fallback, or a "[圖]" placeholder when the question is flagged as
 * having an image but no usable path. Returns null when there's no image.
 *
 * Extracted from QuizModal so PrecedingContext can reuse identical image
 * handling for preceding (承上題) questions.
 */
export function QuestionFigure({ q }: { q: Question }) {
  const [error, setError] = useState(false)
  if (q.imagePath && !error) {
    return (
      <div style={figureWrapStyle}>
        <img
          src={`${import.meta.env.BASE_URL}${q.imagePath}`}
          alt="題目附圖"
          style={figureImgStyle}
          onError={() => setError(true)}
        />
      </div>
    )
  }
  if (q.hasImage) {
    return <div style={figurePlaceholderStyle}>[圖] 此題原有附圖，暫無法顯示</div>
  }
  return null
}

const figureWrapStyle: CSSProperties = {
  margin: '0 0 1.25rem',
  display: 'flex',
  justifyContent: 'center',
}

const figureImgStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '340px',
  objectFit: 'contain',
  border: '1px solid #d8c8a8',
  borderRadius: '6px',
  background: '#fff',
}

const figurePlaceholderStyle: CSSProperties = {
  margin: '0 0 1.25rem',
  padding: '0.9rem',
  border: '1px dashed #c9b890',
  borderRadius: '6px',
  color: '#8a7a5a',
  fontSize: '0.9rem',
  textAlign: 'center',
  background: '#faf6ec',
}
