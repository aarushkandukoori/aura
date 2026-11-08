/**
 * The first screen: the glowing logo with friendly pictures and reactions floating around it.
 */
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Img, LogoMark, Wordmark } from '../../components'
import { usePresets } from './AvatarPicker'

/** Floating pictures: center point (percent of the hero box), diameter in px, when they pop in. */
const BUBBLES = [
  { x: 15, y: 20, size: 56, delay: 0.1 },
  { x: 83, y: 15, size: 48, delay: 0.25 },
  { x: 88, y: 64, size: 58, delay: 0.4 },
  { x: 11, y: 72, size: 46, delay: 0.55 },
  { x: 63, y: 90, size: 42, delay: 0.7 },
  { x: 41, y: 7, size: 36, delay: 0.85 },
]

/** Little reaction pills, placed the same way. */
const PILLS = [
  { text: '❤️ 1,204', x: 76, y: 39, delay: 1.0 },
  { text: 'obsessed with this 😭', x: 25, y: 47, delay: 1.3 },
  { text: '✨ 38 new followers', x: 38, y: 77, delay: 1.6 },
]

export function WelcomeStep() {
  const presets = usePresets()
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
      <div className="relative h-[290px] w-full max-w-[340px]">
        <Floating x={50} y={50} delay={0} duration={5}>
          <div className="relative">
            <div aria-hidden className="aura-gradient absolute inset-2 rounded-full opacity-50 blur-2xl" />
            <LogoMark size={108} className="relative" />
          </div>
        </Floating>
        {presets.length > 0 &&
          BUBBLES.map((bubble, index) => (
            <Floating key={index} x={bubble.x} y={bubble.y} delay={bubble.delay} duration={4 + (index % 3)}>
              <div className="rounded-full bg-bg p-[3px] shadow-pop">
                <Img src={presets[index % presets.length]} alt="" className="rounded-full" style={{ width: bubble.size, height: bubble.size }} />
              </div>
            </Floating>
          ))}
        {PILLS.map((pill, index) => (
          <Floating key={pill.text} x={pill.x} y={pill.y} delay={pill.delay} duration={4.5 + index}>
            <span className="whitespace-nowrap rounded-full border border-line bg-elevated px-3 py-1.5 text-[13px] font-semibold shadow-pop">
              {pill.text}
            </span>
          </Floating>
        ))}
      </div>

      <Wordmark className="mt-2 text-[54px]" />
      <h1 className="mt-4 text-balance text-[26px] font-bold leading-tight tracking-tight">Everyone's happy to see you.</h1>
      <p className="mt-2 max-w-[300px] text-[15px] text-muted">Share your moments with the people who can't wait to see them.</p>
    </div>
  )
}

/** Pops in after `delay`, then bobs gently up and down forever. */
function Floating({ x, y, delay, duration, children }: { x: number; y: number; delay: number; duration: number; children: ReactNode }) {
  return (
    <motion.div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, x: '-50%', y: '-50%' }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 14, stiffness: 180 }}
    >
      <motion.div animate={{ y: [0, -7, 0] }} transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}>
        {children}
      </motion.div>
    </motion.div>
  )
}
