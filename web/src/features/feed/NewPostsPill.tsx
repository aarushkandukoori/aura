import { ArrowUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AvatarStack } from '../../components'
import { useIsMobile } from '../../lib/hooks'
import { useStore } from '../../lib/store'

/** Put the queued new posts at the top of the feed. */
function insertNewPosts() {
  const store = useStore.getState()
  store.prependToPostList('feed', store.newPostIds)
  store.clearNewPosts()
}

/**
 * "New posts" floating over the top of the feed when people I follow post while I'm scrolling.
 * Tapping it puts their posts at the top and scrolls up. (My own posts go straight to the top.)
 */
export function NewPostsPill() {
  const isMobile = useIsMobile()
  const count = useStore((s) => s.newPostIds.length)
  // Up to three faces, one per person (someone who posted twice still shows once).
  const authors = useStore(useShallow((s) => {
    const people = s.newPostIds.flatMap((id) => (s.posts[id] ? [s.posts[id].author] : []))
    return people.filter((person, index) => people.findIndex((other) => other.id === person.id) === index).slice(0, 3)
  }))
  const marker = useRef<HTMLDivElement>(null)
  // null until the first check, so coming back to a scrolled feed never inserts posts above where you were.
  const [atTop, setAtTop] = useState<boolean | null>(null)
  const stickyLine = isMobile ? 64 : 20 // where the pill sticks: under the phone top bar, near the top on desktop

  // Until you scroll past the stories, the pill would sit on the first post's name and time, and
  // the top of the feed is in view anyway: new posts then go straight in at the top instead.
  // The marker sits where the pill's row starts; it is "in view" while it is below the sticky line.
  useEffect(() => {
    const node = marker.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setAtTop(entry.isIntersecting), {
      rootMargin: `-${stickyLine}px 0px 0px 0px`,
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [stickyLine])

  useEffect(() => {
    // Measured again right now too: the observer can lag a moment behind a fast scroll.
    const stillAtTop = (marker.current?.getBoundingClientRect().top ?? 0) > stickyLine
    if (atTop && stillAtTop && count > 0) insertNewPosts()
  }, [atTop, count, stickyLine])

  function showNewPosts() {
    insertNewPosts()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div ref={marker} aria-hidden />
      {/* A zero-height sticky row: the pill floats over the posts and follows you down the page. */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+64px)] z-20 flex h-0 justify-center md:top-5">
        <AnimatePresence>
          {count > 0 && atTop === false && (
            <motion.button
              type="button"
              onClick={showNewPosts}
              className="flex h-10 items-center gap-2 rounded-full bg-accent pl-3 pr-4 text-sm font-semibold text-white shadow-pop hover:bg-accent-hover"
              initial={{ opacity: 0, y: -12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.9 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
              {authors.length > 0 && <AvatarStack accounts={authors} size={22} className="[&>span]:ring-accent" />}
              New posts
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
