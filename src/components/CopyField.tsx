import { useState } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

export function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: value stays selectable */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p dir="ltr" className={`truncate text-start font-semibold text-ink rtl:text-end ${mono ? 'tabular tracking-wide' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-navy hover:bg-mist-soft"
        aria-label={`${t('common.copy')} ${label}`}
      >
        <Icon name={copied ? 'check' : 'copy'} size={16} className={copied ? 'text-ok' : ''} />
        <span className="hidden sm:inline">{copied ? t('common.copied') : t('common.copy')}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? t('common.copied') : ''}</span>
    </div>
  )
}
