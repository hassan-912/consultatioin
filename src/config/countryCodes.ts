/** Phone country codes for the booking form. Names come from the browser (Intl.DisplayNames) in the page language. */
export interface CountryCode { iso: string; dial: string }

/** Shown first, in this order: where most clients are. */
const TOP = ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO']

const ALL: [string, string][] = [
  ['AF', '93'], ['AL', '355'], ['DZ', '213'], ['AD', '376'], ['AO', '244'], ['AR', '54'], ['AM', '374'], ['AU', '61'],
  ['AT', '43'], ['AZ', '994'], ['BH', '973'], ['BD', '880'], ['BY', '375'], ['BE', '32'], ['BJ', '229'], ['BO', '591'],
  ['BA', '387'], ['BW', '267'], ['BR', '55'], ['BN', '673'], ['BG', '359'], ['BF', '226'], ['BI', '257'], ['KH', '855'],
  ['CM', '237'], ['CA', '1'], ['CF', '236'], ['TD', '235'], ['CL', '56'], ['CN', '86'], ['CO', '57'], ['KM', '269'],
  ['CG', '242'], ['CD', '243'], ['CR', '506'], ['CI', '225'], ['HR', '385'], ['CU', '53'], ['CY', '357'], ['CZ', '420'],
  ['DK', '45'], ['DJ', '253'], ['DO', '1'], ['EC', '593'], ['EG', '20'], ['SV', '503'], ['ER', '291'], ['EE', '372'],
  ['ET', '251'], ['FI', '358'], ['FR', '33'], ['GA', '241'], ['GM', '220'], ['GE', '995'], ['DE', '49'], ['GH', '233'],
  ['GR', '30'], ['GT', '502'], ['GN', '224'], ['HT', '509'], ['HN', '504'], ['HK', '852'], ['HU', '36'], ['IS', '354'],
  ['IN', '91'], ['ID', '62'], ['IR', '98'], ['IQ', '964'], ['IE', '353'], ['IT', '39'], ['JM', '1'], ['JP', '81'],
  ['JO', '962'], ['KZ', '7'], ['KE', '254'], ['KW', '965'], ['KG', '996'], ['LA', '856'], ['LV', '371'], ['LB', '961'],
  ['LS', '266'], ['LR', '231'], ['LY', '218'], ['LI', '423'], ['LT', '370'], ['LU', '352'], ['MO', '853'], ['MG', '261'],
  ['MW', '265'], ['MY', '60'], ['MV', '960'], ['ML', '223'], ['MT', '356'], ['MR', '222'], ['MU', '230'], ['MX', '52'],
  ['MD', '373'], ['MC', '377'], ['MN', '976'], ['ME', '382'], ['MA', '212'], ['MZ', '258'], ['MM', '95'], ['NA', '264'],
  ['NP', '977'], ['NL', '31'], ['NZ', '64'], ['NI', '505'], ['NE', '227'], ['NG', '234'], ['KP', '850'], ['MK', '389'],
  ['NO', '47'], ['OM', '968'], ['PK', '92'], ['PS', '970'], ['PA', '507'], ['PG', '675'], ['PY', '595'], ['PE', '51'],
  ['PH', '63'], ['PL', '48'], ['PT', '351'], ['QA', '974'], ['RO', '40'], ['RU', '7'], ['RW', '250'], ['SA', '966'],
  ['SN', '221'], ['RS', '381'], ['SC', '248'], ['SL', '232'], ['SG', '65'], ['SK', '421'], ['SI', '386'], ['SO', '252'],
  ['ZA', '27'], ['KR', '82'], ['SS', '211'], ['ES', '34'], ['LK', '94'], ['SD', '249'], ['SR', '597'], ['SE', '46'],
  ['CH', '41'], ['SY', '963'], ['TW', '886'], ['TJ', '992'], ['TZ', '255'], ['TH', '66'], ['TG', '228'], ['TT', '1'],
  ['TN', '216'], ['TR', '90'], ['TM', '993'], ['UG', '256'], ['UA', '380'], ['AE', '971'], ['GB', '44'], ['US', '1'],
  ['UY', '598'], ['UZ', '998'], ['VE', '58'], ['VN', '84'], ['YE', '967'], ['ZM', '260'], ['ZW', '263'],
]

export const DEFAULT_COUNTRY = 'EG'

export const countryCodes: CountryCode[] = ALL.map(([iso, dial]) => ({ iso, dial: `+${dial}` }))

const byIso = new Map(countryCodes.map(c => [c.iso, c]))
export const dialOf = (iso: string) => (byIso.get(iso) ?? byIso.get(DEFAULT_COUNTRY)!).dial

/** The country a full number belongs to: the longest matching code; where several countries share it (+1, +7), the first listed wins. */
export function countryOfPhone(phone: string): string | null {
  const p = phone.replace(/[^\d+]/g, '')
  if (!p.startsWith('+')) return null
  let best: CountryCode | null = null
  const preferred = (c: CountryCode) => (c.dial === '+1' ? 'US' : c.dial === '+7' ? 'RU' : c.iso)
  for (const c of countryCodes) {
    if (p.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c
  }
  return best ? preferred(best) : null
}

const flag = (iso: string) => String.fromCodePoint(...[...iso].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))

/** Options for the select, Gulf and Egypt first, the rest sorted by name in the page language. */
export function countryOptions(lang: string): { iso: string; label: string }[] {
  let names: Intl.DisplayNames | null = null
  try { names = new Intl.DisplayNames([lang], { type: 'region' }) } catch { names = null }
  const name = (iso: string) => names?.of(iso) ?? iso
  const label = (c: CountryCode) => `${flag(c.iso)} ${c.dial} ${name(c.iso)}`
  const top = TOP.map(iso => byIso.get(iso)!)
  const rest = countryCodes.filter(c => !TOP.includes(c.iso)).sort((a, b) => name(a.iso).localeCompare(name(b.iso), lang))
  return [...top, ...rest].map(c => ({ iso: c.iso, label: label(c) }))
}
