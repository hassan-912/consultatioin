// LOCAL-ONLY regression runner for the daily-capacity lock (migration 0014).
// Needs the disposable PostgreSQL cluster built by .cache/test-db.mjs (127.0.0.1:55439) and a "db-results-verify_*" template
// database already migrated by that harness (run `node .cache/test-db.mjs` first). Talks only to 127.0.0.1; never to Supabase cloud.
// It always creates a NEW database from the template and retains it; nothing is deleted or reset.
// Usage: node scripts/concurrency-capacity.mjs   (exit 0 = all scenarios behaved; 1 = capacity race or deadlock seen)
import EmbeddedPostgres from '../.cache/pg-tools/node_modules/embedded-postgres/dist/index.js'
import { readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HOST = '127.0.0.1', PORT = 55439
const root = resolve(import.meta.dirname, '..')
const template = readdirSync(resolve(root, '.cache')).filter(f => /^db-results-verify_\d+\.txt$/.test(f)).sort().at(-1).match(/verify_\d+/)[0]
const pg = new EmbeddedPostgres({ databaseDir: resolve(root, '.cache/isolated-postgres-utf8'), port: PORT, user: 'postgres', password: 'local-test-only', persistent: true, postgresFlags: ['-h', HOST], onLog: () => {}, onError: () => {} })
const out = [], fails = [], clients = []
const log = s => { out.push(s); console.log(s) }
const check = (ok, msg) => { log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`); if (!ok) fails.push(msg) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const msg = r => r.error?.message
const state = r => (r.error ? r.error.message : 'ok')

try {
  await pg.start()
  const owner = pg.getPgClient('postgres', HOST); await owner.connect(); clients.push(owner)
  const db = `concurrency_${Date.now()}`
  await owner.query(`CREATE DATABASE ${db} TEMPLATE ${template}`)
  log(`template ${template}; new database ${db}`)
  const make = async () => { const c = pg.getPgClient(db, HOST); await c.connect(); clients.push(c); return c }
  const [a, b, admin] = [await make(), await make(), await make()]

  // Scratch copy only: every weekday open 10:00-18:00 Cairo, capacity 1.
  await admin.query(`INSERT INTO public.schedules (consultant_id, weekly, breaks, formats, max_per_day)
    SELECT 'mohamed-gamal', jsonb_object_agg(d::text, '[{"start":600,"end":1080}]'::jsonb), '[]', '{online,in-person}', 1 FROM generate_series(0,6) d
    ON CONFLICT (consultant_id) DO UPDATE SET weekly=excluded.weekly, breaks=excluded.breaks, formats=excluded.formats, max_per_day=1`)
  await admin.query(`UPDATE public.schedules SET max_per_day=1 WHERE consultant_id='mohamed-gamal'`)

  const at = async (n, hhmm) => (await admin.query(`SELECT ((now() at time zone 'Africa/Cairo')::date + $1::int + $2::time) at time zone 'Africa/Cairo' AS t`, [n, hhmm])).rows[0].t
  const det = p => JSON.stringify({ name: 'Concurrency fixture', phone: p, email: 'f@example.test', channel: 'email', lang: 'en' })
  const reserve = (c, s, phone) => c.query(`select public.reserve_slot('mohamed-gamal','online',$1,$2::jsonb) r`, [s, det(phone)])
  const dayWhere = `consultant_id='mohamed-gamal' AND (starts_at AT TIME ZONE 'Africa/Cairo')::date=(now() at time zone 'Africa/Cairo')::date+$1::int`
  const live = async n => Number((await admin.query(`SELECT count(*) FROM public.bookings WHERE ${dayWhere} AND status IN ('reserved','on-hold','confirmed','wrong-amount','duplicate')`, [n])).rows[0].count)

  // Two real sessions, each in an open transaction. A takes its place first; B is issued while A is still open.
  const race = async (opA, opB) => {
    await a.query('BEGIN'); await b.query('BEGIN')
    const ra = await opA(a).then(r => ({ r }), error => ({ error }))
    let settled = false
    const pb = opB(b).then(r => ({ r }), error => ({ error })).finally(() => { settled = true })
    await sleep(300)
    const waited = !settled
    await a.query('COMMIT')
    const rb = await pb
    await b.query(rb.error ? 'ROLLBACK' : 'COMMIT')
    return { ra, rb, waited }
  }
  const verdict = async (x, n, label) => {
    const c = await live(n)
    log(`${label}: A=${state(x.ra)}, B=${state(x.rb)}, B waited on A=${x.waited}, blocking on day=${c}`)
    check(!x.ra.error && msg(x.rb) === 'SLOT_TAKEN' && c === 1, `${label}: exactly one of two non-overlapping competitors succeeds, the other SLOT_TAKEN`)
  }

  // 1. same slot: exclusion constraint path stays safe
  { const s = await at(2, '10:00')
    const x = await race(c => reserve(c, s, '+201001000001'), c => reserve(c, s, '+201001000002'))
    check(!x.ra.error && msg(x.rb) === 'SLOT_TAKEN' && await live(2) === 1, `same-slot reserve: one success, other SLOT_TAKEN (B waited=${x.waited})`) }

  // 2. reserve vs reserve, non-overlapping slots, cap 1
  { const x = await race(async c => reserve(c, await at(3, '10:00'), '+201001000003'), async c => reserve(c, await at(3, '15:00'), '+201001000004'))
    await verdict(x, 3, 'reserve vs reserve') }

  // 3. reserve vs reschedule onto the same day (the moved booking lives on day 5)
  { const bk = (await reserve(admin, await at(5, '10:00'), '+201001000005')).rows[0].r
    const x = await race(async c => reserve(c, await at(4, '10:00'), '+201001000006'),
      async c => c.query(`select public.reschedule_booking($1,$2)`, [bk.manage_token, await at(4, '15:00')]))
    await verdict(x, 4, 'reserve vs reschedule')
    check(await live(5) === 1, 'refused reschedule left the booking on its original day') }

  // 4. reserve vs rejected resubmission
  { const bk = (await reserve(admin, await at(6, '10:00'), '+201001000007')).rows[0].r
    await admin.query(`UPDATE public.bookings SET status='rejected', hold_expires_at=null WHERE id=$1`, [bk.booking_id])
    const x = await race(async c => reserve(c, await at(6, '15:00'), '+201001000008'),
      c => c.query(`select public.submit_payment($1,'instapay','TXN-RACE')`, [bk.manage_token]))
    await verdict(x, 6, 'reserve vs rejected resubmission') }

  // 5. reserve vs late-transfer verification
  { const bk = (await reserve(admin, await at(7, '10:00'), '+201001000009')).rows[0].r
    await admin.query(`UPDATE public.bookings SET status='late-transfer', hold_expires_at=null WHERE id=$1`, [bk.booking_id])
    const x = await race(async c => reserve(c, await at(7, '15:00'), '+201001000010'),
      c => c.query(`select public.apply_transition($1,'verify','staff')`, [bk.booking_id]))
    await verdict(x, 7, 'reserve vs late-transfer verify') }

  // 6. stress: 12 parallel reserves on a cap-3 day over 6 connections, mixed with 3 reschedules onto it
  { await admin.query(`UPDATE public.schedules SET max_per_day=3 WHERE consultant_id='mohamed-gamal'`)
    const pool = []; for (let i = 0; i < 9; i++) pool.push(await make())
    const movers = []
    for (let i = 0; i < 3; i++) movers.push((await reserve(admin, await at(9, `1${i}:00`), `+2010020000${i}`)).rows[0].r)
    const hours = ['10:00', '10:45', '11:30', '12:15', '13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:15', '17:30']
    const times = []; for (const h of hours) times.push(await at(8, h))
    const jobs = times.map((t, i) => reserve(pool[i % 6], t, `+20100300${String(i).padStart(4, '0')}`).then(() => 'ok', e => e.message))
    movers.forEach((m, i) => jobs.push(pool[6 + i].query(`select public.reschedule_booking($1,$2)`, [m.manage_token, times[i * 4]]).then(() => 'ok', e => e.message)))
    const res = await Promise.all(jobs)
    const tally = res.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {})
    log(`stress outcomes: ${JSON.stringify(tally)}`)
    const day8 = await live(8)
    check(day8 <= 3, `stress: day 8 capacity 3 never exceeded (committed ${day8})`)
    check(Object.keys(tally).every(k => k === 'ok' || k === 'SLOT_TAKEN'), 'stress: no deadlock or unexpected error (only ok / SLOT_TAKEN)') }

  log(`Retained isolated database ${db}; no existing/cloud data deleted.`)
  writeFileSync(resolve(root, `.cache/${db}.txt`), out.join('\n'))
  process.exitCode = fails.length ? 1 : 0
} catch (e) { console.error(e.stack || e.message); process.exitCode = 1 }
finally { for (const c of clients.reverse()) await c.end().catch(() => {}); await pg.stop() }
