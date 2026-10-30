import { useT } from '../i18n'

/** Company KPI score out of 10, as a ten-segment meter. */
export function ScoreBar({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const { t } = useT()
  const segs = Array.from({ length: 10 }, (_, i) => {
    const fill = Math.max(0, Math.min(1, score - i))
    return fill >= 1 ? 'full' : fill > 0 ? 'part' : 'empty'
  })
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={`${t('common.kpiScore')}: ${score} / 10`}>
      <span dir="ltr" className="flex items-baseline gap-0.5 font-display tabular">
        <span className={size === 'sm' ? 'text-base font-semibold text-ink' : 'text-2xl font-semibold text-ink'}>{score.toFixed(1)}</span>
        <span className="text-xs text-muted">/ 10</span>
      </span>
      <span dir="ltr" className="flex gap-[3px] rtl:flex-row-reverse" aria-hidden>
        {segs.map((s, i) => (
          <span
            key={i}
            data-seg={s}
            className={`${size === 'sm' ? 'h-2 w-1.5' : 'h-3 w-2'} rounded-[2px] ${
              s === 'full' ? 'bg-gold' : s === 'part' ? 'bg-gradient-to-r from-gold to-line' : 'bg-line'
            }`}
          />
        ))}
      </span>
    </div>
  )
}
