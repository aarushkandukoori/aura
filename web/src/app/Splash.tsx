import { motion } from 'motion/react'
import { LogoMark, Wordmark } from '../components'

/** The launch screen while the session loads: the glowing ring, with the wordmark at the bottom. */
export function Splash({ message }: { message?: string | null }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg">
      <motion.div
        animate={{ scale: [1, 1.07, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <LogoMark size={88} />
      </motion.div>
      {message && <p className="mt-8 px-8 text-center text-sm text-muted">{message}</p>}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+40px)]">
        <Wordmark className="text-[26px]" />
      </div>
    </div>
  )
}
