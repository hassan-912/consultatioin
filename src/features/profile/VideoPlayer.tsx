import { useRef, useState } from 'react'
import { useT } from '../../i18n'
import type { Consultant } from '../../domain/types'
import { Icon } from '../../components/Icon'

/** Introduction video with captions and controls; a labelled placeholder until a video is supplied. */
export function VideoPlayer({ consultant }: { consultant: Consultant }) {
  const { t, l } = useT()
  const ref = useRef<HTMLVideoElement>(null)
  const [captions, setCaptions] = useState(true)
  const pending = !consultant.videoUrl

  const ctl = 'inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-50 aria-pressed:bg-white/20'

  return (
    <section aria-label={t('profile.video')} className="overflow-hidden rounded-3xl bg-slate-deep ring-1 ring-line">
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
          <video ref={ref} className="size-full" src={consultant.videoUrl!} controls preload="metadata">
            <track kind="captions" default={captions} label="Captions" />
          </video>
        )}
        {pending && captions && (
          <p className="absolute inset-x-6 bottom-4 rounded-md bg-ink/75 px-3 py-1.5 text-center text-sm text-white">
            [{t('placeholder.video')}]
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 bg-ink/90 px-2 py-1.5">
        <button type="button" className={ctl} aria-label={t('profile.play')} disabled={pending} onClick={() => ref.current?.play()}>
          <Icon name="play" size={18} />
        </button>
        <div className="mx-2 h-1 flex-1 rounded-full bg-white/20" aria-hidden>
          <div className="h-full w-0 rounded-full bg-gold" />
        </div>
        <span dir="ltr" className="px-1 text-xs tabular text-mist">0:00</span>
        <button type="button" className={ctl} aria-label={t('profile.mute')} disabled={pending}>
          <Icon name="volume" size={18} />
        </button>
        <button type="button" className={ctl} aria-label={t('profile.captions')} aria-pressed={captions} onClick={() => setCaptions(v => !v)}>
          <Icon name="cc" size={18} />
        </button>
        <button type="button" className={ctl} aria-label={t('profile.fullscreen')} disabled={pending} onClick={() => ref.current?.requestFullscreen?.()}>
          <Icon name="expand" size={18} />
        </button>
      </div>
    </section>
  )
}
