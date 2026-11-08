import { motion } from 'motion/react'
import { Avatar } from '../../../components'
import type { Account } from '../../../lib/types'

/** "..." bubbles at the bottom of the chat, one per person typing, with their picture. */
export function TypingBubbles({ typers }: { typers: Account[] }) {
  return (
    <>
      {typers.slice(0, 3).map((typer) => (
        <motion.div
          key={typer.id}
          aria-label={`${typer.displayName} is typing`}
          className="mt-3 flex items-end gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Avatar account={typer} size={28} />
          <div className="flex h-[38px] items-center gap-[5px] rounded-[20px] bg-surface-2 px-4">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="size-[7px] rounded-full bg-muted"
                animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.16, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </>
  )
}
