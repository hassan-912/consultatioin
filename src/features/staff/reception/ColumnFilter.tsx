import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../../i18n'
import { Icon } from '../../../components/Icon'

export type FilterOption = { value: string; label: string; count: number }

const WIDTH = 264

/**
 * Excel-style column filter: a funnel in the header opens a checklist of the column's values. Nothing ticked away
 * means no filter. The menu is portalled so the sheet's scrolling box cannot clip it.
 */
export function ColumnFilter({ column, options, selected, onChange }: {
  column: string
  options: FilterOption[]
  selected?: string[]
  onChange: (next: string[] | undefined) => void
}) {
  const { t, dir } = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({ top: 0, left: 0, maxHeight: 400 })
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const active = !!selected
  const isOn = (v: string) => !selected || selected.includes(v)
  const shown = options.filter(o => o.label.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()))

  const set = (next: string[]) => onChange(next.length === options.length && options.every(o => next.includes(o.value)) ? undefined : next)
  const toggle = (v: string) => {
    const current = selected ?? options.map(o => o.value)
    set(current.includes(v) ? current.filter(x => x !== v) : [...current, v])
  }
  const allShownOn = shown.every(o => isOn(o.value))
  const toggleShown = () => {
    const current = new Set(selected ?? options.map(o => o.value))
    for (const o of shown) if (allShownOn) current.delete(o.value); else current.add(o.value)
    set([...current])
  }

  // The menu follows its column when the page or the sheet scrolls.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!button.current) return
      const r = button.current.getBoundingClientRect()
      const raw = dir === 'rtl' ? r.right - WIDTH : r.left
      const left = Math.max(8, Math.min(raw, window.innerWidth - WIDTH - 8))
      const below = window.innerHeight - r.bottom - 14, above = r.top - 14
      // Opens upwards when there is clearly more room above, and never runs off the screen.
      setPos(below >= 320 || below >= above
        ? { top: r.bottom + 6, left, maxHeight: below }
        : { bottom: window.innerHeight - r.top + 6, left, maxHeight: above })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, dir])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'pointerdown' && (menu.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return
      setOpen(false)
      if (e.type === 'keydown') button.current?.focus()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <>
      <button ref={button} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={t(active ? 'staff.customers.filter.active' : 'staff.customers.filter.open', { column })}
        onClick={() => { setOpen(o => !o); setQ('') }}
        className={`inline-grid size-8 place-items-center rounded-lg transition ${active ? 'bg-slate text-white' : 'text-mist hover:bg-white hover:text-ink'}`}>
        <Icon name="filter" size={14} />
      </button>
      {open && createPortal(
        <div ref={menu} id={id} role="dialog" aria-label={t('staff.customers.filter.title', { column })} dir={dir}
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: WIDTH, maxHeight: pos.maxHeight }}
          className="fixed z-50 flex flex-col gap-2 rounded-2xl bg-white p-3 text-sm text-ink shadow-2xl ring-1 ring-line">
          <p className="font-semibold">{t('staff.customers.filter.title', { column })}</p>
          {options.length > 6 && (
            <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')}
              aria-label={t('staff.customers.filter.search', { column })}
              className="min-h-10 rounded-xl border border-line px-3 text-sm outline-none focus:border-slate" />
          )}
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 border-b border-line pb-2 font-semibold">
            <input type="checkbox" checked={allShownOn} onChange={toggleShown} className="size-4 accent-slate" />
            {t('staff.customers.filter.selectAll')}
          </label>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.map(o => (
              <li key={o.value}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1 hover:bg-paper">
                  <input type="checkbox" checked={isOn(o.value)} onChange={() => toggle(o.value)} className="size-4 accent-slate" />
                  <span dir="auto" className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="text-xs text-muted tabular-nums">{o.count}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-1 py-2 text-muted">{t('staff.customers.filter.none')}</li>}
          </ul>
          <div className="flex justify-between gap-2 border-t border-line pt-2">
            <button type="button" disabled={!active} onClick={() => onChange(undefined)}
              className="min-h-10 rounded-xl px-3 font-semibold text-slate hover:bg-paper disabled:opacity-40">{t('staff.customers.filter.clear')}</button>
            <button type="button" onClick={() => { setOpen(false); button.current?.focus() }}
              className="min-h-10 rounded-xl bg-slate px-4 font-semibold text-white">{t('staff.customers.filter.done')}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
