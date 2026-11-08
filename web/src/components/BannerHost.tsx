import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { cx } from '../lib/cx'
import { useStore, type Banner } from '../lib/store'
import { Avatar } from './Avatar'
import { LogoMark } from './Wordmark'

/** A new banner ignores taps for this long, so one that slides in under your finger doesn't catch a tap meant for the page. */
const ARM_AFTER_MS = 600

/**
 * Push-notification style banners for live "banner" events ("maya: omg that photo 😭").
 * They slide down from the top, stack up to three (one on phones, a chat's later messages update
 * its banner), leave after 5 s, can be swiped up, and open the related screen when clicked. The
 * store already skips banners for the chat you are looking at. On desktop they keep clear of the
 * top-right corner, where modals and the story viewer have their close button.
 */
export function BannerHost() {
  const banners = useStore((s) => s.banners)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[85] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+8px)] md:items-end md:pl-5 md:pr-20 md:pt-5">
      <AnimatePresence initial={false}>
        {banners.map((banner) => (
          <BannerCard key={banner.id} banner={banner} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function BannerCard({ banner }: { banner: Banner }) {
  const dismiss = useStore((s) => s.dismissBanner)
  const navigate = useNavigate()
  const [armed, setArmed] = useState(false)

  // 5 s on screen, counted again when another message updates the banner.
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(banner.id), 5000)
    return () => window.clearTimeout(timer)
  }, [banner.id, banner.count, dismiss])

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), ARM_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const open = () => {
    dismiss(banner.id)
    if (banner.href) navigate(banner.href)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', damping: 26, stiffness: 340 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.8, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -30) dismiss(banner.id)
      }}
      className={cx('w-full max-w-[400px]', armed ? 'pointer-events-auto' : 'pointer-events-none')}
    >
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-elevated/95 px-3 py-2.5 text-left shadow-pop backdrop-blur-xl"
      >
        {banner.avatar ? <Avatar src={banner.avatar} size={40} /> : <LogoMark size={40} />}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold">{banner.title}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted">{banner.count > 1 ? `${banner.count} new` : 'now'}</span>
          </span>
          <span className="line-clamp-2 text-[13px] leading-snug text-fg/85">{banner.body}</span>
        </span>
      </button>
    </motion.div>
  )
}
