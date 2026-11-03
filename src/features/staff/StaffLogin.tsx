import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { signIn } from '../../store/auth'
import { requestPasswordReset, signInWithEmail } from '../../store/liveAuth'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { TextField } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { isLive } from '../../data/mode'
import { GoogleButton, SignupForm } from './StaffSignup'

export function StaffLogin() {
  const { t } = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'invalid' | 'inactive' | 'unavailable' | null>(null)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const [signup, setSignup] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (isLive && forgot) {
        setError(null)
        const r = await requestPasswordReset(username)
        if (r === 'sent') setSent(true); else setError('unavailable')
      } else if (isLive) {
        const r = await signInWithEmail(username, password)
        if (r !== 'ok' && r !== 'pending') setError(r)
      } else if (!(await signIn(username, password))) setError('invalid')
    } catch { setError('unavailable') } finally { setBusy(false) }
  }
  const errorText = error === 'inactive' ? 'staff.login.inactive' : error === 'unavailable' ? 'staff.login.unavailable' : 'staff.login.error'

  return (
    <div className="relative flex min-h-dvh flex-col bg-slate-deep px-4 py-6 text-white">
      <div className="grain absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between">
        <Link to="/" aria-label={t('nav.home')}><Logo className="h-9" /></Link>
        <LangSwitch />
      </div>
      <main id="main" className="relative mx-auto my-auto w-full max-w-md py-10">
        {isLive && signup ? <SignupForm onBack={() => setSignup(false)} /> : <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 text-ink shadow-2xl sm:p-8">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-slate text-gold">
            <Icon name="shield" size={22} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">{t('staff.login.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('staff.login.hint')}</p>
          <div className="mt-6 grid gap-4">
            {forgot && <p className="text-sm text-muted">{t('staff.login.forgotHint')}</p>}
            {sent && <Notice tone="ok">{t('staff.login.resetSent')}</Notice>}
            {error && <Notice tone="bad">{t(errorText)}</Notice>}
            <TextField
              label={t(isLive ? 'staff.login.email' : 'staff.login.username')}
              dir="ltr"
              type={isLive ? 'email' : 'text'}
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(null); setSent(false) }}
            />
            {!forgot && <div className="relative">
              <TextField
                label={t('staff.login.password')}
                dir="ltr"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                className="pe-12"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                aria-label={show ? t('staff.login.hide') : t('staff.login.show')}
                aria-pressed={show}
                className="absolute end-1 top-[30px] inline-flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink"
              >
                <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>}
            <Button type="submit" size="lg" disabled={busy || !username || (!forgot && !password)}>
              {forgot ? t('staff.login.sendReset') : busy ? t('staff.login.checking') : t('staff.login.submit')}
            </Button>
            {isLive && (
              <button type="button" onClick={() => { setForgot(v => !v); setError(null); setSent(false) }} className="min-h-11 text-start text-sm font-semibold text-slate hover:text-ink">
                {forgot ? t('staff.login.backToSignIn') : t('staff.login.forgot')}
              </button>
            )}
            {isLive && !forgot && <GoogleButton />}
            {isLive && !forgot && (
              <button type="button" onClick={() => setSignup(true)} className="min-h-11 text-sm font-semibold text-navy hover:underline">{t('staff.login.newHere')}</button>
            )}
          </div>
          {!isLive && <p className="mt-5 text-xs text-muted">{t('staff.login.prototype')}</p>}
        </form>}
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-mist hover:text-white">
          <Icon name="chevron" size={15} className="rotate-180" />
          {t('staff.login.backToSite')}
        </Link>
      </main>
    </div>
  )
}
