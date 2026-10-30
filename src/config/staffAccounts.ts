// Prototype-only staff accounts. Passwords are stored as SHA-256 hashes; the plain values are in
// docs/demo-staff-logins.md. Real authentication must live on a server before launch.
// Regenerate with: node scripts/make-staff-accounts.mjs
import type { StaffRole } from '../domain/types'

export interface StaffAccount { username: string; role: StaffRole; consultantId: string | null; passwordSha256: string }

export const staffAccounts: StaffAccount[] = [
  { username: 'admin', role: 'admin', consultantId: null, passwordSha256: 'e7de6065e7e14ed2b5734967f3b2313965e443f1ca11be881b3fda311122f7c3' },
  { username: 'finance', role: 'finance', consultantId: null, passwordSha256: '341acad1c7be8e68c65483170cd62c0211deaf1280eaf0af9c7c6eeaafff7338' },
  { username: 'reception', role: 'reception', consultantId: null, passwordSha256: '7bfadea0f8e27a9a3ff689f039d743331ca20e3ad225e9763cbee2c4f3842139' },
  { username: 'mohamed.gamal', role: 'consultant', consultantId: 'mohamed-gamal', passwordSha256: '34cf217e6d8b30efa3e14998feef398345f11fafaa87326638cd7db4e382b7be' },
  { username: 'ahmed.salama', role: 'consultant', consultantId: 'ahmed-salama', passwordSha256: 'ec6046e821a29b9e716def3eeaf4d568b57c88343aab73d37c5b129ada4a1400' },
  { username: 'ahmed.khalil', role: 'consultant', consultantId: 'ahmed-khalil', passwordSha256: '2a6c0d9c0fc573f647cf791f287a3ca668f9e3cab569b2e763e38c464ca75548' },
  { username: 'mohamed.esmail', role: 'consultant', consultantId: 'mohamed-esmail', passwordSha256: 'dfe80e5f725179157a2f0cd42bdf3e3b440e066ec5795154328a045dfa99661e' },
  { username: 'ahmed.tarek', role: 'consultant', consultantId: 'ahmed-tarek', passwordSha256: '27051a7925f8d9c0069a2c9b25092485b43e7c6906c06915af607ad7032acb48' },
  { username: 'mohamed.salah', role: 'consultant', consultantId: 'mohamed-salah', passwordSha256: '6cfcd7bf1100c6b5270003d677efc23d036c931bb829a9973a51b124365a930d' },
  { username: 'mohamed.abdelaziz', role: 'consultant', consultantId: 'mohamed-abdelaziz', passwordSha256: '0a1f0b524a1b940213adc27d2083dad30d7134ea7666776f173244c5385e18d3' },
]
