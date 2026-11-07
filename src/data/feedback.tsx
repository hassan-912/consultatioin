import { useT, type TKey } from '../i18n'
import { HoldExpired, RepoError, SlotTaken } from './types'
import { useLiveData } from './liveState'

export function errorKey(error: unknown): TKey {
  if (error instanceof SlotTaken) return 'payment.slotTaken'
  if (error instanceof HoldExpired) return 'data.expired'
  const code = error instanceof RepoError ? error.code : ''
  const keys: Record<string, TKey> = { FORBIDDEN: 'data.forbidden', RATE_LIMITED: 'data.rateLimited', INVALID_INPUT: 'data.invalid', INVALID_TRANSITION: 'data.transition', UPLOAD_FAILED: 'data.upload', LIVE_CONFIG_MISSING: 'data.config', NOT_FOUND: 'ticket.notFound', PAYMENT_UNAVAILABLE: 'payment.unavailable', NOT_CONFIGURED: 'payment.unavailable' }
  return keys[code] ?? 'data.network'
}
export function reportActionError(error: unknown) { useLiveData.setState({ actionError: error }) }
export function DataStatus({ loading, error }: { loading?: boolean; error?: unknown }) {
  const { t } = useT()
  if (!loading && !error) return null
  return <p role={error ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-bad-soft text-bad' : 'bg-paper text-slate'}`}>{t(error ? errorKey(error) : 'data.loading')}</p>
}
export function ActionFeedback() {
  const { t } = useT()
  const error = useLiveData(s => s.actionError)
  return error ? <div className="fixed bottom-4 start-4 end-4 z-50 mx-auto max-w-xl rounded-xl bg-white p-2 shadow-lg"><DataStatus error={error} /><button type="button" className="mt-1 min-h-11 px-3 text-sm font-semibold text-slate" onClick={() => useLiveData.setState({ actionError: null })}>{t('nav.close')}</button></div> : null
}
