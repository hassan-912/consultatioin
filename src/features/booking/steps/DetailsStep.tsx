import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import type { CustomerDetails } from '../../../domain/types'
import { programs } from '../../../config/programs'
import { SelectField, TextArea, TextField } from '../../../components/fields'
import { cleanPhone } from '../../../domain/phone'
import { DEFAULT_COUNTRY, countryOfPhone, countryOptions, dialOf } from '../../../config/countryCodes'
import { Button, Notice } from '../../../components/ui'
import type { DetailErrors } from '../shared'

export function DetailsStep({ value, onChange, errors, showSummary, onSubmit }: {
  value: CustomerDetails; onChange: (p: Partial<CustomerDetails>) => void; errors: DetailErrors; showSummary: boolean; onSubmit: () => void
}) {
  const { t, l } = useT()
  const err = (k: keyof DetailErrors) => (errors[k] ? t(errors[k]!) : undefined)
  // Confirmations always go by WhatsApp now; a draft saved when clients could pick email is moved over.
  useEffect(() => { if (value.channel !== 'whatsapp') onChange({ channel: 'whatsapp' }) }, [value.channel, onChange])
  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        onSubmit()
      }}
      className="grid grid-cols-[minmax(0,1fr)] gap-5"
    >
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('booking.detailsTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('booking.detailsHint')}</p>
      </div>
      {showSummary && Object.keys(errors).length > 0 && <Notice tone="bad">{t('validation.fixErrors')}</Notice>}
      <TextField label={t('booking.name')} autoComplete="name" value={value.name} onChange={e => onChange({ name: e.target.value })} error={err('name')} />
      <div className="grid gap-5 sm:grid-cols-2">
        <PhoneField phone={value.phone} onChange={phone => onChange({ phone })} error={err('phone')} />
        <TextField
          label={t('booking.emailLabel')}
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          value={value.email}
          onChange={e => onChange({ email: e.target.value })}
          hint={t('booking.emailHint')}
          error={err('email')}
        />
      </div>
      <SelectField label={t('booking.program')} value={value.program} onChange={e => onChange({ program: e.target.value as CustomerDetails['program'] })} error={err('program')}>
        <option value="">{t('booking.programPick')}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{l(p.name)}</option>)}
      </SelectField>
      {/* No assessment questions here: the consultant fills in the file assessment on the client's card. */}
      <TextArea label={t('booking.note')} maxLength={300} value={value.note} onChange={e => onChange({ note: e.target.value })} hint={t('booking.noteHint')} error={err('note')} />
      <p className="text-xs text-muted">{t('booking.privacy')}</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-start">{t('booking.reviewCta')}</Button>
    </form>
  )
}

/** Country code list plus the local number; the full number (+20100...) is what gets saved. */
function PhoneField({ phone, onChange, error }: { phone: string; onChange: (phone: string) => void; error?: string }) {
  const { t, lang } = useT()
  const [iso, setIso] = useState(() => countryOfPhone(phone) ?? DEFAULT_COUNTRY)
  const dial = dialOf(iso)
  const local = phone.startsWith(dial) ? phone.slice(dial.length) : phone
  const compose = (code: string, typed: string) => {
    const digits = cleanPhone(typed).replace(/^0+/, '')
    return digits ? `${code}${digits}` : ''
  }
  const onLocal = (typed: string) => {
    const cleaned = cleanPhone(typed)
    if (cleaned.startsWith('+')) {
      // Pasted a full international number: pick its country and keep it as is.
      const found = countryOfPhone(cleaned)
      if (found) setIso(found)
      onChange(cleaned)
      return
    }
    onChange(compose(dial, typed))
  }
  const errId = 'phone-err'
  return (
    <div>
      <label htmlFor="booking-phone" className="mb-1.5 block text-sm font-semibold text-ink">{t('booking.phone')}</label>
      <div dir="ltr" className="flex gap-2">
        <select
          aria-label={t('booking.countryCode')}
          value={iso}
          onChange={e => { setIso(e.target.value); if (local) onChange(compose(dialOf(e.target.value), local)) }}
          className="min-h-12 w-32 shrink-0 rounded-xl border border-line bg-white px-2 text-[15px] text-ink focus:border-slate focus:outline-none focus:ring-4 focus:ring-slate/10"
        >
          {countryOptions(lang).map(o => <option key={o.iso} value={o.iso}>{o.label}</option>)}
        </select>
        <input
          id="booking-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="100 123 4567"
          value={local}
          onChange={e => onLocal(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          className={`block min-h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 text-[16px] text-ink placeholder:text-mist focus:outline-none focus:ring-4 ${error ? 'border-bad focus:ring-bad/15' : 'border-line focus:border-slate focus:ring-slate/10'}`}
        />
      </div>
      {error ? <p id={errId} className="mt-1.5 text-sm font-medium text-bad">{error}</p> : <p className="mt-1.5 text-xs text-muted">{t('booking.phoneHint')}</p>}
    </div>
  )
}
