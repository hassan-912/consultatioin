import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('renders shell with LTR by default', () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(screen.getAllByText(/MG International/i).length).toBeGreaterThan(0)
  expect(document.documentElement.dir).toBe('ltr')
})
