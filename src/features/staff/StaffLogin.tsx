import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'
import { signIn } from '../../store/auth'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { TextField } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'

export function StaffLogin() {
  const { t } = useT()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await signIn(username, password)
    setBusy(false)
    if (!ok) setError(true)
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
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-slate text-gold">
            <Icon name="shield" size={22} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">{t('staff.login.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('staff.login.hint')}</p>
          <div className="mt-6 grid gap-4">
            {error && <Notice tone="bad">{t('staff.login.error')}</Notice>}
            <TextField
              label={t('staff.login.username')}
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(false) }}
            />
            <div className="relative">
              <TextField
                label={t('staff.login.password')}
                dir="ltr"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false) }}
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
            </div>
            <Button type="submit" size="lg" disabled={busy || !username || !password}>
              {busy ? t('staff.login.checking') : t('staff.login.submit')}
            </Button>
          </div>
          <p className="mt-5 text-xs text-muted">{t('staff.login.prototype')}</p>
        </form>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-mist hover:text-white">
          <Icon name="chevron" size={15} className="rotate-180" />
          {t('staff.login.backToSite')}
        </Link>
      </main>
    </div>
  )
}
