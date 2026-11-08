import { useEffect, useRef, type ReactNode } from 'react'

/** The big question at the top of each onboarding step. */
export function StepTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)

  // Moving to a new step removes the field you were in, which drops keyboard focus to the page.
  // Then the new question takes it, so Tab carries on inside the step (and screen readers read it).
  // A field that focuses itself (autoFocus) or the Next button keeps focus.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="pb-6 pt-4">
      <h1 ref={heading} tabIndex={-1} className="text-balance text-[26px] font-bold leading-tight tracking-tight outline-none">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
    </div>
  )
}
