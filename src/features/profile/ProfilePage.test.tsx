import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProfilePage } from './ProfilePage'
import { useAppStore } from '../../store/useAppStore'

const open = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/consultant/${id}`]}>
      <Routes><Route path="/consultant/:id" element={<ProfilePage />} /></Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ bookings: {}, records: {}, reviews: {}, seeded: true, approvalMinSample: null })
})

test('bio from the brief; placeholders for missing video and feedback', async () => {
  open('ahmed-khalil')
  expect(screen.getByText(/I'm Ahmed Khalil, a consultant at MG Immigration/)).toBeInTheDocument()
  expect(screen.queryByText('Biography under processing')).toBeNull()
  expect(screen.getAllByText('Video pending').length).toBeGreaterThan(0)
  expect(await screen.findByText('No verified feedback yet')).toBeInTheDocument()
})

test('profile hides internal stats: activity, KPI score and approval rate', () => {
  open('mohamed-gamal')
  expect(screen.getByText('Senior Immigration Specialist & Contract Manager')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: /verified customer feedback/i })).toBeInTheDocument()
  expect(screen.queryByText(/consultation activity/i)).toBeNull()
  expect(screen.queryByText(/years of experience/i)).toBeNull()
  expect(screen.queryByText(/company performance score/i)).toBeNull()
  expect(screen.queryByText(/historical application approvals/i)).toBeNull()
})

test('introduction video keeps native playback controls without a duplicate toolbar', () => {
  open('mohamed-gamal')
  const region = screen.getByRole('region', { name: /introduction video/i })
  const video = region.querySelector('video')
  expect(video).toHaveAttribute('controls')
  expect(video).toHaveAttribute('playsinline')
  expect(video).toHaveAttribute('src', '/videos/consultants/mohamed-gamal.mp4')
  expect(within(region).queryAllByRole('button')).toHaveLength(0)
})
