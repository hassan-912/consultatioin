import { pageCuts } from './pageCuts'
import { splitStep } from './MgDocument'

test('a short document is one page', () => {
  expect(pageCuts([{ top: 0, bottom: 300 }], 300, 1000, 900)).toEqual([300])
})

test('pages break after the last whole block, never through one', () => {
  const blocks = [{ top: 0, bottom: 400 }, { top: 400, bottom: 950 }, { top: 950, bottom: 1500 }, { top: 1500, bottom: 1700 }]
  // First page fits 1000: cut after the block ending at 950. Next pages fit 900: 950 + 900 = 1850 ≥ total.
  expect(pageCuts(blocks, 1700, 1000, 900)).toEqual([950, 1700])
})

test('a block taller than a page is cut where the page ends', () => {
  expect(pageCuts([{ top: 0, bottom: 2500 }], 2500, 1000, 900)).toEqual([1000, 1900, 2500])
})

test('next steps keep who does them, in English and Arabic', () => {
  expect(splitStep('Client: send the statement')).toEqual({ owner: 'client', action: 'send the statement' })
  expect(splitStep('MG: book the appointment')).toEqual({ owner: 'mg', action: 'book the appointment' })
  expect(splitStep('العميل: إرسال كشف الحساب')).toEqual({ owner: 'client', action: 'إرسال كشف الحساب' })
  expect(splitStep('Bring two photos')).toEqual({ owner: null, action: 'Bring two photos' })
})
