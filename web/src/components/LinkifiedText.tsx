import { Fragment } from 'react'
import { Link } from 'react-router'
import { cx } from '../lib/cx'
import { linkify } from '../lib/format'

/**
 * Caption / comment / bio text with @mentions linked to profiles and #tags linked to tag pages.
 * Add `whitespace-pre-line` in className to keep line breaks.
 */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cx('break-words', className)}>
      {linkify(text).map((part, index) => {
        if (part.kind === 'text') return <Fragment key={index}>{part.text}</Fragment>
        const to = part.kind === 'mention' ? `/${part.username}` : `/explore/tags/${encodeURIComponent(part.tag)}`
        return (
          <Link key={index} to={to} onClick={(event) => event.stopPropagation()} className="text-link hover:underline">
            {part.text}
          </Link>
        )
      })}
    </span>
  )
}
