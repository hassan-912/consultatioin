import type { L10n, ProgramId } from '../domain/types'

export const programs: { id: ProgramId; name: L10n }[] = [
  { id: 'immigration', name: { en: 'Immigration', ar: 'الهجرة' } },
  { id: 'job-seeking', name: { en: 'Job seeking', ar: 'البحث عن عمل' } },
  { id: 'education', name: { en: 'Education', ar: 'الدراسة' } },
  { id: 'investment', name: { en: 'Investment', ar: 'الاستثمار' } },
  { id: 'tourism', name: { en: 'Tourism', ar: 'السياحة' } },
]

export const programName = (id: ProgramId) => programs.find(p => p.id === id)!.name
