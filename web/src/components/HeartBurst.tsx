import { Heart } from 'lucide-react'
import { motion } from 'motion/react'

/**
 * The big heart that pops over a photo or reel when you double-tap it.
 * Put it inside a `relative` media box and add 1 to `trigger` on each double tap:
 *   const [burst, setBurst] = useState(0)
 *   <HeartBurst trigger={burst} />
 */
export function HeartBurst({ trigger, size = 96 }: { trigger: number; size?: number }) {
  if (trigger === 0) return null
  return (
    <motion.div
      key={trigger}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.15, 0.95, 1.05] }}
      transition={{ duration: 0.9, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
    >
      <Heart size={size} fill="#fff" color="#fff" strokeWidth={1} className="drop-shadow-[0_6px_24px_rgb(0_0_0/0.35)]" />
    </motion.div>
  )
}
