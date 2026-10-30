import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useT } from '../i18n'
import { contact } from '../config/contact'
import { Logo } from './Logo'
import { LangSwitch } from './LangSwitch'
import { Icon } from './Icon'
import { Ltr } from './ui'
import { BottomSheet } from './widgets'

export function Header({ variant = 'solid' }: { variant?: 'solid' | 'overlay' }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/', label: t('nav.consultants'), end: true },
    { to: '/find', label: t('nav.find') },
    { to: '/team', label: t('nav.staff') },
  ]
  return (
    <header className={`${variant === 'overlay' ? 'absolute inset-x-0 top-0 z-30' : 'sticky top-0 z-30 bg-slate-deep/95 backdrop-blur'} text-white`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-ink">
        {t('nav.skip')}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6">
        <Link to="/" aria-label={t('nav.home')} className="shrink-0">
          <Logo className="h-8 sm:h-10" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${isActive ? 'bg-white/12 text-white' : 'text-mist hover:text-white'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={`tel:${contact.hotline}`} className="hidden min-h-11 items-center gap-2 rounded-full px-3 text-sm text-mist hover:text-white lg:inline-flex">
            <Icon name="phone" size={15} />
            <Ltr className="font-semibold tabular">{contact.hotline}</Ltr>
          </a>
          <LangSwitch />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-full ring-1 ring-white/20 md:hidden"
            aria-label={t('nav.menu')}
            aria-expanded={open}
          >
            <Icon name="menu" />
          </button>
        </div>
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('nav.menu')}>
        <nav className="grid gap-1 pb-4 text-ink" aria-label="Mobile">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)} className="flex min-h-13 items-center justify-between rounded-xl px-3 text-base font-semibold hover:bg-mist-soft">
              {l.label}
              <Icon name="chevron" className="text-mist" />
            </NavLink>
          ))}
          <a href={`tel:${contact.hotline}`} className="mt-2 flex min-h-13 items-center gap-3 rounded-xl bg-paper px-3 font-semibold">
            <Icon name="phone" />
            {t('common.hotline')} <Ltr>{contact.hotline}</Ltr>
          </a>
        </nav>
      </BottomSheet>
    </header>
  )
}
