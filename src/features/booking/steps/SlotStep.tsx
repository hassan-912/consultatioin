import { useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import type { Branch, Format } from '../../../domain/types'
import { bookingConfig } from '../../../config/booking'
import { useAppStore } from '../../../store/useAppStore'
import { dateInZone, formatInZone, zoneLabel } from '../../../domain/time'
import { Segmented } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { DemoBadge, Notice } from '../../../components/ui'
import { DateStrip } from '../../directory/Filters'
import { slotsFor } from '../../shared/availability'
import { TimeWithZone } from '../shared'

export function SlotStep({ consultantId, branch, format, durationMin, slotStartIso, onChange, error, excludeBookingId }: {
  consultantId: string; branch: Branch; format: Format; durationMin: number | null; slotStartIso: string | null
  onChange: (p: { durationMin?: number; slotStartIso?: string | null }) => void; error?: string | null; excludeBookingId?: string
}) {
  const { t, lang } = useT()
  const filters = useAppStore(s => s.filters)
  const bookings = useAppStore(s => s.bookings)
  const duration = durationMin ?? bookingConfig.durations[format][0]
  const [date, setDate] = useState(slotStartIso ? dateInZone(slotStartIso, branch.timeZone) : filters.date)

  const slots = useMemo(
    () => slotsFor(consultantId, date, format, duration, excludeBookingId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consultantId, date, format, duration, bookings, excludeBookingId],
  )

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-semibold text-ink">{t('booking.chooseTime')}</h2>
        <DemoBadge />
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Segmented
        name="duration"
        label={t('booking.chooseDuration')}
        value={duration}
        onChange={d => onChange({ durationMin: d, slotStartIso: null })}
        options={bookingConfig.durations[format].map(d => ({ value: d, label: t('common.minutes', { n: d }) }))}
      />
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t('booking.chooseDate')}</p>
        <DateStrip label={t('booking.chooseDate')} value={date} onChange={setDate} days={21} />
      </div>
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
          <Icon name="clock" size={13} />
          {t('booking.timesShownIn', { zone: zoneLabel(branch.timeZone, lang) })}
        </p>
        {slots.length ? (
          <div role="radiogroup" aria-label={t('common.availableAppointments')} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {slots.map(s => {
              const active = s.startIso === slotStartIso
              return (
                <button
                  key={s.startIso}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ durationMin: duration, slotStartIso: s.startIso })}
                  className={`min-h-12 rounded-xl text-sm font-semibold ring-1 transition-colors ${
                    active ? 'bg-slate text-white ring-slate' : 'bg-white text-slate ring-line hover:ring-mist'
                  }`}
                >
                  <span dir="ltr" className="tabular">{formatInZone(s.startIso, branch.timeZone, lang, 'time')}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-muted ring-1 ring-line">{t('booking.noTimes')}</p>
        )}
      </div>
      {slotStartIso && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <TimeWithZone iso={slotStartIso} tz={branch.timeZone} showLocal={format === 'online'} />
        </div>
      )}
    </div>
  )
}
