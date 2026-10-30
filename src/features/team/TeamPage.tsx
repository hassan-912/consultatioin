import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { team, type TeamMember } from '../../config/team'
import { roleName, roleRank } from '../../config/teamRoles'
import { branches } from '../../config/branches'
import type { BranchId } from '../../domain/types'
import { Header } from '../../components/Header'
import { Footer } from '../../components/Footer'
import { Icon } from '../../components/Icon'
import { teamPhoto } from './photos'

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('')

function Portrait({ m, size = 'card' }: { m: TeamMember; size?: 'card' | 'hero' }) {
  const src = teamPhoto(m.photoFile)
  const cls = size === 'hero' ? 'aspect-[4/5] w-full max-w-[200px] rounded-[24px]' : 'aspect-[4/5] w-full rounded-2xl'
  return src ? (
    <img src={src} alt={m.name} loading="lazy" className={`${cls} bg-mist-soft object-cover object-top`} />
  ) : (
    <div className={`${cls} flex items-center justify-center bg-gradient-to-br from-slate to-navy font-display text-3xl font-semibold text-white`} role="img" aria-label={m.name}>
      {initials(m.name)}
    </div>
  )
}

export function TeamPage() {
  const { t, l } = useT()
  const [branch, setBranch] = useState<BranchId | 'all'>('all')
  const founder = team.find(m => m.branchId === null)!
  const members = useMemo(
    () =>
      team
        .filter(m => m.branchId && (branch === 'all' || m.branchId === branch))
        .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name)),
    [branch],
  )
  const count = (id: BranchId) => team.filter(m => m.branchId === id).length

  return (
    <>
      <Header />
      <section aria-labelledby="team-title" className="relative overflow-hidden bg-slate-deep text-white">
        <div className="grain absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-end gap-8 px-4 pb-10 pt-8 sm:px-6 md:grid-cols-[1fr_200px]">
          <div>
            <h1 id="team-title" className="text-4xl font-semibold leading-tight sm:text-5xl">{t('team.title')}</h1>
            <p className="mt-4 max-w-[52ch] text-mist sm:text-lg">{t('team.subtitle')}</p>
            <div className="mt-8 flex items-center gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 md:hidden">
              <div className="w-20 shrink-0"><Portrait m={founder} /></div>
              <div>
                <p dir="auto" className="font-display text-lg font-semibold">{founder.name}</p>
                <p className="text-sm text-gold">{l(roleName(founder.role))}</p>
              </div>
            </div>
          </div>
          <figure className="hidden md:block">
            <Portrait m={founder} size="hero" />
            <figcaption className="mt-3">
              <p dir="auto" className="font-display text-xl font-semibold">{founder.name}</p>
              <p className="text-sm text-gold">{l(roleName(founder.role))}</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div role="tablist" aria-label={t('common.branch')} className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(['all', ...branches.map(b => b.id)] as const).map(id => (
            <button
              key={id}
              role="tab"
              aria-selected={branch === id}
              onClick={() => setBranch(id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition-colors ${
                branch === id ? 'bg-slate text-white ring-slate' : 'bg-white text-slate ring-line hover:ring-mist'
              }`}
            >
              {id === 'all' ? t('directory.allBranches') : l(branches.find(b => b.id === id)!.name)}
              <span className={`rounded-full px-1.5 text-xs ${branch === id ? 'bg-white/20' : 'bg-paper'}`} dir="ltr">
                {id === 'all' ? team.length - 1 : count(id)}
              </span>
            </button>
          ))}
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {members.map(m => (
            <li key={m.id} className="group">
              <Portrait m={m} />
              <p dir="auto" className="mt-2.5 font-semibold leading-snug text-ink">{m.name}</p>
              <p className="text-sm text-muted">{l(roleName(m.role))}</p>
              {branch === 'all' && <p className="text-xs text-muted/80">{l(branches.find(b => b.id === m.branchId)!.name)}</p>}
              {m.consultantId && (
                <Link to={`/consultant/${m.consultantId}`} className="mt-1.5 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-navy hover:underline">
                  {t('common.book')}
                  <Icon name="chevron" size={14} />
                </Link>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-line sm:flex-row sm:items-center">
          <p className="text-sm text-muted">{t('team.sourceNote')}</p>
          <Link to="/staff" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate ring-1 ring-line hover:bg-paper">
            <Icon name="user" size={16} />
            {t('staff.login.title')}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
