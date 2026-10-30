// Downloads team photos listed in scripts/team-source.json into .cache/team-raw (untrusted, not committed).
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'

const list = JSON.parse(readFileSync('scripts/team-source.json', 'utf8'))
mkdirSync('.cache/team-raw', { recursive: true })
const todo = list.filter(([, , , p]) => {
  const f = `.cache/team-raw/${p.split('/').pop()}`
  return !existsSync(f) || statSync(f).size === 0
})
let ok = 0
const fail = []
async function get([, name, , p]) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://mg-visa.com/wp-content/uploads/${p}`, { signal: AbortSignal.timeout(45000) })
      if (!r.ok) throw new Error(String(r.status))
      writeFileSync(`.cache/team-raw/${p.split('/').pop()}`, Buffer.from(await r.arrayBuffer()))
      ok++
      return
    } catch (e) {
      if (attempt === 2) fail.push(`${name}: ${e.message}`)
    }
  }
}
for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(get))
console.log(`fetched ${ok}/${todo.length}`, fail)
