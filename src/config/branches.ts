import type { Branch, BranchId } from '../domain/types'

const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

export const branches: Branch[] = [
  {
    id: 'nasr-city',
    name: { en: 'Nasr City', ar: 'مدينة نصر' },
    city: { en: 'Cairo, Egypt', ar: 'القاهرة، مصر' },
    address: {
      en: 'Cairo – Nasr City – Makram Ebeid Street – Delta Towers, Building 4, Section 2, 3rd Floor',
      ar: 'القاهرة – مدينة نصر – شارع مكرم عبيد – أبراج دلتا، مبنى 4، القطاع 2، الدور الثالث',
    },
    timeZone: 'Africa/Cairo',
    mapsUrl: maps('Delta Towers Makram Ebeid Street Nasr City Cairo'),
    country: 'EG',
  },
  {
    id: 'sheikh-zayed',
    name: { en: 'Sheikh Zayed', ar: 'الشيخ زايد' },
    city: { en: 'Giza, Egypt', ar: 'الجيزة، مصر' },
    address: {
      en: 'TRIVIUM ZAYED Building, Trivium Zayed Complex, Services Land (2), 3rd Neighborhood – 2nd District, in front of Capital Business, 2nd Floor, Unit A231',
      ar: 'مبنى TRIVIUM ZAYED، مجمع تريفيوم زايد، أرض الخدمات (2)، الحي الثالث – المجاورة الثانية، أمام كابيتال بيزنس، الدور الثاني، وحدة A231',
    },
    timeZone: 'Africa/Cairo',
    mapsUrl: maps('Trivium Zayed Complex Sheikh Zayed'),
    country: 'EG',
  },
  {
    id: 'dubai',
    name: { en: 'Dubai', ar: 'دبي' },
    city: { en: 'Dubai, UAE', ar: 'دبي، الإمارات' },
    address: {
      en: 'UAE – Dubai – Abuhail – Horalanz East – City Bay Business Center – Office 216 – Beside Canadian Hospital',
      ar: 'الإمارات – دبي – أبو هيل – هور العنز شرق – مركز سيتي باي للأعمال – مكتب 216 – بجوار المستشفى الكندي',
    },
    timeZone: 'Asia/Dubai',
    mapsUrl: maps('City Bay Business Center Abu Hail Dubai'),
    country: 'AE',
  },
  {
    // PENDING: address and consultants to be supplied by MG.
    id: 'qena',
    name: { en: 'Qena', ar: 'قنا' },
    city: { en: 'Qena, Egypt', ar: 'قنا، مصر' },
    address: { en: 'Address coming soon', ar: 'العنوان قريبًا' },
    timeZone: 'Africa/Cairo',
    mapsUrl: maps('Qena Egypt'),
    country: 'EG',
    comingSoon: true,
  },
]

export const branchById = (id: BranchId): Branch => branches.find(b => b.id === id)!
