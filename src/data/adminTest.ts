// An admin opens the payment-test consultant from the staff dashboard; the server only books admin-only
// consultants when the booking carries this key (readable by active admins only). Kept on the admin's device.
const KEY = 'mg-admin-test-key'

export function rememberAdminTestKey(key: string) {
  try { localStorage.setItem(KEY, key) } catch { /* private mode: the test booking will be refused */ }
}

export function adminTestKeyOnThisDevice(): string | undefined {
  try { return localStorage.getItem(KEY) ?? undefined } catch { return undefined }
}
