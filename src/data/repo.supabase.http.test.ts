import { createBackendClients } from '../lib/supabase'
import { createSupabaseRepo } from './supabase'

const url = process.env.SUPABASE_TEST_URL
// No fixture creation, login, time travel or write is allowed against a project URL.
// The full clock-driven shared contract needs a test-only fixture/clock driver that
// is not supplied by the hosted platform; SQL and transport tests cover it locally.
describe.skipIf(!url)('isolated HTTP smoke (requires an explicitly configured local Supabase stack)', () => {
  beforeAll(() => {
    if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) || process.env.SUPABASE_TEST_ISOLATED !== 'true') {
      throw new Error('HTTP tests require an explicitly isolated loopback Supabase stack')
    }
    if (!process.env.SUPABASE_TEST_PUBLISHABLE_KEY) throw new Error('SUPABASE_TEST_PUBLISHABLE_KEY required')
  })
  test('anonymous availability and unknown token cross the real HTTP boundary', async () => {
    const repo = createSupabaseRepo(createBackendClients(url!, process.env.SUPABASE_TEST_PUBLISHABLE_KEY!, fetch, 'mg-isolated-http-test'))
    expect(await repo.getByManageToken('f'.repeat(32))).toBeNull()
    expect(await repo.availableSlots('mohamed-gamal', '2099-01-01', 'online')).toBeInstanceOf(Array)
  })
})
