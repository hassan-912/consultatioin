import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DirectoryPage } from './DirectoryPage'
import { useAppStore, defaultFilters } from '../../store/useAppStore'
import { buildScheduleRules } from '../../demo/schedule'

const renderPage = () => render(<MemoryRouter><DirectoryPage /></MemoryRouter>)

beforeEach(() => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ filters: defaultFilters(), bookings: {}, seeded: true, location: 'nasr-city' })
})

const cards = () => screen.getAllByRole('article')

test('before a location is chosen all seven consultants are listed behind the welcome screen, with both actions', () => {
  useAppStore.setState({ location: null })
  renderPage()
  expect(cards()).toHaveLength(7)
  for (const c of cards()) {
    expect(within(c).getByRole('link', { name: /view profile/i })).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: /book consultation/i })).toBeInTheDocument()
  }
})

test('first visit asks for a location; choosing UAE shows only the Dubai consultants and can be changed', () => {
  useAppStore.setState({ location: null })
  renderPage()
  const gate = screen.getByRole('dialog', { name: /where would you like your consultation/i })
  for (const name of ['UAE', 'Nasr City', 'Zayed', 'Qena']) expect(within(gate).getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
  fireEvent.click(within(gate).getByRole('button', { name: /UAE/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useAppStore.getState().location).toBe('dubai')
  expect(cards()).toHaveLength(1)
  expect(cards()[0]).toHaveTextContent('Mohamed Abdelaziz')
  fireEvent.click(screen.getByRole('button', { name: /change location/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('home page no longer filters by branch or online / in person', () => {
  useAppStore.setState({ location: 'nasr-city' })
  renderPage()
  expect(screen.queryByLabelText('Branch')).toBeNull()
  expect(screen.queryByRole('radio', { name: /^online$/i })).toBeNull()
  expect(cards()).toHaveLength(4)
})

test('a company holiday shows no slots on that date and still gives the next available appointment', () => {
  const holiday = buildScheduleRules()[0].holidays[0]
  useAppStore.setState({ location: 'nasr-city' })
  useAppStore.getState().setFilters({ date: holiday })
  renderPage()
  for (const c of cards()) {
    expect(within(c).getByText(/no appointments on this date/i)).toBeInTheDocument()
    expect(within(c).getByText(/next available appointment/i)).toBeInTheDocument()
  }
})

test('empty result offers to clear filters or change location', () => {
  useAppStore.setState({ location: 'dubai' })
  useAppStore.getState().setFilters({ program: 'investment' })
  renderPage()
  expect(screen.getByText(/no consultants match/i)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0)
  expect(screen.getAllByRole('button', { name: /change location/i }).length).toBeGreaterThan(0)
})

test('Qena is an open branch; demo data is labelled and Wael never appears', () => {
  useAppStore.setState({ location: 'qena' })
  renderPage()
  expect(screen.queryByText(/opening soon/i)).toBeNull()
  expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0)
  expect(document.body.textContent).not.toMatch(/Wael/)
})
