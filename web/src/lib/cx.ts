/**
 * Join class names, skipping empty ones: cx('px-2', active && 'font-semibold', className).
 * A tiny stand-in for the `clsx` package.
 */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
