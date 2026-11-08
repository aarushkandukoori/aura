import { cx } from '../lib/cx'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name (also shown as text when `showLabel`). */
  label: string
  showLabel?: boolean
  disabled?: boolean
  className?: string
}

/** An on/off toggle: <Switch label="Mute messages" checked={muted} onChange={setMuted} />. */
export function Switch({ checked, onChange, label, showLabel = false, disabled = false, className }: SwitchProps) {
  return (
    <label className={cx('inline-flex items-center gap-3', disabled ? 'opacity-50' : 'cursor-pointer', className)}>
      {showLabel && <span className="text-sm">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span
          className={cx(
            'absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200',
            checked && 'translate-x-[18px]',
          )}
        />
      </button>
    </label>
  )
}
