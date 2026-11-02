import { useMemo, useState } from 'react'
import { useT, pluralCategory } from '../../i18n'
import { useAppStore, todayIn, type Filters as F } from '../../store/useAppStore'
import { programs } from '../../config/programs'
import { addDays, formatDate } from '../../domain/time'
import { SelectField } from '../../components/fields'
import { BottomSheet } from '../../components/widgets'
import { Button } from '../../components/ui'
import { Icon } from '../../components/Icon'

export function DateStrip({ value, onChange, days = 14, label }: { value: string; onChange: (d: string) => void; days?: number; label: string }) {
  const { t, lang } = useT()
  const today = todayIn('Africa/Cairo')
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(today, i)), [today, days])
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {dates.map((d, i) => {
        const active = d === value
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(d)}
            className={`flex min-h-16 min-w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 transition-colors ${
              active ? 'border-slate bg-slate text-white shadow-md' : 'border-line bg-white text-slate hover:border-mist'
            }`}
          >
            <span className={`text-[11px] font-semibold ${active ? 'text-mist' : 'text-muted'}`}>
              {i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : formatDate(d, lang, 'weekday')}
            </span>
            <span dir="ltr" className="font-display text-lg font-semibold tabular leading-tight">{Number(d.slice(8))}</span>
            <span className={`text-[11px] ${active ? 'text-mist' : 'text-muted'}`}>{formatDate(d, lang, 'short').replace(/\d+\s*/, '')}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilterControls({ value, onChange }: { value: F; onChange: (p: Partial<F>) => void }) {
  const { t, l } = useT()
  return (
    <div className="grid gap-4">
      <SelectField label={t('directory.filterProgram')} value={value.program} onChange={e => onChange({ program: e.target.value as F['program'] })}>
        <option value="all">{t('directory.allPrograms')}</option>
        {programs.map(p => <option key={p.id} value={p.id}>{l(p.name)}</option>)}
      </SelectField>
    </div>
  )
}

export function Filters({ resultCount }: { resultCount: number }) {
  const { t, l, lang } = useT()
  const filters = useAppStore(s => s.filters)
  const setFilters = useAppStore(s => s.setFilters)
  const resetFilters = useAppStore(s => s.resetFilters)
  const [open, setOpen] = useState(false)
  const active = filters.program !== 'all' ? 1 : 0

  const chip = (label: string, clear: () => void) => (
    <button key={label} type="button" onClick={clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-slate/8 px-3 text-sm font-semibold text-slate ring-1 ring-slate/15 hover:bg-slate/12">
      {label}
      <Icon name="x" size={14} />
    </button>
  )

  return (
    <section aria-label={t('directory.filters')} className="relative z-10 -mt-14 rounded-3xl bg-white p-4 shadow-[var(--shadow-lift)] ring-1 ring-line/70 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{t('directory.filterDate')}</h2>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-slate hover:bg-mist-soft md:hidden">
          <Icon name="filter" size={16} />
          {t('directory.filters')}
          {active > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-gold text-xs text-ink">{active}</span>}
        </button>
      </div>
      <DateStrip label={t('directory.filterDate')} value={filters.date} onChange={date => setFilters({ date })} />

      <div className="mt-5 hidden max-w-sm items-end gap-4 border-t border-line pt-5 md:grid">
        <SelectField label={t('directory.filterProgram')} value={filters.program} onChange={e => setFilters({ program: e.target.value as F['program'] })}>
          <option value="all">{t('directory.allPrograms')}</option>
          {programs.map(p => <option key={p.id} value={p.id}>{l(p.name)}</option>)}
        </SelectField>
      </div>

      {active > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 md:hidden">
          {filters.program !== 'all' && chip(l(programs.find(p => p.id === filters.program)!.name), () => setFilters({ program: 'all' }))}
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('directory.filters')}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => resetFilters()}>{t('directory.clearFilters')}</Button>
            <Button className="flex-[2]" onClick={() => setOpen(false)}>
              {t(`directory.showCount.${pluralCategory(lang, resultCount)}`, { n: resultCount })}
            </Button>
          </div>
        }
      >
        <FilterControls value={filters} onChange={setFilters} />
      </BottomSheet>
    </section>
  )
}
