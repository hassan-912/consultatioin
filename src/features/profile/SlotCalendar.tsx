import { useState } from 'react'
import { useT } from '../../i18n'
import type { Consultant, Format } from '../../domain/types'
import { bookingConfig } from '../../config/booking'
import { branchById } from '../../config/branches'
import { useAppStore } from '../../store/useAppStore'
import { formatInZone, zoneLabel } from '../../domain/time'
import { Segmented } from '../../components/fields'
import { DemoBadge } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { DateStrip } from '../directory/Filters'
import { useOfferedFormats } from '../shared/availability'
import { useSlots } from '../../data/hooks'
import { DataStatus } from '../../data/feedback'
import { useStartBooking } from '../directory/ConsultantCard'

export function SlotCalendar({ consultant }: { consultant: Consultant }) {
  const { t, lang } = useT()
  const filters = useAppStore(s => s.filters)
  const branch = branchById(consultant.branchId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const formats = useOfferedFormats(consultant.id)
  const [format, setFormat] = useState<Format>(
    filters.format !== 'any' && formats.includes(filters.format) ? filters.format : formats[0] ?? 'online',
  )
  const duration = bookingConfig.durations[format][0]
  const [date, setDate] = useState(filters.date)
  const startBooking = useStartBooking()

  const { slots, loading, error } = useSlots(consultant.id, date, format, duration)

  return (
    <section aria-labelledby="cal-title" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id="cal-title" className="text-lg font-semibold text-ink">{t('common.availableAppointments')}</h2>
        <DemoBadge />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Segmented
          name="cal-format"
          label={t('profile.pickFormat')}
          value={format}
          onChange={f => {
            setFormat(f)
          }}
          options={(['online', 'in-person'] as Format[]).map(f => ({
            value: f,
            disabled: !formats.includes(f),
            label: (
              <span className="flex items-center gap-1.5">
                <Icon name={f === 'online' ? 'video' : 'building'} size={15} />
                {t(f === 'online' ? 'format.onlineShort' : 'format.inPersonShort')}
              </span>
            ),
          }))}
        />
        <p className="flex items-center gap-1.5 text-sm text-slate">
          <span className="font-semibold">{t('common.duration')}:</span> {t('common.minutes', { n: bookingConfig.durationRange.max })}
        </p>
      </div>
      <div className="mt-5">
        <DateStrip label={t('booking.chooseDate')} value={date} onChange={setDate} />
      </div>
      <p className="mt-4 mb-2 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="clock" size={13} />
        {t('booking.timesShownIn', { zone: zoneLabel(branch.timeZone, lang) })}
      </p>
      {loading || error ? <DataStatus loading={loading} error={error} /> : slots.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map(s => (
            <li key={s.startIso}>
              <button
                type="button"
                onClick={() => startBooking(consultant.id, { format, startIso: s.startIso, durationMin: duration })}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-paper text-sm font-semibold text-slate ring-1 ring-line transition-colors hover:bg-slate hover:text-white"
              >
                <span dir="ltr" className="tabular">{formatInZone(s.startIso, branch.timeZone, lang, 'time')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-paper px-4 py-6 text-center text-sm text-muted">{t('profile.noSlots')}</p>
      )}
    </section>
  )
}
