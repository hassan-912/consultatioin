import type { Consultant } from '../domain/types'

type Seed = Pick<Consultant, 'id' | 'name' | 'branchId' | 'experienceYears' | 'programs'> &
  Partial<Pick<Consultant, 'title' | 'experienceLabel' | 'nameNeedsConfirmation'>>

// Names, branches and years come from the company brief; titles and photos match mg-visa.com/about-us.
// Program assignments are demo data (demoPrograms: true) until supplied.
const make = (s: Seed): Consultant => ({
  title: null,
  photo: null,
  bio: null,
  videoUrl: null,
  languages: null,
  qualifications: null,
  demoPrograms: true,
  ...s,
})

export const consultants: Consultant[] = [
  make({
    id: 'mohamed-gamal',
    name: { en: 'Mohamed Gamal', ar: 'محمد جمال' },
    title: { en: 'Senior Immigration Specialist & Contract Manager', ar: 'أخصائي هجرة أول ومدير التعاقدات' },
    branchId: 'nasr-city',
    experienceYears: 5,
    programs: ['immigration', 'investment', 'job-seeking'],
  }),
  make({
    id: 'ahmed-salama',
    name: { en: 'Ahmed Salama', ar: 'أحمد سلامة' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 3,
    experienceLabel: { en: '3+', ar: '+3' },
    programs: ['immigration', 'job-seeking'],
  }),
  make({
    id: 'ahmed-khalil',
    name: { en: 'Ahmed Khalil', ar: 'أحمد خليل' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 1.5,
    programs: ['education', 'tourism'],
  }),
  make({
    id: 'mohamed-esmail',
    name: { en: 'Mohamed Esmail', ar: 'محمد إسماعيل' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 2,
    nameNeedsConfirmation: true,
    programs: ['education', 'job-seeking'],
  }),
  make({
    id: 'ahmed-tarek',
    name: { en: 'Ahmed Tarek', ar: 'أحمد طارق' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'sheikh-zayed',
    experienceYears: 3,
    programs: ['immigration', 'investment'],
  }),
  make({
    id: 'mohamed-salah',
    name: { en: 'Mohamed Salah', ar: 'محمد صلاح' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'sheikh-zayed',
    experienceYears: 1.5,
    programs: ['job-seeking', 'tourism'],
  }),
  make({
    id: 'mohamed-abdelaziz',
    name: { en: 'Mohamed Abdelaziz', ar: 'محمد عبد العزيز' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'dubai',
    experienceYears: 2,
    programs: ['immigration', 'education', 'tourism'],
  }),
]
