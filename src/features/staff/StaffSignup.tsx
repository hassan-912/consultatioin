import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { finishOAuthReturn, restoreStaffSession, signInWithGoogle, signOutStaff, signUpWithEmail } from '../../store/liveAuth'
import { Logo } from '../../components/Logo'
import { LangSwitch } from '../../components/LangSwitch'
import { TextField } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'

/** Dark full-page frame shared by the sign-in, sign-up, pending and return screens. */
export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useT()
  return (
    <div className="relative flex min-h-dvh flex-col bg-slate-deep px-4 py-6 text-white">
      <div className="grain absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-md items-center justify-between">
        <Link to="/" aria-label={t('nav.home')}><Logo className="h-9" /></Link>
        <LangSwitch />
      </div>
      <main id="main" className="relative mx-auto my-auto w-full max-w-md py-10">{children}</main>
    </div>
  )
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
)

/** "Continue with Google" plus an "or" divider; Google sends the person back to /#/staff/oauth. */
export function GoogleButton() {
  const { t } = useT()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted"><span className="h-px flex-1 bg-line" />{t('staff.login.or')}<span className="h-px flex-1 bg-line" /></div>
      {failed && <Notice tone="bad">{t('staff.login.googleUnavailable')}</Notice>}
      <button type="button" disabled={busy}
        onClick={async () => { setBusy(true); setFailed(false); if (await signInWithGoogle() === 'unavailable') { setFailed(true); setBusy(false) } }}
        className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl border-2 border-line bg-white px-4 font-semibold text-ink hover:border-mist disabled:opacity-60">
        <GoogleMark />{t('staff.login.google')}
      </button>
    </div>
  )
}

/** Self sign-up with email and password. Creates a login only; an admin approves access. */
export function SignupForm({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'confirm' | 'exists' | 'weak' | 'unavailable' | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (f.password.length < 8) { setResult('weak'); return }
    setBusy(true); setResult(null)
    try {
      const r = await signUpWithEmail(f.name, f.email, f.password)
      if (r !== 'pending') setResult(r)
    } finally { setBusy(false) }
  }
  const message = result === 'confirm' ? 'staff.login.signupConfirm' : result === 'exists' ? 'staff.login.signupExists'
    : result === 'weak' ? 'staff.login.signupWeak' : 'staff.login.unavailable'
  return (
    <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 text-ink shadow-2xl sm:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-slate text-gold"><Icon name="user" size={22} /></span>
      <h1 className="mt-4 text-2xl font-semibold">{t('staff.login.signupTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('staff.login.signupHint')}</p>
      <div className="mt-6 grid gap-4">
        {result && <Notice tone={result === 'confirm' ? 'ok' : 'bad'}>{t(message)}</Notice>}
        {result !== 'confirm' && (
          <>
            <TextField label={t('staff.login.name')} dir="auto" autoComplete="name" value={f.name} maxLength={100}
              onChange={e => { setF(v => ({ ...v, name: e.target.value })); setResult(null) }} />
            <TextField label={t('staff.login.email')} dir="ltr" type="email" autoComplete="email" autoCapitalize="none" value={f.email}
              onChange={e => { setF(v => ({ ...v, email: e.target.value })); setResult(null) }} />
            <TextField label={t('staff.login.newPassword')} dir="ltr" type="password" autoComplete="new-password" value={f.password}
              onChange={e => { setF(v => ({ ...v, password: e.target.value })); setResult(null) }} />
            <Button type="submit" size="lg" disabled={busy || !f.name.trim() || !f.email.trim() || !f.password}>
              {busy ? t('staff.login.checking') : t('staff.login.signupSubmit')}
            </Button>
            <GoogleButton />
          </>
        )}
        <button type="button" onClick={onBack} className="min-h-11 text-start text-sm font-semibold text-slate hover:text-ink">{t('staff.login.haveAccount')}</button>
      </div>
    </form>
  )
}

/** Signed up but not approved yet: nothing in the staff app opens until an admin gives them a role. */
export function StaffPending() {
  const { t } = useT()
  const pending = useAppStore(s => s.staffPending)!
  const [busy, setBusy] = useState(false)
  const [still, setStill] = useState(false)
  const check = async () => {
    setBusy(true); setStill(false)
    try { if (await restoreStaffSession() === 'pending') setStill(true) } finally { setBusy(false) }
  }
  return (
    <AuthFrame>
      <div className="rounded-3xl bg-white p-6 text-ink shadow-2xl sm:p-8">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gold-soft text-gold-deep"><Icon name="clock" size={22} /></span>
        <h1 className="mt-4 text-2xl font-semibold">{t('staff.login.pendingTitle')}</h1>
        <p className="mt-2 text-sm text-slate">{t('staff.login.pendingBody', { name: pending.name ? `, ${pending.name}` : '', email: pending.email })}</p>
        {still && <p role="status" className="mt-3 text-sm font-semibold text-warn">{t('staff.login.stillPending')}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void check()}>{t('staff.login.checkAgain')}</Button>
          <Button variant="ghost" onClick={() => void signOutStaff()}>{t('staff.login.signOut')}</Button>
        </div>
      </div>
    </AuthFrame>
  )
}

/** /#/staff/oauth: Google (or an email confirmation) lands here with tokens; they become the session. */
export function StaffOAuthReturn() {
  const { t } = useT()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void finishOAuthReturn(window.location.href).then(r => {
      if (!active) return
      // Tokens must not linger in the address bar or history.
      window.history.replaceState(null, '', `${window.location.pathname}#/staff`)
      if (r === 'invalid' || r === 'unavailable' || r === 'none') setFailed(true)
      else navigate('/staff', { replace: true })
    })
    return () => { active = false }
  }, [navigate])
  return (
    <AuthFrame>
      <div className="rounded-3xl bg-white p-6 text-ink shadow-2xl sm:p-8">
        {failed ? (
          <>
            <Notice tone="bad">{t('staff.login.returnFailed')}</Notice>
            <Link to="/staff" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-slate hover:text-ink">{t('staff.login.backToSignIn')}</Link>
          </>
        ) : <p role="status" className="text-sm text-muted">{t('staff.login.returning')}</p>}
      </div>
    </AuthFrame>
  )
}
