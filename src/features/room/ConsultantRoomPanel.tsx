import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DailyCall } from '@daily-co/daily-js'
import { useT } from '../../i18n'
import { repo } from '../../data'
import { reportActionError } from '../../data/feedback'
import { useAppStore } from '../../store/useAppStore'
import type { Booking, MeetingSummary, MeetingSummaryRecord } from '../../domain/types'
import { programName } from '../../config/programs'
import { SelectField, TextArea } from '../../components/fields'
import { Button, Notice } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { AssessmentQuestions } from '../../assessment/AssessmentQuestions'
import { evaluate } from '../../assessment/evaluate'
import { useEgpRates } from '../../assessment/useEgpRates'
import type { AssessedProgram } from '../../assessment/questions'
import type { RoomContext } from './RoomCall'
import type { RoomChannel } from './sharedAssessment'
import { useConsultantAssessment, type SaveState } from './useSharedAssessment'
import { downloadSummary } from './pdf/downloads'

const PROGRAMS: AssessedProgram[] = ['tourism', 'immigration', 'job-seeking']
const toneClass = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' } as const

/** The consultant's panel beside the call: the client's assessment (shareable into the room) and the call's summary. */
export function ConsultantRoomPanel({ booking, ctx, startOn = 'assessment' }: { booking: Booking; ctx: RoomContext | null; startOn?: 'assessment' | 'summary' }) {
  const { t } = useT()
  const [tab, setTab] = useState(startOn)
  const now = useAppStore(s => s.now)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const autoSummary = useAutoSummary(booking.id, () => setSummaryVersion(v => v + 1))
  const recording = useRecording(ctx?.call ?? null, ctx?.channel ?? null, autoSummary)
  // Lives here, not in the tab, so switching tabs keeps the card shared.
  const assessment = useConsultantAssessment(booking.id, ctx?.channel ?? null, now)
  const tabs = [['assessment', t('room.tabAssessment')], ['summary', t('room.tabSummary')]] as const
  return (
    <section aria-label={t('room.panelTitle')} className="overflow-hidden rounded-[1.75rem] bg-white shadow-card ring-1 ring-line">
      <header className="bg-slate-deep px-5 pb-0 pt-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('room.panelTitle')}</p>
          {recording.state === 'on' && <RecPill since={recording.since} />}
        </div>
        <p className="mt-1 truncate font-display text-lg font-semibold">{booking.customer.name}</p>
        <div role="tablist" className="mt-3 flex gap-1">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-h-11 rounded-t-xl px-4 text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-ink' : 'text-mist hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="max-h-[calc(78dvh-60px)] overflow-y-auto p-5">
        {tab === 'assessment'
          ? <AssessmentTab a={assessment} canShare={!!ctx} />
          : <SummaryTab key={summaryVersion} booking={booking} recording={ctx ? recording : null} />}
      </div>
    </section>
  )
}

function SaveLine({ state }: { state: SaveState }) {
  const { t } = useT()
  if (state === 'idle') return null
  const [text, cls] = { saving: [t('room.saving'), 'text-muted'], saved: [t('room.saved'), 'text-ok'], error: [t('room.saveFailed'), 'text-bad'] }[state]
  return <p role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cls}`}>{state === 'saved' && <Icon name="check" size={13} />}{text}</p>
}

function AssessmentTab({ a, canShare }: { a: ReturnType<typeof useConsultantAssessment>; canShare: boolean }) {
  const { t, l } = useT()
  const { rates } = useEgpRates(a.card?.program === 'job-seeking')
  const result = useMemo(() => (a.card ? evaluate({ program: a.card.program, answers: a.card.answers }, rates) : null), [a.card, rates])

  return (
    <div className="grid gap-4">
      <SelectField label={t('room.program')} value={a.card?.program ?? ''} onChange={e => e.target.value && a.setProgram(e.target.value as AssessedProgram)}>
        <option value="">{t('room.programPick')}</option>
        {PROGRAMS.map(p => <option key={p} value={p}>{l(programName(p))}</option>)}
      </SelectField>

      {!a.card ? <Notice tone="info">{t('room.pickFirst')}</Notice> : (
        <>
          {/* Staff only: the score never goes to the room. */}
          {result && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line">
              <Icon name="shield" size={14} className="text-muted" />
              <span className="text-xs font-semibold text-muted">{t('room.staffScore')}</span>
              {result.score !== null && <span dir="ltr" className="font-display text-lg font-semibold text-ink">{result.score}{result.max ? <span className="text-sm text-muted"> / {result.max}</span> : null}</span>}
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass[result.verdict.tone]}`}>{l(result.verdict.label)}</span>
            </div>
          )}

          <div className={`rounded-2xl p-4 ring-1 transition-colors ${a.shared ? 'bg-gold-soft/60 ring-gold/50' : 'bg-white ring-line'}`}>
            {a.shared ? (
              <>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="relative inline-flex size-2.5"><span className="mg-breathe absolute inset-0 rounded-full bg-ok" /><span className="relative size-2.5 rounded-full bg-ok" /></span>
                  {t('room.sharedLive')}
                </p>
                <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={a.stop}><Icon name="eyeOff" size={15} />{t('room.stopSharing')}</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate">{t('room.notShared')}</p>
                <Button variant="gold" size="lg" className="mt-3 w-full" disabled={!canShare} onClick={a.share}>
                  <Icon name="expand" size={18} />{t('room.sendToRoom')}
                </Button>
              </>
            )}
          </div>

          <div className="flex justify-end"><SaveLine state={a.save} /></div>
          <AssessmentQuestions program={a.card.program} answers={a.card.answers} onChange={a.setAnswers} showErrors={false} />
        </>
      )}
    </div>
  )
}

