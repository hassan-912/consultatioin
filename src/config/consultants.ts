import type { Consultant } from '../domain/types'
import { programs } from './programs'
import { bios } from './bios'

type Seed = Pick<Consultant, 'id' | 'name' | 'branchId' | 'experienceYears'> &
  Partial<Pick<Consultant, 'title' | 'experienceLabel' | 'nameNeedsConfirmation' | 'hidden' | 'price'>>

// Names, branches and years come from the company brief; titles and photos match mg-visa.com/about-us.
// Every consultant handles every program.
const make = (s: Seed): Consultant => ({
  programs: programs.map(p => p.id),
  title: null,
  photo: null,
  videoUrl: null,
  languages: null,
  qualifications: null,
  demoPrograms: true,
  ...s,
  bio: bios[s.id] ?? null,
})

export const consultants: Consultant[] = [
  make({
    id: 'mohamed-gamal',
    name: { en: 'Mohamed Gamal', ar: 'محمد جمال' },
    title: { en: 'Senior Immigration Specialist & Contract Manager', ar: 'أخصائي هجرة أول ومدير التعاقدات' },
    branchId: 'nasr-city',
    experienceYears: 5,
  }),
  make({
    id: 'ahmed-salama',
    name: { en: 'Ahmed Salama', ar: 'أحمد سلامة' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 3,
    experienceLabel: { en: '3+', ar: '+3' },
  }),
  make({
    id: 'ahmed-khalil',
    name: { en: 'Ahmed Khalil', ar: 'أحمد خليل' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 1.5,
  }),
  make({
    id: 'mohamed-esmail',
    name: { en: 'Mohamed Esmail', ar: 'محمد إسماعيل' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'nasr-city',
    experienceYears: 2,
    nameNeedsConfirmation: true,
  }),
  make({
    id: 'ahmed-tarek',
    name: { en: 'Ahmed Tarek', ar: 'أحمد طارق' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'sheikh-zayed',
    experienceYears: 3,
  }),
  make({
    id: 'mohamed-salah',
    name: { en: 'Mohamed Salah', ar: 'محمد صلاح' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'sheikh-zayed',
    experienceYears: 1.5,
  }),
  make({
    id: 'mohamed-abdelaziz',
    name: { en: 'Mohamed Abdelaziz', ar: 'محمد عبد العزيز' },
    title: { en: 'Immigration Specialist', ar: 'أخصائي هجرة' },
    branchId: 'dubai',
    experienceYears: 2,
  }),
  // Payment test only: 5 EGP, online, not listed for customers. Open #/consultant/test-ek-q7m4x9 to use it.
  // Remove it here and on the server (see migration 0033) when testing is done.
  make({
    id: 'test-ek-q7m4x9',
    name: { en: 'Payment test', ar: 'اختبار الدفع' },
    title: { en: 'Internal test — 5 EGP', ar: 'اختبار داخلي — ٥ ج.م' },
    branchId: 'nasr-city',
    experienceYears: 0,
    hidden: true,
    price: 5,
  }),
]
