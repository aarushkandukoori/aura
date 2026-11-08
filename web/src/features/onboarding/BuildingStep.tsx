/**
 * "Building your world...": shown while POST /api/onboarding creates everyone, then a short
 * "You're all set" before the app opens. Also shows what went wrong if it failed.
 */
import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Avatar, Button, Img } from '../../components'
import { firstName } from '../../lib/format'
import { usePresets } from './AvatarPicker'

export type BuildPhase = 'working' | 'done' | 'error'

const LINES = ['Finding your people...', 'Filling your feed...', 'Warming up the group chats...', 'Telling everyone you joined...']

const ORBIT_RADIUS = 104
const ORBIT_SECONDS = 16

interface BuildingStepProps {
  phase: BuildPhase
  name: string
  avatar: string | null
  error: string | null
  onRetry: () => void
  onBack: () => void
}

export function BuildingStep({ phase, name, avatar, error, onRetry, onBack }: BuildingStepProps) {
  const presets = usePresets().slice(0, 5)
  const [line, setLine] = useState(0)

  // A new status line every 1.2 s while the world is being built.
  useEffect(() => {
    if (phase !== 'working') return
    const timer = window.setInterval(() => setLine((index) => (index + 1) % LINES.length), 1200)
    return () => window.clearInterval(timer)
  }, [phase])

  if (phase === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="grid size-20 place-items-center rounded-full bg-surface text-4xl">😕</div>
        <h1 className="mt-6 text-2xl font-bold">We hit a snag</h1>
        <p className="mt-2 max-w-[300px] text-[15px] text-muted">{error ?? 'Something went wrong while setting things up.'}</p>
        <div className="mt-7 flex w-full max-w-[280px] flex-col gap-2">
          <Button size="lg" block onClick={onRetry}>
            Try again
          </Button>
          <Button size="lg" variant="ghost" block onClick={onBack}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
      <div className="relative grid size-[260px] place-items-center">
        <motion.div
          aria-hidden
          className="aura-gradient absolute inset-10 rounded-full blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.92, 1.06, 0.92] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Friends circling around you (each picture turns back the other way so it stays upright). */}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: ORBIT_SECONDS, repeat: Infinity, ease: 'linear' }}
        >
          {presets.map((url, index) => {
            const angle = (index / presets.length) * Math.PI * 2
            return (
              <motion.div
                key={url}
                className="absolute left-1/2 top-1/2"
                style={{ x: Math.cos(angle) * ORBIT_RADIUS - 22, y: Math.sin(angle) * ORBIT_RADIUS - 22 }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{
                  opacity: { delay: 0.3 + index * 0.35 },
                  scale: { delay: 0.3 + index * 0.35, type: 'spring', damping: 12 },
                  rotate: { duration: ORBIT_SECONDS, repeat: Infinity, ease: 'linear' },
                }}
              >
                <div className="rounded-full bg-bg p-[3px] shadow-pop">
                  <Img src={url} alt="" className="size-10 rounded-full" />
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        <div className="story-ring relative rounded-full p-1">
          <div className="rounded-full bg-bg p-1">
            <Avatar src={avatar} size={108} />
          </div>
          <AnimatePresence>
            {phase === 'done' && (
              <motion.span
                className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-full bg-success text-white ring-4 ring-bg"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 11, stiffness: 260 }}
              >
                <Check size={20} strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <h1 className="mt-4 text-[26px] font-bold tracking-tight">
        {phase === 'done' ? `You're all set, ${firstName(name)}!` : 'Building your world...'}
      </h1>
      <div className="mt-2 h-6 text-[15px] text-muted">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={phase === 'done' ? 'done' : line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {phase === 'done' ? "Everyone's happy to see you." : LINES[line]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
