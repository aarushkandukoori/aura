/** The red dot on the notifications heart. Place inside a `relative` element. */
export function NavDot({ className = 'right-0.5 top-0.5' }: { className?: string }) {
  return <span aria-hidden className={`absolute size-2.5 rounded-full bg-like ring-2 ring-bg ${className}`} />
}

/** The red count bubble on the messages icon (nothing when zero). Place inside a `relative` element. */
export function NavCount({ count, className = '-right-1.5 -top-1.5' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={`absolute grid h-[18px] min-w-[18px] place-items-center rounded-full bg-like px-1 text-[11px] font-bold leading-none text-white ring-2 ring-bg ${className}`}>
      {count > 9 ? '9+' : count}
    </span>
  )
}
