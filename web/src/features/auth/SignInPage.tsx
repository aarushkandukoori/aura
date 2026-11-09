/**
 * The sign-in page (/signin), shown whenever the server has sign-in on and nobody is signed in.
 * The glowing ring with friendly faces slowly circling it, the wordmark, and one button:
 * Continue with Google. Each Google account gets its own world.
 */
import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Img, LogoMark, Wordmark } from '../../components'
import { api } from '../../lib/api'
import { GoogleButton } from './GoogleButton'

/** What went wrong, by the error code the server puts in /signin?error=... */
const ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Try again whenever you’re ready.',
  expired: 'That sign-in took too long. Please try again.',
  google: 'Google sign-in didn’t work just now. Please try again.',
  unverified: 'That Google account doesn’t have a verified email address.',
  setup: 'Google sign-in isn’t set up on this server yet.',
}

/** Little reactions that pop in around (never over) the ring: text, center point (percent of the hero box), delay. */
const PILLS = [
  { text: '❤️ 2,481', x: 78, y: 12, delay: 0.9 },
  { text: '✨ 38 new followers', x: 74, y: 72, delay: 1.25 },
  { text: '“obsessed with this” 😭', x: 30, y: 90, delay: 1.6 },
]

export function SignInPage() {
  const [params] = useSearchParams()
  const error = params.get('error')
  const next = params.get('next') ?? '/'

  return (
    <main className="flex min-h-dvh flex-col items-center overflow-hidden bg-bg px-6 pt-safe pb-safe">
      <div className="flex w-full max-w-[380px] flex-1 flex-col items-center justify-center py-10 text-center">
        <Hero />
        <Wordmark className="mt-1 text-[54px]" />
        <h1 className="mt-4 text-balance text-[26px] font-bold leading-tight tracking-tight">Everyone’s happy to see you.</h1>
        <p className="mt-2 max-w-[300px] text-[15px] text-muted">Sign in to step into your world. Your people are already here.</p>

        {error && (
          <p role="alert" className="mt-6 w-full rounded-2xl bg-surface px-4 py-3 text-[14px] text-fg">
            {ERRORS[error] ?? 'Something went wrong signing in. Please try again.'}
          </p>
        )}
        <div className="mt-8 w-full">
          <GoogleButton next={next} />
        </div>
      </div>
      <p className="pb-6 text-center text-[12px] text-muted">Each Google account gets its own private world.</p>
    </main>
  )
}

/** The glowing ring in the middle with preset faces orbiting it, and reactions popping in. */
function Hero() {
  const faces = usePresetFaces()
  return (
    <div className="relative h-[280px] w-full max-w-[320px]">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div aria-hidden className="aura-gradient absolute inset-1 rounded-full opacity-50 blur-2xl" />
        <motion.div
          className="relative"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <LogoMark size={104} />
        </motion.div>
      </div>

      {/* The whole ring of faces turns slowly; each face turns back so it stays upright. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
      >
        {faces.slice(0, 6).map((src, index, all) => {
          const angle = (index / all.length) * Math.PI * 2 - Math.PI / 2
          const size = index % 2 === 0 ? 54 : 44
          return (
            <div
              key={src}
              className="absolute"
              style={{ left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%`, transform: 'translate(-50%, -50%)' }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{
                  opacity: { delay: 0.1 + index * 0.12, duration: 0.3 },
                  scale: { delay: 0.1 + index * 0.12, type: 'spring', damping: 14, stiffness: 180 },
                  rotate: { duration: 90, repeat: Infinity, ease: 'linear' },
                }}
                className="rounded-full bg-bg p-[3px] shadow-pop"
              >
                <Img src={src} alt="" className="rounded-full" style={{ width: size, height: size }} />
              </motion.div>
            </div>
          )
        })}
      </motion.div>

      {PILLS.map((pill) => (
        <Pop key={pill.text} x={pill.x} y={pill.y} delay={pill.delay}>
          <span className="whitespace-nowrap rounded-full border border-line bg-elevated px-3 py-1.5 text-[13px] font-semibold shadow-pop">
            {pill.text}
          </span>
        </Pop>
      ))}
    </div>
  )
}

/** Pops in after `delay` at a spot in the hero, then floats gently. */
function Pop({ x, y, delay, children }: { x: number; y: number; delay: number; children: ReactNode }) {
  return (
    <motion.div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, x: '-50%', y: '-50%' }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 15, stiffness: 200 }}
    >
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay }}>
        {children}
      </motion.div>
    </motion.div>
  )
}

/** The preset profile pictures from GET /api/avatars (it works signed out). */
function usePresetFaces(): string[] {
  const [faces, setFaces] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    api.avatars()
      .then((urls) => {
        if (!cancelled) setFaces(urls)
      })
      .catch(() => {}) // the ring and the button are enough on their own
    return () => {
      cancelled = true
    }
  }, [])
  return faces
}
