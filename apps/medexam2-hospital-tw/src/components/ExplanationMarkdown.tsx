import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'

interface ExplanationMarkdownProps {
  text: string
  className?: string
}

const ALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'code',
  'br',
  'a',
]

const COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
}

export function ExplanationMarkdown({ text, className }: ExplanationMarkdownProps) {
  const wrapperClass = `explanation-markdown${className ? ` ${className}` : ''}`

  if (!text || !text.trim()) {
    return (
      <div className={wrapperClass}>
        <p>（解析待補）</p>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
