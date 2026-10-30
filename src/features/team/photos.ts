import { team } from '../../config/team'

// Compressed team photos (see scripts/build-team-photos.mjs), keyed by the original file name.
const files = import.meta.glob<string>('../../assets/team/*.webp', { eager: true, import: 'default' })

const heads = import.meta.glob<string>('../../assets/team/head/*.webp', { eager: true, import: 'default' })

const index = (g: Record<string, string>) => new Map(Object.entries(g).map(([path, url]) => [path.split('/').pop()!.replace(/\.webp$/, ''), url]))
const byName = index(files)
const headByName = index(heads)

export const photoKey = (photoFile: string) => photoFile.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function consultantPhoto(consultantId: string): string | null {
  const m = team.find(x => x.consultantId === consultantId)
  return m ? headByName.get(photoKey(m.photoFile)) ?? teamPhoto(m.photoFile) : null
}

export function teamPhoto(photoFile: string): string | null {
  return byName.get(photoKey(photoFile)) ?? null
}
