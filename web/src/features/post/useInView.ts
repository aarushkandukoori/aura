import { useEffect, useState } from 'react'

/**
 * true while an element is at least `threshold` (0..1) visible on screen.
 * Videos and reel previews use it so they only play while you are looking at them.
 *
 *   const { ref, inView } = useInView(0.6)
 *   <div ref={ref}>...</div>
 */
export function useInView(threshold = 0.6) {
  const [node, setNode] = useState<Element | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, threshold])

  return { ref: setNode, inView }
}