/**
 * When the client leaves: ask the server to write and publish the summary, every 20 s until the transcript is ready
 * (the client's after-call page asks too; whichever comes first publishes, the other gets the same summary).
 */
function useAutoSummary(bookingId: string, onPublished: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const done = useRef(onPublished)
  done.current = onPublished
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback(() => {
    clearTimeout(timer.current)
    let tries = 0
    const ask = () => {
      tries += 1
      repo.autoMeetingSummary({ bookingId }).then(r => {
        if (r.state === 'published') done.current()
        else if (r.state === 'pending' && tries < 30) timer.current = setTimeout(ask, 20_000)
      }, () => { if (tries < 30) timer.current = setTimeout(ask, 20_000) })
    }
    // Daily needs a moment to close the transcript once recording stops.
    timer.current = setTimeout(ask, 30_000)
  }, [bookingId])
}

/* ── Recording ─────────────────────────────────────────────────────────── */

type Recording = ReturnType<typeof useRecording>
/**
 * Recording runs on its own: it starts (with the transcript the summary is written from) as soon as the client is in
 * the call, and stops when the client leaves, which is what sets the automatic summary going (`onClientLeft`).
 * The consultant can still stop it by hand; it then stays off until the client next joins.
 */
function useRecording(call: DailyCall | null, channel: RoomChannel | null, onClientLeft?: () => void) {
  const [state, setState] = useState<'off' | 'starting' | 'on' | 'error'>('off')
  const [since, setSince] = useState(0)
  const now = useAppStore(s => s.now)
  const stateRef = useRef(state)
  stateRef.current = state
  const heldOff = useRef(false)
  const leftRef = useRef(onClientLeft)
  leftRef.current = onClientLeft
  const announce = useCallback((on: boolean) => channel?.send({ kind: 'mg-room', type: 'recording', on }), [channel])
  useEffect(() => {
    if (!call) return
    const started = () => { setState('on'); setSince(now()); announce(true) }
    const stopped = () => { setState('off'); announce(false) }
    const failed = () => { setState('error'); announce(false) }
    call.on('recording-started', started).on('recording-stopped', stopped).on('recording-error', failed)
    return () => { call.off('recording-started', started).off('recording-stopped', stopped).off('recording-error', failed) }
  }, [call, announce, now])
  // A client who joins (or reloads) mid-recording still sees the notice.
  useEffect(() => channel?.listen(m => { if (m.type === 'hello' && state === 'on') announce(true) }), [channel, state, announce])

  const start = useCallback(() => {
    heldOff.current = false
    if (!call) { setState('on'); setSince(now()); announce(true); return }
    setState('starting')
    try {
      call.startRecording()
      // The transcript is what the summary is written from.
      call.startTranscription()
    } catch { setState('error') }
  }, [call, now, announce])
  const halt = useCallback(() => {
    if (!call) { setState('off'); announce(false); return }
    try { call.stopRecording(); call.stopTranscription() } catch { /* already stopped */ }
  }, [call, announce])
  const stop = () => { heldOff.current = true; halt() }

  // The client is anyone else in the call without the host's pass (staff join as owners).
  useEffect(() => {
    if (!call) return
    let present = false
    const sync = () => {
      const now = Object.values(call.participants()).some(p => !p.local && !p.owner)
      if (now && !present) { if (!heldOff.current && stateRef.current !== 'on' && stateRef.current !== 'starting') start() }
      else if (!now && present) {
        heldOff.current = false
        if (stateRef.current === 'on' || stateRef.current === 'starting') halt()
        leftRef.current?.()
      }
      present = now
    }
    call.on('joined-meeting', sync).on('participant-joined', sync).on('participant-left', sync)
    sync()
    return () => { call.off('joined-meeting', sync).off('participant-joined', sync).off('participant-left', sync) }
  }, [call, start, halt])
  return { state, since, start, stop }
}

function RecPill({ since }: { since: number }) {
  const { t } = useT()
  const now = useAppStore(s => s.now)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(id) }, [])
  const s = Math.max(0, Math.floor((now() - since) / 1000))
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-bad/90 px-3 py-1 text-xs font-semibold text-white">
      <span className="size-2 animate-pulse rounded-full bg-white" />{t('room.recordingOn')} <span dir="ltr" className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
    </span>
  )
}

