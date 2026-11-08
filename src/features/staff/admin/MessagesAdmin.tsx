import { useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { repo } from '../../../data'
import { errorKey } from '../../../data/feedback'
import { refreshMessageTemplates, useMessageTemplates } from '../../../data/messageTemplates'
import {
  fillTemplate, MAX_TEMPLATE_LENGTH, templateSpecs, templateText, type MessageTemplates, type TemplateSpec,
} from '../../../config/messageTemplates'
import type { Lang } from '../../../domain/types'
import { Button, Notice } from '../../../components/ui'
import { Segmented } from '../../../components/fields'
import { Icon } from '../../../components/Icon'
import { ScreenTitle } from '../StaffApp'

/** Sample values for the preview, so the admin sees the message as a client would. */
const SAMPLE: Record<Lang, Record<string, string>> = {
  ar: {
    client: 'سارة علي', name: 'سارة علي', consultant: 'محمد جمال', program: 'الهجرة', sender: 'منى', reference: 'MG-AB12-CD34',
    date: 'الثلاثاء، 10 نوفمبر', time: '02:00 م (توقيت القاهرة)', duration: '45 دقيقة', format: 'استشارة في الفرع',
    place: 'الفرع: مدينة نصر — شارع مكرم عبيد', ticketHowTo: 'افتح تذكرتك من الرابط بالأسفل.', ticketLink: 'https://consultatioin.vercel.app/#/booking/…', hotline: '17621',
  },
  en: {
    client: 'Sara Ali', name: 'Sara Ali', consultant: 'Mohamed Gamal', program: 'Immigration', sender: 'Mona', reference: 'MG-AB12-CD34',
    date: 'Tuesday, 10 November', time: '14:00 (Cairo time)', duration: '45 min', format: 'In-person consultation',
    place: 'Branch: Nasr City — Makram Ebeid St.', ticketHowTo: 'Open your ticket from the link below.', ticketLink: 'https://consultatioin.vercel.app/#/booking/…', hotline: '17621',
  },
}

/** Admin: the wording of the WhatsApp messages staff send to clients, per language. */
export function MessagesAdmin() {
  const { t } = useT()
  const templates = useMessageTemplates()
  return (
    <>
      <ScreenTitle title={t('staff.screens.messages')} />
      <p className="-mt-3 mb-5 text-sm text-muted">{t('staff.messages.intro')}</p>
      <div className="grid gap-5">
        {templateSpecs.map(spec => <TemplateEditor key={spec.key} spec={spec} templates={templates} />)}
      </div>
    </>
  )
}

function TemplateEditor({ spec, templates }: { spec: TemplateSpec; templates: MessageTemplates }) {
  const { t, l } = useT()
  const [lang, setLang] = useState<Lang>('ar')
  const saved = templateText(templates, spec.key, lang)
  const customised = !!templates[spec.key]?.[lang]?.trim()
  const [drafts, setDrafts] = useState<Partial<Record<Lang, string>>>({})
  const text = drafts[lang] ?? saved
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const dirty = text !== saved
  const tooLong = text.length > MAX_TEMPLATE_LENGTH

  const setText = (v: string) => { setDrafts(d => ({ ...d, [lang]: v })); setNote(null) }
  const insert = (name: string) => {
    const el = box.current
    const at = el ? el.selectionStart : text.length
    const next = `${text.slice(0, at)}{${name}}${text.slice(el ? el.selectionEnd : at)}`
    setText(next)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + name.length + 2, at + name.length + 2) })
  }
  const save = async (body: string | null) => {
    setBusy(true); setNote(null)
    try {
      await repo.saveMessageTemplate(spec.key, lang, body)
      await refreshMessageTemplates().catch(() => undefined)
      setDrafts(d => { const n = { ...d }; delete n[lang]; return n })
      setNote({ tone: 'ok', text: t(body === null ? 'staff.messages.restored' : 'staff.messages.saved') })
    } catch (e) { setNote({ tone: 'bad', text: t(errorKey(e)) }) } finally { setBusy(false) }
  }

  return (
    <section aria-label={l(spec.title)} className="rounded-2xl bg-white p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            <Icon name="chat" size={17} className="text-ok" />{l(spec.title)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${customised ? 'bg-gold-soft text-gold-deep' : 'bg-paper text-muted'}`}>
              {t(customised ? 'staff.messages.customised' : 'staff.messages.default')}
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">{l(spec.description)}</p>
        </div>
        <Segmented name={`tpl-lang-${spec.key}`} label={t('staff.finance.messageLanguage')} value={lang} onChange={v => { setLang(v); setNote(null) }}
          options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor={`tpl-${spec.key}`} className="mb-1.5 block text-sm font-semibold text-ink">{t('staff.messages.text')}</label>
          <textarea id={`tpl-${spec.key}`} ref={box} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} rows={spec.key === 'follow_up' ? 4 : 14}
            value={text} onChange={e => setText(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-slate focus:outline-none focus:ring-4 focus:ring-gold/30" />
          <p className={`mt-1 text-xs ${tooLong ? 'font-semibold text-bad' : 'text-muted'}`}>{text.length} / {MAX_TEMPLATE_LENGTH}</p>
          <p className="mt-2 text-xs font-semibold text-slate">{t('staff.messages.placeholders')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {spec.placeholders.map(p => (
              <button key={p.name} type="button" onClick={() => insert(p.name)} title={l(p.label)}
                className="rounded-lg bg-paper px-2 py-1 text-xs font-semibold text-slate ring-1 ring-line hover:bg-mist-soft">
                <span dir="ltr">{`{${p.name}}`}</span> <span className="font-normal text-muted">{l(p.label)}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">{t('staff.finance.preview')}</p>
          <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}
            className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-4 py-3 text-sm leading-relaxed text-ink shadow-sm">
            {fillTemplate(text, SAMPLE[lang])}
          </div>
        </div>
      </div>

      {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy || !dirty || tooLong || !text.trim()} onClick={() => void save(text)}><Icon name="check" size={16} />{t('staff.messages.save')}</Button>
        <Button variant="ghost" disabled={busy || (!customised && !dirty)} onClick={() => void save(null)}><Icon name="history" size={16} />{t('staff.messages.restore')}</Button>
      </div>
    </section>
  )
}
