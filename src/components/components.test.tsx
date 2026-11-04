import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ScoreBar } from './ScoreBar'
import { CopyField } from './CopyField'
import { LangSwitch } from './LangSwitch'
import { Footer } from './Footer'
import { useAppStore } from '../store/useAppStore'

beforeEach(() => useAppStore.getState().setLang('en'))

test('ScoreBar shows score out of 10 with ten segments', () => {
  const { container } = render(<ScoreBar score={8.6} />)
  expect(screen.getByText('8.6')).toBeInTheDocument()
  expect(screen.getByText('/ 10')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-seg]')).toHaveLength(10)
  expect(container.querySelectorAll('[data-seg="full"]')).toHaveLength(8)
})

test('CopyField copies its value and announces it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CopyField label="Wallet number" value="01000000000" />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /copy/i })) })
  expect(writeText).toHaveBeenCalledWith('01000000000')
  expect(screen.getByRole('status')).toHaveTextContent('Copied')
})

test('LangSwitch toggles direction', () => {
  render(<LangSwitch />)
  fireEvent.click(screen.getByRole('button', { name: /arabic/i }))
  expect(document.documentElement.dir).toBe('rtl')
  expect(screen.getByRole('button', { name: /الإنجليزية/ })).toHaveTextContent('English')
})

test('Footer lists the four branches and social links', () => {
  render(<MemoryRouter><Footer /></MemoryRouter>)
  const text = document.body.textContent!
  for (const b of ['Nasr City', 'Sheikh Zayed', 'Dubai', 'Qena', 'Hub Furniture Building']) expect(text).toContain(b)
  const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
  expect(hrefs).toEqual(expect.arrayContaining([
    'https://www.facebook.com/MGInternational1/',
    'https://www.tiktok.com/@mginternational1',
    'https://www.instagram.com/mg_international1/',
    'tel:17621',
    'mailto:Info@mg-visa.com',
  ]))
})
