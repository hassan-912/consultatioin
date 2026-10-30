import { useT } from '../i18n'
import { branches } from '../config/branches'
import { contact } from '../config/contact'
import { Ltr } from './ui'
import { Icon } from './Icon'
import { Logo } from './Logo'

const SocialIcon = ({ name }: { name: 'facebook' | 'tiktok' | 'instagram' }) => {
  const d = {
    facebook: 'M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h2z',
    tiktok: 'M16 3c.4 2.2 1.8 3.7 4 4v3.2c-1.5 0-2.9-.5-4-1.2V15a6 6 0 1 1-6-6v3.3A2.7 2.7 0 1 0 12.7 15V3z',
    instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  }[name]
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function Footer() {
  const { t, l } = useT()
  const socials = [
    { key: 'facebook', href: contact.social.facebook, label: 'Facebook' },
    { key: 'tiktok', href: contact.social.tiktok, label: 'TikTok' },
    { key: 'instagram', href: contact.social.instagram, label: 'Instagram' },
  ] as const
  return (
    <footer className="mt-20 bg-slate-deep text-mist">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_2fr]">
        <div>
          <Logo className="h-11" />
          <div className="mt-6 space-y-3 text-sm">
            <a href={`tel:${contact.hotline}`} className="flex min-h-11 items-center gap-3 text-white hover:text-gold">
              <Icon name="phone" size={17} />
              <span>{t('common.hotline')}</span>
              <Ltr className="font-display text-lg font-semibold tabular">{contact.hotline}</Ltr>
            </a>
            <a href={`mailto:${contact.email}`} className="flex min-h-11 items-center gap-3 text-white hover:text-gold">
              <Icon name="mail" size={17} />
              <Ltr>{contact.email}</Ltr>
            </a>
          </div>
          <p className="mt-6 mb-3 text-sm font-semibold text-white">{t('footer.follow')}</p>
          <div className="flex gap-2">
            {socials.map(s => (
              <a
                key={s.key}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="inline-flex size-11 items-center justify-center rounded-full bg-white/5 text-white ring-1 ring-white/15 hover:bg-gold hover:text-ink"
              >
                <SocialIcon name={s.key} />
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-4 text-sm font-semibold text-white">{t('footer.branches')}</p>
          <ul className="grid gap-6 sm:grid-cols-3">
            {branches.map(b => (
              <li key={b.id} className="text-sm leading-relaxed">
                <p className="font-display text-base font-semibold text-white">{l(b.name)}</p>
                <p className="mb-2 text-xs text-mist/80">{l(b.city)}</p>
                <p className="text-mist">{l(b.address)}</p>
                <a href={b.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-gold hover:underline">
                  <Icon name="pin" size={15} />
                  {t('common.openMaps')}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-mist/80 sm:flex-row sm:justify-between sm:px-6">
          <p>{t('footer.rights', { year: new Date().getFullYear() })}</p>
          <p>{t('footer.demoNote')} {t('common.prototypeNote')}</p>
        </div>
      </div>
    </footer>
  )
}
