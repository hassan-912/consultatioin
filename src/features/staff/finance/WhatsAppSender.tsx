import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { repo } from '../../../data'
import type { Booking, Lang } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { Segmented, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { BoardingPass, manageUrl } from '../../ticket/BoardingPass'
import { getSaver, ticketPdf } from '../../ticket/ticketPdf'
import { buildConfirmationMessage, whatsappLink } from './whatsappMessage'
import { isLive } from '../../../data/mode'
import { DataStatus, errorKey } from '../../../data/feedback'
import { RepoError } from '../../../data/types'

const canShareFiles = () => {
  try {
    const probe = new File(['x'], 'ticket.pdf', { type: 'application/pdf' })
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

/** Finance's WhatsApp confirmation: greeting from a named team member, chosen language, ticket PDF. */
export function WhatsAppSender({ b }: { b: Booking }) {
  const { t } = useT()
  const [ticket, setTicket] = useState<Booking>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!isLive) return <Sender b={b} />
  if (ticket) return <Sender b={ticket} />
  return <div className="mt-4 grid gap-3"><DataStatus loading={busy} error={error} /><Button disabled={busy} onClick={async () => {
    setBusy(true); setError(null)
    try {
      if (!import.meta.env.VITE_SITE_URL) throw new RepoError('LIVE_CONFIG_MISSING')
      const token = await repo.staffManageToken(b.id)
      const full = await repo.getByManageToken(token)
      if (!full?.qrToken || !full.manageToken) throw new RepoError('NOT_FOUND')
      setTicket(full)
    } catch (error) { setError(error) } finally { setBusy(false) }
  }}>{t('staff.finance.sendTitle')}</Button></div>
}

function Sender({ b }: { b: Booking }) {
  const { t } = useT()
  const sender = useAppStore(s => s.senderName)
  const [msgLang, setMsgLang] = useState<Lang>(b.customer.consultationLang)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saver, setSaver] = useState<Awaited<ReturnType<typeof getSaver>>>(null)
  const passRef = useRef<HTMLDivElement>(null)
  const share = useMemo(canShareFiles, [])
  const text = buildConfirmationMessage(b, msgLang, sender || '…', manageUrl(b))
  const ready = sender.trim().length > 1
  const filename = `MG-ticket-${b.reference}${msgLang === 'ar' ? '-ar' : ''}.pdf`

  useEffect(() => {
    let live = true
    getSaver().then(fn => live && setSaver(() => fn))
    return () => {
      live = false
    }
  }, [])

  const pdf = async () => {
    await document.fonts?.ready
    return ticketPdf(passRef.current!)
  }

  const shareAll = async () => {
    setBusy(true)
    setError(null)
    try {
      const file = new File([await pdf()], filename, { type: 'application/pdf' })
      await navigator.share({ files: [file], text })
      await repo.staffTransition(b.id, { type: 'mark-sent', via: 'whatsapp' }, 'finance')
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setError(err)
    } finally {
      setBusy(false)
    }
  }

  const savePdf = async () => {
    if (!saver) return
    setBusy(true)
    setError(null)
    try {
      await saver(filename, await pdf())
      setSaved(true)
    } catch (err) {
      if ((err as { code?: string })?.code !== 'declined') setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 grid gap-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Icon name="chat" size={17} className="text-ok" />
        {t('staff.finance.sendTitle')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('staff.finance.senderName')}
          hint={t('staff.finance.senderHint')}
          value={sender}
          onChange={e => useAppStore.setState({ senderName: e.target.value })}
          autoComplete="name"
        />
        <Segmented
          name={`wa-lang-${b.id}`}
          label={t('staff.finance.messageLanguage')}
          value={msgLang}
          onChange={setMsgLang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">{t('staff.finance.preview')}</p>
        <div
          dir={msgLang === 'ar' ? 'rtl' : 'ltr'}
          lang={msgLang}
          className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-4 py-3 text-sm leading-relaxed text-ink shadow-sm"
        >
          {text}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-slate" dir="ltr">
            <Icon name="download" size={14} />
            {filename}
          </div>
        </div>
      </div>

      {!ready && <p className="text-sm font-semibold text-warn">{t('staff.finance.senderRequired')}</p>}
      {error != null && <Notice tone="bad">{t(error instanceof RepoError ? errorKey(error) : 'ticket.downloadFailed')}</Notice>}

      {share ? (
        <div>
          <Button className="bg-ok hover:bg-ok" disabled={!ready || busy} onClick={shareAll}>
            <Icon name="chat" size={16} />
            {busy ? t('ticket.downloading') : t('staff.finance.sharePdf')}
          </Button>
          <p className="mt-2 text-xs text-muted">{t('staff.finance.shareHint')}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-xs text-muted">{t('staff.finance.fallbackHint')}</p>
          <div className="flex flex-wrap gap-2">
            {saver && (
              <Button variant="ghost" disabled={!ready || busy} onClick={savePdf}>
                <Icon name={saved ? 'check' : 'download'} size={16} className={saved ? 'text-ok' : ''} />
                1. {saved ? t('staff.finance.pdfReady') : t('staff.finance.step1')}
              </Button>
            )}
            <a
              href={ready ? whatsappLink(b.customer.phone, text) : undefined}
              aria-disabled={!ready}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-ok px-5 text-[15px] font-semibold text-white ${ready ? 'hover:brightness-110' : 'pointer-events-none opacity-45'}`}
            >
              <Icon name="chat" size={16} />
              {saver ? '2. ' : ''}{t('staff.finance.step2')}
            </a>
            <Button variant="ghost" disabled={!ready} onClick={() => repo.staffTransition(b.id, { type: 'mark-sent', via: 'whatsapp' }, 'finance')}>
              {t('staff.finance.markSent')}
            </Button>
          </div>
        </div>
      )}

      {/* Off-screen ticket in the message language, captured for the PDF attachment. */}
      <div aria-hidden className="pointer-events-none fixed top-0 w-[420px]" style={{ left: -10000 }}>
        <BoardingPass ref={passRef} booking={b} lang={msgLang} />
      </div>
    </div>
  )
}
