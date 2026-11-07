import { useT } from '../../../i18n'
import type { Branch, Format } from '../../../domain/types'
import { bookingConfig } from '../../../config/booking'
import { Icon } from '../../../components/Icon'

export function FormatStep({ value, offered, branch, onChange }: { value: Format | null; offered: Format[]; branch: Branch; onChange: (f: Format) => void }) {
  const { t, l } = useT()
  const opts: { f: Format; icon: 'video' | 'building'; desc: string }[] = [
    {
      f: 'online', icon: 'video',
      desc: t('booking.onlineDesc', { ...bookingConfig.durationRange }),
    },
    {
      f: 'in-person', icon: 'building',
      desc: t('booking.inPersonDesc', { branch: l(branch.name), ...bookingConfig.durationRange }),
    },
  ]
  return (
    <fieldset>
      <legend className="mb-4 text-2xl font-semibold text-ink">{t('booking.chooseFormat')}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {opts.map(o => {
          const disabled = !offered.includes(o.f)
          const active = value === o.f
          return (
            <label
              key={o.f}
              className={`relative flex cursor-pointer flex-col gap-3 rounded-3xl border-2 p-5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-gold/40 ${
                disabled ? 'cursor-not-allowed border-line bg-paper opacity-60' : active ? 'border-slate bg-white shadow-[var(--shadow-lift)]' : 'border-line bg-white hover:border-mist'
              }`}
            >
              <input type="radio" name="format" className="sr-only" checked={active} disabled={disabled} onChange={() => onChange(o.f)}
                // A consultant with one format has it preselected; clicking it again must still move on.
                onClick={() => { if (active) onChange(o.f) }} aria-label={t(`format.${o.f}`)} />
              <span className={`inline-flex size-12 items-center justify-center rounded-2xl ${active ? 'bg-slate text-gold' : 'bg-paper text-slate'}`}>
                <Icon name={o.icon} size={22} />
              </span>
              <span className="text-lg font-semibold text-ink">{t(`format.${o.f}`)}</span>
              <span className="text-sm text-muted">{disabled ? t('booking.formatUnavailable') : o.desc}</span>
              {active && (
                <span className="absolute end-4 top-4 inline-flex size-7 items-center justify-center rounded-full bg-slate text-white">
                  <Icon name="check" size={15} />
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
