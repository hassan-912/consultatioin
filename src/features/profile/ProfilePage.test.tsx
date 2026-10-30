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
  useAppStore.setState({ bookings: {}, records: {}, seeded: true, approvalMinSample: null })
})

test('placeholders for missing bio, video, feedback; approval hidden below sample', () => {
  open('ahmed-khalil')
  expect(screen.getByText('Biography under processing')).toBeInTheDocument()
  expect(screen.getAllByText('Video pending').length).toBeGreaterThan(0)
  expect(screen.getByText('No verified feedback yet')).toBeInTheDocument()
  expect(screen.getByText(/not enough decided applications/i)).toBeInTheDocument()
})

test('Mohamed Gamal shows title and a published approval rate with method and disclaimer', () => {
  open('mohamed-gamal')
  expect(screen.getByText('Senior Immigration Specialist & Contract Manager')).toBeInTheDocument()
  const approval = screen.getByRole('region', { name: /historical application approvals/i })
  expect(within(approval).getByText('75%')).toBeInTheDocument()
  expect(within(approval).getByText(/pending and withdrawn applications are excluded/i)).toBeInTheDocument()
  expect(within(approval).getByText(/do not guarantee future approval/i)).toBeInTheDocument()
  expect(within(approval).getByText('24')).toBeInTheDocument()
})

test('KPI score, customer feedback and approval rate are separate regions', () => {
  open('mohamed-gamal')
  const kpi = screen.getByRole('region', { name: /company performance score/i })
  const feedback = screen.getByRole('region', { name: /verified customer feedback/i })
  const approval = screen.getByRole('region', { name: /historical application approvals/i })
  expect(new Set([kpi, feedback, approval]).size).toBe(3)
  expect(within(kpi).queryByText(/75%/)).toBeNull()
})

test('video player exposes captions and playback controls', () => {
  open('mohamed-gamal')
  const video = screen.getByRole('region', { name: /introduction video/i })
  expect(within(video).getByRole('button', { name: /play/i })).toBeInTheDocument()
  expect(within(video).getByRole('button', { name: /captions/i })).toBeInTheDocument()
})
