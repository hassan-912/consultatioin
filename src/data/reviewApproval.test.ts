import { createLocalRepo, resetLocalRepo } from './local'
import { RepoError } from './types'
import { useAppStore } from '../store/useAppStore'

const asStaff = (role: 'consultant' | 'admin' | 'finance', consultantId: string | null) =>
  useAppStore.setState({ staffSession: { username: 'u', role, consultantId } })

function seed() {
  useAppStore.setState({
    reviews: {
      b1: { rating: 4, comment: 'great', name: 'Sara', at: 2, consultantId: 'mohamed-gamal' },
      b2: { rating: 2, comment: 'meh', name: 'Omar', at: 1, consultantId: 'ahmed-salama' },
    },
  })
}

describe('review approval (local repo)', () => {
  beforeEach(() => { resetLocalRepo(); seed() })

  test('new review is pending and not public', async () => {
    const repo = createLocalRepo()
    expect((await repo.consultantReviews('mohamed-gamal')).count).toBe(0)
    asStaff('consultant', 'mohamed-gamal')
    expect((await repo.myReviews()).map(r => [r.id, r.status])).toEqual([['b1', 'pending']])
  })

  test('consultant approves own review -> public count 1', async () => {
    const repo = createLocalRepo()
    asStaff('consultant', 'mohamed-gamal')
    await repo.setReviewStatus('b1', 'approved')
    expect(await repo.consultantReviews('mohamed-gamal')).toMatchObject({ count: 1, average: 4 })
    await repo.setReviewStatus('b1', 'rejected')
    expect((await repo.consultantReviews('mohamed-gamal')).count).toBe(0)
  })

  test('consultant cannot set status on another consultant review -> FORBIDDEN', async () => {
    const repo = createLocalRepo()
    asStaff('consultant', 'mohamed-gamal')
    await expect(repo.setReviewStatus('b2', 'approved')).rejects.toEqual(new RepoError('FORBIDDEN'))
    asStaff('finance', null)
    await expect(repo.setReviewStatus('b1', 'approved')).rejects.toEqual(new RepoError('FORBIDDEN'))
    await expect(repo.myReviews()).rejects.toEqual(new RepoError('FORBIDDEN'))
  })

  test('admin may decide any review and sees its status', async () => {
    const repo = createLocalRepo()
    asStaff('admin', null)
    await repo.setReviewStatus('b2', 'approved')
    expect((await repo.staffReviews()).find(r => r.id === 'b2')?.status).toBe('approved')
  })
})
