import { toJpeg } from 'html-to-image'
import { jsPDF } from 'jspdf'

type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> }
type ClaudeRuntime = { use: (name: string) => Promise<unknown> }

const runtime = () => (window as unknown as { claude?: ClaudeRuntime }).claude

/**
 * Where a file can be saved: inside the claude.ai artifact viewer page downloads are blocked, so the
 * viewer's `downloads` capability is used; elsewhere a normal browser download works.
 */
export async function getSaver(): Promise<((filename: string, data: Blob) => Promise<void>) | null> {
  const claude = runtime()
  if (claude?.use) {
    const downloads = (await claude.use('downloads').catch(() => null)) as Downloads | null
    return downloads ? async (filename, data) => void (await downloads.save({ filename, data })) : null
  }
  if (import.meta.env.MODE === 'artifact') return null
  return async (filename, data) => {
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
}

/** Renders the boarding-pass element into a single-page PDF sized to the ticket. */
export async function ticketPdf(node: HTMLElement): Promise<Blob> {
  const jpg = await toJpeg(node, { pixelRatio: 2, quality: 0.88, backgroundColor: '#F6F7F9', skipFonts: true })
  const { width, height } = node.getBoundingClientRect()
  const margin = 24
  const pdf = new jsPDF({ unit: 'pt', format: [width + margin * 2, height + margin * 2], orientation: 'portrait' })
  pdf.setFillColor(246, 247, 249)
  pdf.rect(0, 0, width + margin * 2, height + margin * 2, 'F')
  pdf.addImage(jpg, 'JPEG', margin, margin, width, height)
  return pdf.output('blob')
}
