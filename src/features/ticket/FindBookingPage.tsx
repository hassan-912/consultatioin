import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { TextField } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { DataStatus } from '../../data/feedback'

export function FindBookingPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [ref, setRef] = useState('')
  const [phone, setPhone] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setNotFound(false)
    try {
      const token = await repo.find(ref, phone)
      if (!token) return setNotFound(true)
      navigate(`/booking/${token}`)
    } catch (error) { setError(error) } finally { setBusy(false) }
  }

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-lg px-4 py-12 sm:py-16">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-slate text-gold">
          <Icon name="qr" size={26} />
        </span>
        <h1 className="mt-5 text-3xl font-semibold text-ink">{t('ticket.findTitle')}</h1>
        <p className="mt-2 text-slate">{t('ticket.findHint')}</p>
        <form onSubmit={submit} noValidate className="mt-8 grid gap-5 rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
          {notFound && <Notice tone="bad">{t('ticket.notFound')}</Notice>}
          <DataStatus loading={busy} error={error} />
          <TextField label={t('common.reference')} dir="ltr" placeholder="MG-XXXX-XXXX" autoCapitalize="characters" value={ref} onChange={e => { setRef(e.target.value); setNotFound(false) }} />
          <TextField label={t('booking.phone')} type="tel" dir="ltr" placeholder="+20 100 123 4567" value={phone} onChange={e => { setPhone(e.target.value); setNotFound(false) }} />
          <Button type="submit" size="lg" disabled={busy}>{t('ticket.findSubmit')}</Button>
        </form>
      </main>
      <Footer />
    </>
  )
}
