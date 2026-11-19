import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { getSaver } from '../../ticket/ticketPdf'
import { pageCuts } from './pageCuts'

/** The document is laid out 794 px wide: A4 at 96 dpi. */
export const PAGE_WIDTH = 794
const A4 = { w: 595.28, h: 841.89 }
const PAGE_HEIGHT = Math.floor(PAGE_WIDTH * A4.h / A4.w)
const FOOTER = 54
const TOP = 46
const SCALE = 2

/** Renders `node` to a canvas with the page's web fonts; falls back to system fonts when a font cannot be embedded. */
async function capture(node: HTMLElement) {
  const opts = { pixelRatio: SCALE, backgroundColor: '#ffffff', width: PAGE_WIDTH }
  try { return await toCanvas(node, opts) } catch { return toCanvas(node, { ...opts, skipFonts: true }) }
}

/** Cuts the rendered document into A4 pages between its `data-pdf-block` sections, with a footer on each page. */
export async function documentPdf(node: HTMLElement, footer: string): Promise<Blob> {
  const origin = node.getBoundingClientRect().top
  const blocks = [...node.querySelectorAll<HTMLElement>('[data-pdf-block]')].map(el => {
    const r = el.getBoundingClientRect()
    return { top: r.top - origin, bottom: r.bottom - origin }
  })
  const total = Math.ceil(node.scrollHeight)
  const canvas = await capture(node)
  const cuts = pageCuts(blocks, total, PAGE_HEIGHT - FOOTER, PAGE_HEIGHT - FOOTER - TOP)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  const pt = A4.w / PAGE_WIDTH
  let from = 0
  cuts.forEach((to, i) => {
    if (i > 0) pdf.addPage()
    const offset = i === 0 ? 0 : TOP
    const page = document.createElement('canvas')
    page.width = PAGE_WIDTH * SCALE
    page.height = PAGE_HEIGHT * SCALE
    const ctx = page.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, page.width, page.height)
    ctx.drawImage(canvas, 0, from * SCALE, canvas.width, (to - from) * SCALE, 0, offset * SCALE, canvas.width, (to - from) * SCALE)
    pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4.w, A4.h, undefined, 'FAST')
    // Footer: a hairline in MG gold, the firm and the page number.
    const y = A4.h - 30
    pdf.setDrawColor(201, 168, 106)
    pdf.setLineWidth(0.6)
    pdf.line(48 * pt, y - 12, A4.w - 48 * pt, y - 12)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(100, 116, 139)
    pdf.text(footer, 48 * pt, y)
    pdf.text(`Page ${i + 1} of ${cuts.length}`, A4.w - 48 * pt, y, { align: 'right' })
    from = to
  })
  return pdf.output('blob')
}

/**
 * Lays `doc` out off screen, turns it into a PDF and downloads it as `fileName`.
 * Rendered off screen rather than printed, so the client gets a real file in one tap, Arabic included.
 */
export async function downloadDocument(doc: ReactElement, fileName: string, footer: string) {
  const save = await getSaver()
  if (!save) throw new Error('DOWNLOAD_BLOCKED')
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_WIDTH}px;pointer-events:none;`
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(doc))
    await document.fonts?.ready
    await Promise.all([...host.querySelectorAll('img')].map(img => img.decode().catch(() => undefined)))
    const blob = await documentPdf(host.firstElementChild as HTMLElement, footer)
    await save(fileName, blob)
  } finally {
    root.unmount()
    host.remove()
  }
}
