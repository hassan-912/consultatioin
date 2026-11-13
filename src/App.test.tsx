import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { useAppStore } from './store/useAppStore'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

test('renders shell in Arabic (RTL) by default', () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
})

test.each(['/consultant/mohamed-gamal', '/team'])('fresh browsing at %s starts with branch selection', async path => {
  useAppStore.getState().setLang('en')
  useAppStore.setState({ location: null, seeded: true })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  const gate = await screen.findByRole('dialog', { name: /where would you like your consultation/i })
  fireEvent.click(within(gate).getByRole('button', { name: /UAE/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('article')).toHaveTextContent('Mohamed Abdelaziz')
})
