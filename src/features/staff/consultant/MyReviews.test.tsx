import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from '../StaffApp'
import { useAppStore } from '../../../store/useAppStore'
import { loginAs } from '../../../test/loginAs'
import { resetReviewWatch } from './reviewAlerts'

const review = (status: 'pending' | 'approved' | 'rejected', comment: string, consultantId = 'ahmed-khalil') =>
  ({ rating: 5, comment, name: 'Sara', at: Date.now(), consultantId, status })

const openStaff = (path = '/staff/my-reviews') => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>,
)

beforeEach(() => {
  resetReviewWatch()
  useAppStore.getState().setLang('en')
  useAppStore.setState({
    bookings: {}, audit: [], seeded: true, timeOffsetMs: 0,
    reviews: { p1: review('pending', 'waiting one'), a1: review('approved', 'live one'), o1: review('pending', 'not mine', 'mohamed-gamal') },
  })
})
afterEach(() => vi.useRealTimers())

test('lists only pending reviews under Pending', async () => {
  loginAs('consultant', 'ahmed-khalil')
  openStaff()
  expect(await screen.findByText('waiting one')).toBeInTheDocument()
  expect(screen.queryByText('live one')).toBeNull()
  expect(screen.queryByText('not mine')).toBeNull()
})

test('Show on site calls setReviewStatus(id, "approved") and moves it to On the site', async () => {
  loginAs('consultant', 'ahmed-khalil')
  openStaff()
  fireEvent.click(await screen.findByRole('button', { name: 'Show on site' }))
  await screen.findByText('No reviews here')
  expect(useAppStore.getState().reviews.p1.status).toBe('approved')
  fireEvent.click(screen.getByRole('tab', { name: /On the site/ }))
  expect(await screen.findByText('waiting one')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: "Don't show" })).toHaveLength(2)
})

test('first load does not pop up for reviews already pending, but the badge shows their count', async () => {
  loginAs('consultant', 'ahmed-khalil')
  openStaff('/staff')
  expect(await screen.findByLabelText('Reviews waiting for you: 1')).toBeInTheDocument()
  expect(screen.queryByText('A customer left feedback about you')).toBeNull()
})

test('a new pending review after load shows "A customer left feedback about you"', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  loginAs('consultant', 'ahmed-khalil')
  openStaff('/staff')
  await screen.findByLabelText('Reviews waiting for you: 1')
  useAppStore.setState(s => ({ reviews: { ...s.reviews, n1: review('pending', 'brand new') } }))
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(await screen.findByText('A customer left feedback about you')).toBeInTheDocument()
  expect(screen.getByLabelText('Reviews waiting for you: 2')).toBeInTheDocument()
})

test('non-consultant roles do not see the Reviews nav entry or the notice', async () => {
  loginAs('finance')
  openStaff('/staff')
  expect(await screen.findByRole('navigation')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /My reviews/ })).toBeNull()
  expect(screen.queryByText('A customer left feedback about you')).toBeNull()
})
