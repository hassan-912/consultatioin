import { useEffect, useState } from 'react'
import { repo } from '.'
import { isLive } from './mode'
import { useAppStore } from '../store/useAppStore'
import type { MessageTemplates } from '../config/messageTemplates'

let cached: MessageTemplates | undefined
let request: Promise<MessageTemplates> | undefined
const listeners = new Set<(t: MessageTemplates) => void>()

/** Reloads the admin's message wording (after a save, or when another tab changes it). */
export function refreshMessageTemplates() {
  request ??= repo.messageTemplates()
    .then(t => { cached = t; listeners.forEach(fn => fn(t)); return t })
    .finally(() => { request = undefined })
  return request
}

/** The admin's WhatsApp message wording; staff screens fall back to the defaults while it loads or if it can't. */
export function useMessageTemplates(): MessageTemplates {
  const local = useAppStore(s => s.messageTemplates)
  const [live, setLive] = useState<MessageTemplates>(cached ?? {})
  useEffect(() => {
    if (!isLive) return
    listeners.add(setLive)
    if (!cached) void refreshMessageTemplates().catch(() => undefined)
    return () => { listeners.delete(setLive) }
  }, [])
  return isLive ? live : local
}
