/**
 * useLocalPdfAvailable — is the local-PDF provenance action available for this question?
 * (= platform supports local PDFs AND the question is mapped). Drives BOTH whether
 * LocalPdfButton renders AND whether the inline 詳解 defaults collapsed at each render site
 * (rework-neurons-pdf-viewer-docked-panel #5). The provenance map is cached, so calling this
 * from both the button and the question card is cheap.
 */
import { useEffect, useState } from 'react'
import { hasProvenance, isLocalPdfSupported } from '../platform'

export function useLocalPdfAvailable(questionId: string): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!isLocalPdfSupported()) {
      setAvailable(false)
      return
    }
    let alive = true
    hasProvenance(questionId).then((ok) => {
      if (alive) setAvailable(ok)
    })
    return () => {
      alive = false
    }
  }, [questionId])
  return available
}
