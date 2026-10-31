import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { TextField } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { openRecoveryLink, setNewPassword } from '../../store/liveAuth'

/** Landing page for password-reset and invitation emails: /#/staff/reset. */
export function StaffReset() {
  const { t } = useT()
  const [link, setLink] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<'tooShort' | 'mismatch' | 'unavailable' | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    const href = window.location.href
    void openRecoveryLink(href).then(ok => {
      if (!active) return
      setLink(ok ? 'ok' : 'invalid')
      // Tokens must not linger in the address bar or history.
      if (ok) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search.replace(/[?&]code=[^&]*/, '')}#/staff/reset`)
    })
    return () => { active = false }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('tooShort'); return }
    if (password !== confirm) { setError('mismatch'); return }
    setBusy(true); setError(null)
    try {
      if (await setNewPassword(password) === 'ok') setDone(true); else setError('unavailable')
    } finally { setBusy(false) }
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-slate-deep px-4 py-6 text-white">
      <div className="grain absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between">
        <Link to="/" aria-label={t('nav.home')}><Logo className="h-9" /></Link>
        <LangSwitch />
      </div>
      <main id="main" className="relative mx-auto my-auto w-full max-w-md py-10">
        <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 text-ink shadow-2xl sm:p-8">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-slate text-gold"><Icon name="shield" size={22} /></span>
          <h1 className="mt-4 text-2xl font-semibold">{t('staff.reset.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('staff.reset.hint')}</p>
          <div className="mt-6 grid gap-4">
            {link === 'checking' && <p role="status" className="text-sm text-muted">{t('data.loading')}</p>}
            {link === 'invalid' && <Notice tone="bad">{t('staff.reset.linkInvalid')}</Notice>}
            {done && <Notice tone="ok">{t('staff.reset.done')}</Notice>}
            {error && <Notice tone="bad">{t(`staff.reset.${error}`)}</Notice>}
            {link === 'ok' && !done && (
              <>
                <TextField label={t('staff.reset.newPassword')} dir="ltr" type="password" autoComplete="new-password" value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }} />
                <TextField label={t('staff.reset.confirm')} dir="ltr" type="password" autoComplete="new-password" value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(null) }} />
                <Button type="submit" size="lg" disabled={busy || !password || !confirm}>{busy ? t('staff.reset.saving') : t('staff.reset.submit')}</Button>
              </>
            )}
            {(done || link === 'invalid') && <Link to="/staff" className="inline-flex min-h-11 items-center text-sm font-semibold text-slate hover:text-ink">{t('staff.login.backToSignIn')}</Link>}
          </div>
        </form>
      </main>
    </div>
  )
}
