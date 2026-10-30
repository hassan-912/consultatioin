// Compresses downloaded team photos (.cache/team-raw) into small portrait WebPs in src/assets/team.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const key = f => f.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const list = JSON.parse(readFileSync('scripts/team-source.json', 'utf8'))
mkdirSync('src/assets/team', { recursive: true })
let done = 0
const missing = []
for (const [, name, , p] of list) {
  const file = p.split('/').pop()
  const src = `.cache/team-raw/${file}`
  if (!existsSync(src)) { missing.push(name); continue }
  await sharp(src).resize(240, 300, { fit: 'cover', position: 'top' }).webp({ quality: 68 }).toFile(`src/assets/team/${key(file)}.webp`)
  done++
}
console.log(`built ${done} photos; missing ${missing.length}`, missing.join(', '))
