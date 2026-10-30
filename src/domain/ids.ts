// No 0/O/1/I so references read cleanly over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function makeReference(): string {
  const chars = Array.from(randomBytes(8), b => ALPHABET[b % ALPHABET.length])
  return `MG-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/** 128-bit unguessable token for QR codes and manage links. Carries no personal data. */
export function makeToken(): string {
  return Array.from(randomBytes(16), b => b.toString(16).padStart(2, '0')).join('')
}
