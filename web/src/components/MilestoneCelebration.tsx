import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { useEscapeKey, useMediaQuery } from '../lib/hooks'
import { useStore } from '../lib/store'
import { LogoMark } from './Wordmark'

const CONFETTI_COLORS = ['#9B7BFF', '#FF7EC7', '#FFC36B', '#5CE1B5', '#5BB8FF']

/** Confetti and a card for big moments ("You just hit 50K followers"). Mounted once in App. */
export function MilestoneCelebration() {
  const milestone = useStore((s) => s.milestone)
  const dismiss = useStore((s) => s.dismissMilestone)
  useEscapeKey(dismiss, Boolean(milestone))

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          key="milestone"
          className="fixed inset-0 z-[95] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div aria-hidden className="absolute inset-0 bg-[var(--backdrop)]" onClick={dismiss} />
          <Confetti />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={milestone.title}
            className="relative w-full max-w-[360px] rounded-3xl bg-elevated px-7 pb-7 pt-9 text-center text-fg shadow-pop"
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 260 }}
          >
            <motion.div
              className="mx-auto mb-4 w-fit"
              animate={{ scale: [1, 1.12, 1], rotate: [0, 8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <LogoMark size={84} />
            </motion.div>
            <h2 className="aura-text text-2xl font-bold leading-tight">{milestone.title}</h2>
            <p className="mt-2 text-[15px] text-muted">{milestone.body}</p>
            <button
              type="button"
              onClick={dismiss}
              className="aura-gradient mt-6 h-11 w-full rounded-xl text-[15px] font-semibold text-white shadow-pop transition hover:brightness-105 active:brightness-95"
            >
              Keep glowing ✨
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Paper pieces in aura colors falling across the screen (skipped when reduced motion is on). */
function Confetti() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 160,
        spin: (Math.random() - 0.5) * 900,
        width: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  )
  if (reduceMotion) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute -top-4 block rounded-[2px]"
          style={{ left: `${piece.left}%`, width: piece.width, height: piece.width * 0.45, background: piece.color }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: piece.drift, rotate: piece.spin, opacity: [1, 1, 0.8] }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
