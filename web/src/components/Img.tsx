import type { CSSProperties, SyntheticEvent } from 'react'
import { cx } from '../lib/cx'
import { useImage } from '../lib/useImage'

interface ImgProps {
  src: string | null | undefined
  alt: string
  /** Size the box with classes (e.g. "aspect-square w-full") or pass `ratio`. */
  className?: string
  imgClassName?: string
  /** width / height, e.g. 4 / 5. Sets the box's aspect ratio. */
  ratio?: number
  fit?: 'cover' | 'contain'
  loading?: 'lazy' | 'eager'
  style?: CSSProperties
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * A picture that never looks broken: it shimmers while loading, fades in when ready, and shows a
 * soft aura-tinted gradient if the file is missing (library pictures are retried as they get drawn).
 */
export function Img({ src, alt, className, imgClassName, ratio, fit = 'cover', loading = 'lazy', style, onLoad }: ImgProps) {
  const image = useImage(src)
  return (
    <div
      className={cx('relative overflow-hidden bg-surface', className)}
      style={ratio ? { aspectRatio: String(ratio), ...style } : style}
    >
      {image.status === 'loading' && <div aria-hidden className="shimmer absolute inset-0" />}
      {image.status === 'error' && <div aria-hidden className="absolute inset-0" style={placeholderStyle(src ?? alt)} />}
      {image.url && (
        <img
          src={image.url}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={(event) => {
            image.onLoad()
            onLoad?.(event)
          }}
          onError={image.onError}
          className={cx(
            'absolute inset-0 size-full transition-opacity duration-300',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            image.status === 'loaded' ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      )}
    </div>
  )
}

const AURA_COLORS = ['--aura-1', '--aura-2', '--aura-3', '--aura-4', '--aura-5']

/** Two soft glows in aura colors, picked from the file name so every missing picture looks a bit different. */
export function placeholderStyle(seed: string): CSSProperties {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const first = AURA_COLORS[hash % 5]
  const second = AURA_COLORS[(hash + 1 + ((hash >> 4) % 3)) % 5]
  return {
    backgroundColor: 'var(--surface)',
    backgroundImage: [
      `radial-gradient(circle at 22% 18%, color-mix(in oklab, var(${first}) 50%, transparent), transparent 62%)`,
      `radial-gradient(circle at 82% 86%, color-mix(in oklab, var(${second}) 45%, transparent), transparent 58%)`,
    ].join(', '),
  }
}
