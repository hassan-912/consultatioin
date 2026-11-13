import { useT } from '../../i18n'
import type { Consultant } from '../../domain/types'
import { Icon } from '../../components/Icon'

/** A single native player; a labelled placeholder until an introduction video is supplied. */
export function VideoPlayer({ consultant }: { consultant: Consultant }) {
  const { t, l } = useT()
  const pending = !consultant.videoUrl

  return (
    <section aria-label={t('profile.video')} className="overflow-hidden rounded-2xl bg-slate-deep shadow-card">
      <div className="relative aspect-video">
        {pending ? (
          <div className="grain absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-deep via-slate to-navy text-center text-white">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
              <Icon name="play" size={26} />
            </span>
            <p className="font-display text-lg font-semibold">{t('profile.videoPending')}</p>
            <p className="max-w-[30ch] text-sm text-mist">{l(consultant.name)}</p>
          </div>
        ) : (
          <video className="block size-full object-contain" aria-label={`${t('profile.video')} — ${l(consultant.name)}`} src={consultant.videoUrl!} poster={consultant.videoPoster} controls playsInline preload="metadata" />
        )}
      </div>
    </section>
  )
}
