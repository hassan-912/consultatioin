import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DirectoryPage } from './DirectoryPage'
import { useAppStore, defaultFilters } from '../../store/useAppStore'
import { buildScheduleRules } from '../../demo/schedule'

const renderPage = () => render(<MemoryRouter><DirectoryPage /></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ filters: defaultFilters(), bookings: {}, seeded: true })
})

const cards = () => screen.getAllByRole('article')

test('shows all seven consultants by default with both actions', () => {
  renderPage()
  expect(cards()).toHaveLength(7)
  for (const c of cards()) {
    expect(within(c).getByRole('link', { name: /view profile/i })).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: /book consultation/i })).toBeInTheDocument()
  }
})

test('branch filter: Dubai shows only Mohamed Abdelaziz', () => {
  useAppStore.getState().setFilters({ branch: 'dubai' })
  renderPage()
  expect(cards()).toHaveLength(1)
  expect(cards()[0]).toHaveTextContent('Mohamed Abdelaziz')
})

test('format filter removes consultants who do not offer it', () => {
  useAppStore.getState().setFilters({ format: 'online' })
  renderPage()
  expect(screen.queryByText('Mohamed Salah')).not.toBeInTheDocument() // in person only
  expect(screen.getByText('Ahmed Khalil')).toBeInTheDocument()
  useAppStore.getState().setFilters({ format: 'in-person' })
})

test('a company holiday shows no slots on that date and still gives the next available appointment', () => {
  const holiday = buildScheduleRules()[0].holidays[0]
  useAppStore.getState().setFilters({ date: holiday, branch: 'nasr-city' })
  renderPage()
  for (const c of cards()) {
    expect(within(c).getByText(/no appointments on this date/i)).toBeInTheDocument()
    expect(within(c).getByText(/next available appointment/i)).toBeInTheDocument()
  }
})

test('empty result offers to clear filters', () => {
  useAppStore.getState().setFilters({ branch: 'dubai', program: 'investment' })
  renderPage()
  expect(screen.getByText(/no consultants match/i)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0)
})

test('demo data is labelled and Wael/Qena never appear', () => {
  renderPage()
  expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/Wael|Qena/)
})
