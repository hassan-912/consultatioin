import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaffApp } from './StaffApp'
import { useAppStore } from '../../store/useAppStore'
import { loginAs } from '../../test/loginAs'
import { screens } from './permissions'

test('no role sees a Not ready clients menu entry', async () => {
  expect(screens.map(s => s.path)).not.toContain('not-ready')
  useAppStore.getState().setLang('en')
  for (const role of ['admin', 'sales'] as const) {
    loginAs(role)
    const { unmount } = render(<MemoryRouter initialEntries={['/staff']}><Routes><Route path="/staff/*" element={<StaffApp />} /></Routes></MemoryRouter>)
    expect(await screen.findAllByRole('navigation')).not.toHaveLength(0)
    expect(screen.queryByRole('link', { name: /not ready/i })).toBeNull()
    unmount()
  }
})
