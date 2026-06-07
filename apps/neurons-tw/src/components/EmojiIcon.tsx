import type { CSSProperties } from 'react'
import { emojiIconUrl } from '../lib/emoji-icons'

type Props = {
  char: string
  size?: number
  className?: string
  title?: string
  /** Decorative icon sitting next to a text label that already names it — hide
   *  from the accessibility tree so screen readers don't double-read the glyph. */
  decorative?: boolean
}

// `draggable={false}` + the user-drag/select rules suppress native HTML5 image
// drag so motion-library swipe/drag handlers aren't stolen by the browser's
// drag-image pointer capture. Safe globally — emojis are decorative icons.
const IMG_STYLE: CSSProperties = {
  imageRendering: 'pixelated',
  verticalAlign: 'middle',
  WebkitUserDrag: 'none',
  userSelect: 'none',
} as CSSProperties

export function EmojiIcon({ char, size = 20, className, title, decorative }: Props) {
  const src = emojiIconUrl(char)
  if (!src) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1 }}
        title={title}
        aria-hidden={decorative || undefined}
      >
        {char}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={decorative ? '' : title ?? char}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      className={className}
      draggable={false}
      style={IMG_STYLE}
      title={title}
    />
  )
}
