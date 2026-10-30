// Compresses downloaded team photos (.cache/team-raw) into small portrait WebPs in src/assets/team.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const key = f => f.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const list = JSON.parse(readFileSync('scripts/team-source.json', 'utf8'))
mkdirSync('src/assets/team/head', { recursive: true })
const consultants = new Set(['Mohamed Gamal', 'Ahmed Salama', 'Ahmed Khalil', 'Mohamed Esmail', 'Ahmed Tarek', 'Mohamed Salah', 'Mohamed Abd El Aziz'])
let done = 0
const missing = []
for (const [, name, , p] of list) {
  const file = p.split('/').pop()
  const src = `.cache/team-raw/${file}`
  if (!existsSync(src)) { missing.push(name); continue }
  await sharp(src).resize(360, 450, { fit: 'cover', position: 'top' }).webp({ quality: 80 }).toFile(`src/assets/team/${key(file)}.webp`)
  // Consultants also get a tight head-and-shoulders square for avatars, so small sizes stay sharp.
  if (consultants.has(name)) {
    const { width, height } = await sharp(src).metadata()
    const side = Math.round(Math.min(width * 0.7, height * 0.6))
    const left = Math.round((width - side) / 2)
    const top = Math.round(height * 0.04)
    await sharp(src).extract({ left, top, width: side, height: side }).resize(400, 400).webp({ quality: 84 }).toFile(`src/assets/team/head/${key(file)}.webp`)
  }
  done++
}
console.log(`built ${done} photos; missing ${missing.length}`, missing.join(', '))
