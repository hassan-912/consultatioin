// The booking a customer left to pay on EasyKash. Kept on this device so the return page knows what to check
// without putting the booking's secret manage token in the URL EasyKash sees.
const KEY = 'mg-pay-pending'
const MAX_AGE_MS = 2 * 60 * 60 * 1000

export interface PendingPayment { token: string; consultantId: string; at: number }

export function rememberPayment(token: string, consultantId: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ token, consultantId, at: Date.now() })) } catch { /* private mode: return page shows "missing" */ }
}

export function pendingPayment(): PendingPayment | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingPayment | null
    return p && typeof p.token === 'string' && Date.now() - p.at < MAX_AGE_MS ? p : null
  } catch { return null }
}

export function forgetPayment() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
