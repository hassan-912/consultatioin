import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('renders shell in Arabic (RTL) by default', () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
})
