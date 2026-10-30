import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Icon } from './Icon'

interface FieldShell { label: string; hint?: string; error?: string; children: (ids: { id: string; describedBy?: string }) => ReactNode }

function Shell({ label, hint, error, children }: FieldShell) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      {children({ id, describedBy: [errId, hintId].filter(Boolean).join(' ') || undefined })}
      {error ? (
        <p id={errId} className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-bad">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

const control = (error?: string) =>
  `block w-full min-h-12 rounded-xl border bg-white px-3.5 text-[16px] text-ink placeholder:text-mist transition-shadow focus:outline-none focus:ring-4 ${
    error ? 'border-bad focus:ring-bad/15' : 'border-line focus:border-slate focus:ring-slate/10'
  }`

export function TextField({ label, hint, error, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: string; error?: string }) {
  return (
    <Shell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => <input id={id} aria-invalid={!!error} aria-describedby={describedBy} className={control(error)} {...rest} />}
    </Shell>
  )
}

export function TextArea({ label, hint, error, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: string; error?: string }) {
  return (
    <Shell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <textarea id={id} aria-invalid={!!error} aria-describedby={describedBy} className={`${control(error)} py-3`} rows={3} {...rest} />
      )}
    </Shell>
  )
}

export function SelectField({ label, hint, error, children, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { label: string; hint?: string; error?: string }) {
  return (
    <Shell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <select id={id} aria-invalid={!!error} aria-describedby={describedBy} className={`${control(error)} appearance-none bg-[length:16px] bg-no-repeat pe-10 [background-position:right_14px_center] rtl:[background-position:left_14px_center]`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6773' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
          {children}
        </select>
      )}
    </Shell>
  )
}

/** Radio group styled as segmented buttons. */
export function Segmented<T extends string | number>({
  label, value, options, onChange, name,
}: { label: string; value: T | null; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; name: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const active = o.value === value
          return (
            <label
              key={String(o.value)}
              className={`relative inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
                o.disabled ? 'cursor-not-allowed border-line text-mist' : active ? 'border-slate bg-slate text-white' : 'border-line bg-white text-slate hover:border-mist'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={active}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
              />
              {o.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
