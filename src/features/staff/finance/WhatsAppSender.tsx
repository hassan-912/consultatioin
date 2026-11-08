import { useState } from 'react'
import { useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { repo } from '../../../data'
import type { Booking, Lang } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { Segmented, TextField } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { manageUrl } from '../../ticket/BoardingPass'
import { buildConfirmationMessage, whatsappLink } from './whatsappMessage'
import { useMessageTemplates } from '../../../data/messageTemplates'
import { isLive } from '../../../data/mode'
import { DataStatus, errorKey } from '../../../data/feedback'
import { RepoError } from '../../../data/types'

/** Finance's WhatsApp confirmation: greeting from a named team member, chosen language, ticket link (no attachment). */
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
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const templates = useMessageTemplates()
  const text = buildConfirmationMessage(b, msgLang, sender || '…', manageUrl(b), templates)
  const ready = sender.trim().length > 1
  const markSent = () => {
    setError(null)
    repo.staffTransition(b.id, { type: 'mark-sent', via: 'whatsapp' }).catch(setError)
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
          className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-4 py-3 text-sm leading-relaxed text-ink shadow-sm"
        >
          {text}
        </div>
      </div>

      {!ready && <p className="text-sm font-semibold text-warn">{t('staff.finance.senderRequired')}</p>}
      {error != null && <Notice tone="bad">{t(errorKey(error))}</Notice>}

      <div className="grid gap-2">
        <p className="text-xs text-muted">{t('staff.finance.linkHint')}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={ready ? whatsappLink(b.customer.phone, text) : undefined}
            aria-disabled={!ready}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-ok px-5 text-[15px] font-semibold text-white ${ready ? 'hover:brightness-110' : 'pointer-events-none opacity-45'}`}
          >
            <Icon name="chat" size={16} />
            {t('staff.finance.step2')}
          </a>
          <Button variant={opened ? 'primary' : 'ghost'} disabled={!ready} onClick={markSent}>
            <Icon name="check" size={16} />
            {t('staff.finance.markSent')}
          </Button>
        </div>
      </div>
    </div>
  )
}
