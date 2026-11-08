import { useEffect, type RefObject } from 'react'

/**
 * Phones: keep a full-screen element exactly as tall as the part of the screen you can see.
 *
 * When the keyboard opens, mobile browsers shrink the *visual* viewport but not the page, so a
 * full-height chat would hide its composer behind the keyboard (and iOS also scrolls the page up).
 * window.visualViewport reports the visible area; we size the element to it and move it to where
 * the visible area starts. Desktop browsers never need this (pass active = false).
 */
export function useVisibleHeight(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const viewport = window.visualViewport
    const element = ref.current
    if (!active || !viewport || !element) return

    const update = () => {
      element.style.height = `${viewport.height}px`
      element.style.transform = `translateY(${viewport.offsetTop}px)`
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      element.style.height = ''
      element.style.transform = ''
    }
  }, [ref, active])
}
