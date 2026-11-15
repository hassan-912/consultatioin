// k6 load test: visitors browsing the live site before booking. Read-only: nothing is booked or saved.
//
//   k6 run loadtest/browse.js                 full test: up to 50 visitors at once, about 4 minutes
//   k6 run -e SMOKE=1 loadtest/browse.js      1 visitor for 30 seconds, to check the script works
//   k6 run -e BASE=https://other.example loadtest/browse.js
//
// The Supabase address and public (publishable) key are read from the live site's JavaScript,
// the same way a visitor's browser gets them, so no key is stored here.
import http from 'k6/http'
import { check, group, sleep, fail } from 'k6'

const BASE = __ENV.BASE || 'https://consultatioin.vercel.app'
const CONSULTANTS = ['mohamed-gamal', 'ahmed-salama', 'ahmed-khalil', 'mohamed-esmail', 'ahmed-tarek', 'mohamed-salah', 'mohamed-abdelaziz']
const FORMATS = ['online', 'in-person']

export const options = {
  scenarios: {
    browse: __ENV.SMOKE
      ? { executor: 'constant-vus', vus: 1, duration: '30s' }
      : {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '1m', target: 20 },  // warm up
            { duration: '30s', target: 50 }, // climb to peak
            { duration: '2m', target: 50 },  // hold the peak
            { duration: '30s', target: 0 },  // wind down
          ],
          gracefulRampDown: '10s',
        },
  },
  thresholds: {
    // Pass/fail limits: 95% of database calls under 800 ms, pages under 1 s, under 1% failures.
    'http_req_duration{kind:api}': ['p(95)<800'],
    'http_req_duration{kind:page}': ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  const html = http.get(`${BASE}/`).body
  const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map(m => m[0])
  for (const src of scripts) {
    const js = http.get(`${BASE}${src}`).body
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/) || js.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)
    if (url && key) return { api: `${url[0]}/rest/v1/rpc`, key: key[0] }
  }
  fail('Could not find the Supabase address and public key in the site JavaScript')
}

const rpc = (cfg, name, args, label) =>
  http.post(`${cfg.api}/${name}`, JSON.stringify(args), {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    tags: { kind: 'api', name: label || name },
  })

const pick = a => a[Math.floor(Math.random() * a.length)]
const isoDate = d => d.toISOString().slice(0, 10)

export default function (cfg) {
  group('home page', () => {
    const r = http.get(`${BASE}/`, { tags: { kind: 'page', name: 'home' } })
    check(r, { 'home 200': x => x.status === 200 })
    const m = rpc(cfg, 'public_consultant_metadata', {})
    check(m, { 'consultants list 200': x => x.status === 200 })
  })
  sleep(1 + Math.random() * 2)

  const id = pick(CONSULTANTS)
  group('consultant profile', () => {
    const p = http.get(`${BASE}/videos/consultants/${id === 'mohamed-abdelaziz' ? 'mohamed-gamal' : id}.webp`, { tags: { kind: 'page', name: 'video poster' } })
    check(p, { 'poster 200': x => x.status === 200 })
    const r = rpc(cfg, 'public_consultant_reviews', { p_consultant_id: id })
    check(r, { 'reviews 200': x => x.status === 200 })
  })
  sleep(2 + Math.random() * 3)

  group('pick a time', () => {
    const format = pick(FORMATS)
    const day = new Date()
    for (let i = 0; i < 3; i++) {
      day.setUTCDate(day.getUTCDate() + 1)
      const r = rpc(cfg, 'available_slots', { p_consultant_id: id, p_date: isoDate(day), p_format: format })
      check(r, { 'slots 200': x => x.status === 200 })
      sleep(0.5 + Math.random())
    }
  })
  sleep(1 + Math.random() * 2)
}
