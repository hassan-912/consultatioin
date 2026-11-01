import { useAppStore, todayIn } from './useAppStore'
import { en } from '../i18n/en'
import { ar } from '../i18n/ar'

const keysOf = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keysOf(v, `${p}${k}.`) : [`${p}${k}`]))

test('setLang switches document direction', () => {
  useAppStore.getState().setLang('ar')
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
  useAppStore.getState().setLang('en')
  expect(document.documentElement.dir).toBe('ltr')
})

test('language switch keeps filters and booking draft through rehydration', async () => {
  const s = useAppStore.getState()
  s.setFilters({ branch: 'dubai' })
  s.updateDraft({ step: 3, consultantId: 'mohamed-abdelaziz' })
  s.updateDetails({ name: 'Sara' })
  s.setLang('ar')

  // simulate a reload: wipe memory state (which also overwrites storage), then restore the saved snapshot
  const saved = localStorage.getItem('mg-proto-v1')!
  useAppStore.setState({ filters: { ...s.filters, branch: 'all' }, draft: { ...s.draft, step: 0 } })
  localStorage.setItem('mg-proto-v1', saved)
  await useAppStore.persist.rehydrate()

  const r = useAppStore.getState()
  expect(r.lang).toBe('ar')
  expect(r.filters.branch).toBe('dubai')
  expect(r.draft.step).toBe(3)
  expect(r.draft.details.name).toBe('Sara')
})

test('Arabic and English dictionaries have identical keys and no empty strings', () => {
  expect(keysOf(ar).sort()).toEqual(keysOf(en).sort())
  const values = (o: object): string[] => Object.values(o).flatMap(v => (typeof v === 'object' ? values(v) : [v]))
  expect(values(ar).every(v => v.trim().length > 0)).toBe(true)
})

test('spec labels are verbatim', () => {
  expect(en.directory.title).toBe('Choose your consultant')
  expect(ar.directory.title).toBe('اختر مستشارك')
  expect(ar.common.availableAppointments).toBe('المواعيد المتاحة')
  expect(ar.format.online).toBe('استشارة أونلاين')
  expect(ar.format['in-person']).toBe('استشارة في الفرع')
  expect(ar.status.confirmed).toBe('تم تأكيد الحجز')
  expect(ar.status['on-hold']).toBe('معلّق – الدفع قيد المراجعة')
  expect(ar.common.viewProfile).toBe('عرض الملف الشخصي')
  expect(ar.common.book).toBe('احجز استشارة')
  expect(ar.common.nextAvailable).toBe('أقرب موعد متاح')
  expect(ar.ticket.join).toBe('انضم للاستشارة')
  expect(ar.placeholder.bio).toBe('النبذة قيد الإعداد')
  expect(ar.common.demo).toBe('بيانات تجريبية')
})

test('Arabic plural categories for consultant counts', async () => {
  const { pluralCategory, translate } = await import('../i18n')
  const ar = (n: number) => translate('ar', `directory.count.${pluralCategory('ar', n)}`, { n })
  expect(ar(1)).toBe('مستشار واحد')
  expect(ar(2)).toBe('مستشاران')
  expect(ar(7)).toBe('7 مستشارين')
  expect(ar(11)).toBe('11 مستشارًا')
  expect(translate('en', `directory.count.${pluralCategory('en', 7)}`, { n: 7 })).toBe('7 consultants')
})

test('a saved date from an earlier day resets to today on reload; a future date is kept', async () => {
  const s = useAppStore.getState()
  const today = todayIn('Africa/Cairo')
  for (const [savedDate, expected] of [['2020-01-01', today], ['2999-12-31', '2999-12-31']]) {
    s.setFilters({ date: savedDate, branch: 'dubai' })
    const saved = localStorage.getItem('mg-proto-v1')!
    useAppStore.setState({ filters: { ...s.filters, date: 'x' } })
    localStorage.setItem('mg-proto-v1', saved)
    await useAppStore.persist.rehydrate()
    expect(useAppStore.getState().filters.date).toBe(expected)
    expect(useAppStore.getState().filters.branch).toBe('dubai')
  }
})
