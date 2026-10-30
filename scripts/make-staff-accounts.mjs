// Generates prototype staff accounts: hashed passwords for the app, plain ones in a doc for the owner.
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const accounts = [
  ['admin', 'admin', null],
  ['finance', 'finance', null],
  ['reception', 'reception', null],
  ['mohamed.gamal', 'consultant', 'mohamed-gamal'],
  ['ahmed.salama', 'consultant', 'ahmed-salama'],
  ['ahmed.khalil', 'consultant', 'ahmed-khalil'],
  ['mohamed.esmail', 'consultant', 'mohamed-esmail'],
  ['ahmed.tarek', 'consultant', 'ahmed-tarek'],
  ['mohamed.salah', 'consultant', 'mohamed-salah'],
  ['mohamed.abdelaziz', 'consultant', 'mohamed-abdelaziz'],
]
const alpha = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const password = () => Array.from(randomBytes(10), b => alpha[b % alpha.length]).join('')
const sha = s => createHash('sha256').update(s).digest('hex')
const rows = accounts.map(([username, role, consultantId]) => ({ username, role, consultantId, password: password() }))

const ts = `// Prototype-only staff accounts. Passwords are stored as SHA-256 hashes; the plain values are in
// docs/demo-staff-logins.md. Real authentication must live on a server before launch.
// Regenerate with: node scripts/make-staff-accounts.mjs
import type { StaffRole } from '../domain/types'

export interface StaffAccount { username: string; role: StaffRole; consultantId: string | null; passwordSha256: string }

export const staffAccounts: StaffAccount[] = [
${rows.map(r => `  { username: '${r.username}', role: '${r.role}', consultantId: ${r.consultantId ? `'${r.consultantId}'` : 'null'}, passwordSha256: '${sha(r.password)}' },`).join('\n')}
]
`
const sees = { admin: 'Everything', finance: 'Payment review, bookings, payment settings, audit', reception: 'Check-in, arrivals, bookings', consultant: 'Own calendar, bookings and records only' }
const md = `# Demo staff logins (prototype only)

Sign in from **Staff sign-in** (footer link, or the Team page). These accounts exist only in the prototype:
the browser compares a SHA-256 hash, which is **not** real security. Replace with server-side accounts before launch.

| Role | Username | Password | Can see |
|---|---|---|---|
${rows.map(r => `| ${r.role} | \`${r.username}\` | \`${r.password}\` | ${sees[r.role]} |`).join('\n')}
`
writeFileSync('src/config/staffAccounts.ts', ts)
writeFileSync('docs/demo-staff-logins.md', md)
console.log(`wrote ${rows.length} accounts`)