function RecordControl({ recording }: { recording: Recording }) {
  const { t } = useT()
  const on = recording.state === 'on'
  return (
    <div className="rounded-2xl bg-paper p-4 ring-1 ring-line">
      <Button variant={on ? 'danger' : 'primary'} className="w-full" disabled={recording.state === 'starting'} onClick={on ? recording.stop : recording.start}>
        <span className={`size-2.5 rounded-full ${on ? 'bg-bad' : 'bg-bad animate-pulse'}`} />{t(on ? 'room.stopRecord' : 'room.record')}
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-muted">{t('room.recordHint')}</p>
      {recording.state === 'error' && <Notice tone="bad" className="mt-2">{t('room.recordFailed')}</Notice>}
    </div>
  )
}

/* ── Summary ───────────────────────────────────────────────────────────── */

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

function SummaryTab({ booking, recording }: { booking: Booking; recording: Recording | null }) {
  const { t, lang } = useT()
  const [record, setRecord] = useState<MeetingSummaryRecord | null | undefined>(undefined)
  const [form, setForm] = useState({ overview: '', keyPoints: '', agreements: '', nextSteps: '' })
  const [busy, setBusy] = useState<'' | 'generate' | 'publish' | 'pdf' | 'recording'>('')
  const [noRecording, setNoRecording] = useState(false)

  const fill = useCallback((r: MeetingSummaryRecord | null) => {
    setRecord(r)
    if (r) setForm({ overview: r.summary.overview, keyPoints: r.summary.keyPoints.join('\n'), agreements: r.summary.agreements.join('\n'), nextSteps: r.summary.nextSteps.join('\n') })
  }, [])
  useEffect(() => { repo.meetingSummary(booking.id).then(fill, e => { setRecord(null); reportActionError(e) }) }, [booking.id, fill])

  const summary = (): MeetingSummary => ({
    overview: form.overview.trim(), keyPoints: lines(form.keyPoints), agreements: lines(form.agreements), nextSteps: lines(form.nextSteps),
    lang: record?.summary.lang ?? booking.customer.consultationLang ?? lang,
  })
  const run = async (what: typeof busy, fn: () => Promise<unknown>) => {
    setBusy(what)
    try { await fn() } catch (e) { reportActionError(e) } finally { setBusy('') }
  }
  const generate = () => run('generate', async () => fill(await repo.generateMeetingSummary(booking.id)))
  const publish = () => run('publish', async () => {
    const s = summary()
    await repo.publishMeetingSummary(booking.id, s)
    setRecord(r => ({ summary: s, status: 'published', generatedAt: r?.generatedAt ?? Date.now(), publishedAt: Date.now() }))
  })
  const pdf = () => run('pdf', () => downloadSummary(booking, summary()))
  const recordingFile = () => run('recording', async () => {
    const link = await repo.recordingLink(booking.id)
    setNoRecording(!link)
    if (link) window.open(link, '_blank', 'noopener')
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="grid gap-4">
      {recording && <RecordControl recording={recording} />}

      <div>
        <h3 className="font-semibold text-ink">{t('room.summaryTitle')}</h3>
        <p className="mt-0.5 text-sm text-muted">{t('room.summaryHint')}</p>
      </div>
      <Button variant={record ? 'ghost' : 'gold'} disabled={busy !== '' || record === undefined} onClick={() => void generate()}>
        <Icon name="sparkle" size={16} />{busy === 'generate' ? t('room.generating') : t(record ? 'room.regenerate' : 'room.generate')}
      </Button>

      {record && (
        <>
          <p className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${record.status === 'published' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
            <Icon name={record.status === 'published' ? 'check' : 'eyeOff'} size={13} />{t(record.status === 'published' ? 'room.published' : 'room.draft')}
          </p>
          <div dir={record.summary.lang === 'ar' ? 'rtl' : 'ltr'} className="grid gap-3">
            <TextArea label={t('room.overview')} rows={4} value={form.overview} onChange={set('overview')} />
            <TextArea label={t('room.keyPoints')} rows={5} value={form.keyPoints} onChange={set('keyPoints')} />
            <TextArea label={t('room.agreements')} rows={3} value={form.agreements} onChange={set('agreements')} />
            <TextArea label={t('room.nextSteps')} rows={4} value={form.nextSteps} onChange={set('nextSteps')} />
          </div>
          <Button disabled={busy !== '' || !form.overview.trim()} onClick={() => void publish()}><Icon name="check" size={16} />{t('room.publish')}</Button>
          <Button variant="ghost" disabled={busy !== ''} onClick={() => void pdf()}><Icon name="download" size={16} />{busy === 'pdf' ? t('room.downloading') : t('room.previewPdf')}</Button>
        </>
      )}

      <div className="border-t border-line pt-4">
        <Button variant="quiet" size="sm" disabled={busy !== ''} onClick={() => void recordingFile()}><Icon name="video" size={15} />{t('room.downloadRecording')}</Button>
        {noRecording && <p className="mt-1 text-xs text-muted">{t('room.noRecording')}</p>}
      </div>
    </div>
  )
}
