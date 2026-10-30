import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { Icon } from './Icon'

export function LangSwitch({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { t, lang } = useT()
  const setLang = useAppStore(s => s.setLang)
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      aria-label={t('meta.switchLabel')}
      lang={lang === 'ar' ? 'en' : 'ar'}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
        tone === 'dark' ? 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20' : 'bg-white text-slate ring-1 ring-line hover:bg-mist-soft'
      }`}
    >
      <Icon name="globe" size={16} />
      <span className={lang === 'en' ? 'font-[family-name:var(--font-arabic)]' : ''}>{t('meta.switchTo')}</span>
    </button>
  )
}
