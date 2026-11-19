import { pruneAnswers, type Answers, type AssessedProgram } from '../../assessment/questions'

/**
 * The assessment card the consultant "sends to the room". It is not a screen share: both sides hold the same
 * answers and send each change to the other over the call's own private data channel (Daily app messages),
 * so the client can click and type in it. The consultant's side is the one that saves to the database.
 */

/** When each answer was last changed (ms), so two people editing at once can be merged question by question. */
export type Stamps = Record<string, number>
export interface SharedAssessment { program: AssessedProgram; answers: Answers; stamps: Stamps }

export type RoomMessage =
  /** Consultant → client: open the card (or replace it after a program change). */
  | { kind: 'mg-room'; type: 'share'; state: SharedAssessment }
  /** Either side: the whole card after a change, with its stamps. */
  | { kind: 'mg-room'; type: 'edit'; state: SharedAssessment }
  /** Consultant → client: close the card. */
  | { kind: 'mg-room'; type: 'stop' }
  /** Client → consultant: "I just arrived, send me the card if it is shared." */
  | { kind: 'mg-room'; type: 'hello' }
  /** Consultant → client: the call is being recorded (or not any more). */
  | { kind: 'mg-room'; type: 'recording'; on: boolean }

/** The private pipe between the people in one call. Daily in production, a BroadcastChannel in the prototype. */
export interface RoomChannel {
  send(message: RoomMessage): void
  listen(fn: (message: RoomMessage) => void): () => void
}

export const isRoomMessage = (x: unknown): x is RoomMessage =>
  typeof x === 'object' && x !== null && (x as { kind?: unknown }).kind === 'mg-room' && typeof (x as { type?: unknown }).type === 'string'

/** Stamps every answer that differs between `before` and `after` with `at`; unchanged answers keep their stamp. */
export function stampChanges(before: Answers, after: Answers, stamps: Stamps, at: number): Stamps {
  const next = { ...stamps }
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if ((before[id] ?? '') !== (after[id] ?? '')) next[id] = at
  }
  return next
}

/**
 * Merges an incoming copy of the card into ours. Both people may have changed answers in the same moment;
 * this decides which answer each question ends with. Returns a new state; never mutates its arguments.
 */
export function mergeShared(mine: SharedAssessment, theirs: SharedAssessment): SharedAssessment {
  // A different program means the consultant switched the card: theirs replaces ours entirely.
  if (theirs.program !== mine.program) return theirs
  // TODO(human): decide, question by question, whose answer wins when both sides have one.
  // Today the incoming copy simply replaces ours, so a client edit made a split second before the
  // consultant's message arrives is lost.
  const answers = theirs.answers
  const stamps = theirs.stamps
  return { program: mine.program, answers: pruneAnswers(mine.program, answers), stamps }
}

/** A BroadcastChannel stand-in for the prototype: two tabs of the same browser share one card. */
export function broadcastChannel(name: string): RoomChannel & { close(): void } {
  const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)
  return {
    send: message => { try { bc?.postMessage(message) } catch { /* closed: the page is leaving */ } },
    listen(fn) {
      const handler = (e: MessageEvent) => { if (isRoomMessage(e.data)) fn(e.data) }
      bc?.addEventListener('message', handler)
      return () => bc?.removeEventListener('message', handler)
    },
    close: () => bc?.close(),
  }
}
