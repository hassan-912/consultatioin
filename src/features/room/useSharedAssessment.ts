import { useCallback, useEffect, useRef, useState } from 'react'
import { repo } from '../../data'
import { useStaffAssessments } from '../../data/hooks'
import type { Answers, AssessedProgram } from '../../assessment/questions'
import { pruneAnswers } from '../../assessment/questions'
import { mergeShared, stampChanges, type RoomChannel, type SharedAssessment } from './sharedAssessment'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const SAVE_AFTER_MS = 1200

/**
 * The consultant's side of the card: picks the program, edits, sends it to the room and saves it.
 * Changes from the client arrive through `channel` and are saved like the consultant's own.
 */
export function useConsultantAssessment(bookingId: string, channel: RoomChannel | null, now: () => number) {
  const stored = useStaffAssessments()[bookingId]
  const [card, setCard] = useState<SharedAssessment | null>(() => stored ? { ...stored, stamps: {} } : null)
  const [shared, setShared] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')
  const latest = useRef({ card, shared })
  latest.current = { card, shared }
  const dirty = useRef(false)

  // The stored assessment arrives after the first render on a cold load.
  useEffect(() => { if (stored && !latest.current.card) setCard({ ...stored, stamps: {} }) }, [stored])

  const send = useCallback((type: 'share' | 'edit', state: SharedAssessment) => channel?.send({ kind: 'mg-room', type, state }), [channel])

  const update = useCallback((next: SharedAssessment) => {
    dirty.current = true
    setCard(next)
    if (latest.current.shared) send('edit', next)
  }, [send])

  const setProgram = useCallback((program: AssessedProgram) => {
    const next = { program, answers: {}, stamps: {} }
    dirty.current = true
    setCard(next)
    if (latest.current.shared) send('share', next)
  }, [send])

  const setAnswers = useCallback((answers: Answers) => {
    const c = latest.current.card
    if (!c) return
    update({ program: c.program, answers, stamps: stampChanges(c.answers, answers, c.stamps, now()) })
  }, [update, now])

  const share = useCallback(() => {
    const c = latest.current.card
    if (!c) return
    setShared(true)
    send('share', c)
  }, [send])
  const stop = useCallback(() => { setShared(false); channel?.send({ kind: 'mg-room', type: 'stop' }) }, [channel])

  useEffect(() => channel?.listen(m => {
    const { card: c, shared: on } = latest.current
    if (m.type === 'hello' && on && c) send('share', c)
    if (m.type === 'edit' && on && c) {
      dirty.current = true
      setCard(mergeShared(c, m.state))
    }
  }), [channel, send])

  // Saves a moment after the last change, from either side. The client never writes to the database.
  useEffect(() => {
    if (!card || !dirty.current) return
    setSave('saving')
    const id = setTimeout(() => {
      dirty.current = false
      repo.staffSaveAssessment(bookingId, { program: card.program, answers: pruneAnswers(card.program, card.answers) })
        .then(() => setSave('saved'), () => { dirty.current = true; setSave('error') })
    }, SAVE_AFTER_MS)
    return () => clearTimeout(id)
  }, [card, bookingId])

  return { card, shared, save, setProgram, setAnswers, share, stop }
}

/** The client's side: the card appears when the consultant sends it, and every change goes back to them. */
export function useClientAssessment(channel: RoomChannel | null, now: () => number) {
  const [card, setCard] = useState<SharedAssessment | null>(null)
  /** What the client is told: nothing, the transcript for the summary, or a video recording too. */
  const [recording, setRecording] = useState<false | 'notes' | 'video'>(false)
  const latest = useRef(card)
  latest.current = card

  useEffect(() => {
    if (!channel) return
    const off = channel.listen(m => {
      if (m.type === 'share') setCard(m.state)
      else if (m.type === 'edit') setCard(c => (c ? mergeShared(c, m.state) : c))
      else if (m.type === 'stop') setCard(null)
      else if (m.type === 'recording') setRecording(m.on ? (m.video ? 'video' : 'notes') : false)
    })
    // Arriving late (or reloading): ask for the card in case it is already shared.
    channel.send({ kind: 'mg-room', type: 'hello' })
    return off
  }, [channel])

  const setAnswers = useCallback((answers: Answers) => {
    const c = latest.current
    if (!c) return
    const next = { program: c.program, answers, stamps: stampChanges(c.answers, answers, c.stamps, now()) }
    setCard(next)
    channel?.send({ kind: 'mg-room', type: 'edit', state: next })
  }, [channel, now])

  return { card, recording, setAnswers }
}
