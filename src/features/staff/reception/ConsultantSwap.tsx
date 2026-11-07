import { useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { errorKey } from '../../../data/feedback'
import { useStaffBookings } from '../../../data/hooks'
import { getConsultants, getConsultant } from '../../../store/actions'
import { consultantBusy } from '../../../domain/bookingStatus'
import type { Booking } from '../../../domain/types'
import { Avatar } from '../../../components/widgets'
import { Button, Notice } from '../../../components/ui'
import { Icon } from '../../../components/Icon'
import { TextArea } from '../../../components/fields'

const quickReasons = ['notFree', 'late', 'asked', 'language'] as const

/**
 * After a scan: reception can hand the customer to another consultant (late arrival, workload). Changing is the
 * first option, keeping the booked consultant the second. Busy consultants cannot be picked, and reception
 * must say why they changed it (the new consultant and the history log both show the reason).
 */
export function ConsultantSwap({ b, onChanged }: { b: Booking; onChanged: (next: Booking) => void }) {
  const { t, l } = useT()
  const all = Object.values(useStaffBookings())
  const [mode, setMode] = useState<'ask' | 'choose' | 'reason' | 'kept'>('ask')
  const [target, setTarget] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [changedFrom, setChangedFrom] = useState<string | null>(null)
  const current = getConsultant(b.consultantId)
  const options = getConsultants().filter(c => !c.hidden)
    .filter(c => c.id !== b.consultantId && (b.format === 'online' || c.branchId === b.branchId))
    .map(c => ({ c, busy: consultantBusy(all, c.id, b) }))
    .sort((x, y) => Number(x.busy) - Number(y.busy))

  const pick = (id: string) => { setTarget(id); setReason(''); setError(null); setMode('reason') }
  const confirm = async () => {
    if (!target) return
    setBusyId(target); setError(null)
    try {
      const from = b.consultantId
      onChanged(await repo.reassignConsultant(b.id, target, reason))
      setChangedFrom(from)
      setMode('ask')
    } catch (e) {
      setError(e)
      if (errorKey(e) === 'payment.slotTaken') setMode('choose')
    } finally { setBusyId(null) }
  }

  return (
    <section aria-labelledby="swap-title" className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
      <h3 id="swap-title" className="font-semibold text-ink">{t('staff.reception.swap.title')}</h3>
      {changedFrom && <Notice tone="ok">{t('staff.reception.swap.changed', { from: l(getConsultant(changedFrom).name), to: l(current.name) })}</Notice>}
      {mode === 'kept' && <Notice tone="ok">{t('staff.reception.swap.kept', { name: l(current.name) })}</Notice>}
      {mode !== 'choose' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={() => { setMode('choose'); setChangedFrom(null) }} disabled={!options.length}>
            <Icon name="user" size={18} />{t('staff.reception.swap.change')}
          </Button>
          <Button size="lg" variant="ghost" onClick={() => { setMode('kept'); setChangedFrom(null) }}>
            <Icon name="check" size={18} />{t('staff.reception.swap.keep', { name: l(current.name) })}
          </Button>
        </div>
      )}
      {mode === 'choose' && (
        <div className="grid gap-2">
          <p className="text-sm text-muted">{t('staff.reception.swap.choose')}</p>
          {error != null && <Notice tone="bad">{t(errorKey(error) === 'payment.slotTaken' ? 'staff.reception.swap.nowBusy' : errorKey(error))}</Notice>}
          <ul className="grid gap-2">
            {options.map(({ c, busy }) => (
              <li key={c.id}>
                <button type="button" disabled={busy || busyId !== null} onClick={() => pick(c.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-start hover:border-slate disabled:cursor-not-allowed disabled:opacity-50">
                  <Avatar consultant={c} size="sm" />
                  <span className="min-w-0 flex-1 font-semibold text-ink">{l(c.name)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${busy ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok'}`}>
                    {busyId === c.id ? t('data.saving') : busy ? t('staff.reception.swap.busy') : t('staff.reception.swap.free')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" onClick={() => setMode('ask')}>{t('common.cancel')}</Button>
        </div>
      )}
      {mode === 'reason' && target && (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-ink">{t('staff.reception.swap.moving', { from: l(current.name), to: l(getConsultant(target).name) })}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('staff.reception.swap.quick')}>
            {quickReasons.map(k => {
              const text = t(`staff.reception.swap.reasons.${k}`)
              return (
                <button key={k} type="button" aria-pressed={reason === text} onClick={() => setReason(text)}
                  className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${reason === text ? 'border-slate bg-slate text-white' : 'border-line text-slate hover:border-slate'}`}>
                  {text}
                </button>
              )
            })}
          </div>
          <TextArea label={t('staff.reception.swap.reasonLabel')} hint={t('staff.reception.swap.reasonHint')} dir="auto" rows={2} maxLength={300}
            value={reason} onChange={e => setReason(e.target.value)} />
          {error != null && <Notice tone="bad">{t(errorKey(error))}</Notice>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" disabled={busyId !== null || reason.trim().length < 3} onClick={() => void confirm()}>
              {busyId ? t('data.saving') : t('staff.reception.swap.confirm')}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setMode('choose')}>{t('staff.reception.swap.back')}</Button>
          </div>
        </div>
      )}
    </section>
  )
}
