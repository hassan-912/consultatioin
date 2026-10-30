import { team } from '../../config/team'

// Compressed team photos (see scripts/build-team-photos.mjs), keyed by the original file name.
const files = import.meta.glob<string>('../../assets/team/*.webp', { eager: true, import: 'default' })

const byName = new Map(Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.webp$/, ''), url]))

export const photoKey = (photoFile: string) => photoFile.replace(/\.[a-z]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function consultantPhoto(consultantId: string): string | null {
  const m = team.find(x => x.consultantId === consultantId)
  return m ? teamPhoto(m.photoFile) : null
}

export function teamPhoto(photoFile: string): string | null {
  return byName.get(photoKey(photoFile)) ?? null
}
