import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { cx } from '../lib/cx'

interface FieldFrameProps {
  label?: string
  hint?: ReactNode
  error?: string | null
  /** Shows "12/150" when the field has a maxLength. */
  count?: { length: number; max?: number }
  id: string
  className?: string
  children: ReactNode
}

/** Label above, the field, then an error or hint line with an optional character count. */
function FieldFrame({ label, hint, error, count, id, className, children }: FieldFrameProps) {
  const showCount = count?.max !== undefined
  return (
    <div className={cx('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
          {label}
        </label>
      )}
      {children}
      {(error || hint || showCount) && (
        <div className="mt-1.5 flex gap-3 text-xs">
          <span id={`${id}-note`} className={cx('flex-1', error ? 'text-danger' : 'text-muted')}>
            {error || hint}
          </span>
          {showCount && (
            <span className="text-muted tabular-nums">
              {count.length}/{count.max}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const FIELD = cx(
  'w-full rounded-xl border bg-surface text-sm text-fg placeholder:text-muted transition-colors',
  'outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60',
)

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  label?: string
  hint?: ReactNode
  error?: string | null
  /** Fixed text inside the field on the left, e.g. "@". */
  prefix?: string
  ref?: Ref<HTMLInputElement>
}

/** A labeled text input: <TextField label="Username" prefix="@" value={v} onChange={(e) => setV(e.target.value)} />. */
export function TextField({ label, hint, error, prefix, className, id, maxLength, value, ref, ...rest }: TextFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldFrame label={label} hint={hint} error={error} id={fieldId} className={className} count={{ length: String(value ?? '').length, max: maxLength }}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-note` : undefined}
          className={cx(FIELD, 'h-11 px-3.5', prefix && 'pl-8', error ? 'border-danger' : 'border-line')}
          {...rest}
        />
      </div>
    </FieldFrame>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  hint?: ReactNode
  error?: string | null
  ref?: Ref<HTMLTextAreaElement>
}

/** A labeled multi-line input (bio, caption). */
export function TextArea({ label, hint, error, className, id, maxLength, value, rows = 3, ref, ...rest }: TextAreaProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldFrame label={label} hint={hint} error={error} id={fieldId} className={className} count={{ length: String(value ?? '').length, max: maxLength }}>
      <textarea
        ref={ref}
        id={fieldId}
        value={value}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-note` : undefined}
        className={cx(FIELD, 'resize-none px-3.5 py-2.5 leading-snug', error ? 'border-danger' : 'border-line')}
        {...rest}
      />
    </FieldFrame>
  )
}
