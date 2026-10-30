import type { CountryCode, L10n, ProgramId } from '../domain/types'

export const programs: { id: ProgramId; name: L10n }[] = [
  { id: 'immigration', name: { en: 'Immigration', ar: 'الهجرة' } },
  { id: 'employment', name: { en: 'Employment', ar: 'العمل' } },
  { id: 'job-seeking', name: { en: 'Job seeking', ar: 'البحث عن عمل' } },
  { id: 'education', name: { en: 'Education', ar: 'الدراسة' } },
  { id: 'investment', name: { en: 'Investment', ar: 'الاستثمار' } },
  { id: 'tourism', name: { en: 'Tourism', ar: 'السياحة' } },
]

export const countries: { id: CountryCode; name: L10n; flag: string }[] = [
  { id: 'CA', name: { en: 'Canada', ar: 'كندا' }, flag: '🇨🇦' },
  { id: 'AU', name: { en: 'Australia', ar: 'أستراليا' }, flag: '🇦🇺' },
  { id: 'NZ', name: { en: 'New Zealand', ar: 'نيوزيلندا' }, flag: '🇳🇿' },
]

export const programName = (id: ProgramId) => programs.find(p => p.id === id)!.name
export const countryById = (id: CountryCode) => countries.find(c => c.id === id)!
