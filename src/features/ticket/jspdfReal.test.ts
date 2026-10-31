import { jsPDF } from 'jspdf'

// Real jsPDF (no mocks): guards the ticketPdf code path (setFillColor/rect/addImage/output blob) across upgrades.
const PNG_1X1 =
 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('jsPDF (real)', () => {
 it('builds a ticket-style PDF with a filled rect and an image', async () => {
  const pdf = new jsPDF({ unit: 'pt', format: [300, 500], orientation: 'portrait' })
  pdf.setFillColor(246, 247, 249)
  pdf.rect(0, 0, 300, 500, 'F')
  pdf.addImage(PNG_1X1, 'PNG', 24, 24, 252, 452)
  const buf = pdf.output('arraybuffer')
  expect(buf.byteLength).toBeGreaterThan(200)
  expect(new TextDecoder().decode(new Uint8Array(buf, 0, 5))).toBe('%PDF-')
  const blob = pdf.output('blob')
  expect(blob.type).toBe('application/pdf')
  expect(blob.size).toBe(buf.byteLength)
  expect(pdf.getNumberOfPages()).toBe(1)
 })
})
