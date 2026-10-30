/** Shrinks an uploaded receipt photo to a JPEG data URL small enough to keep with the booking. */
export async function compressReceipt(file: File, maxSide = 1100, quality = 0.72): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A clearly labelled sample transfer screenshot for demo bookings. */
export function demoReceipt(method: 'instapay' | 'vodafone-cash', amount: number, txnRef: string, when: string): string {
  const brand = method === 'instapay' ? { name: 'InstaPay', color: '#4B2A86' } : { name: 'Vodafone Cash', color: '#E60000' }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
  <rect width="360" height="640" fill="#F4F5F7"/>
  <rect width="360" height="120" fill="${brand.color}"/>
  <text x="24" y="70" font-family="Arial" font-size="26" font-weight="700" fill="#fff">${brand.name}</text>
  <circle cx="180" cy="190" r="38" fill="#1E7A4F"/>
  <path d="M162 190 l12 12 l24 -26" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="180" y="270" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#17202A">Transfer successful</text>
  <text x="180" y="320" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#17202A">${amount.toLocaleString('en-US')} EGP</text>
  <g font-family="Arial" font-size="15" fill="#5B6773">
    <text x="24" y="390">To</text><text x="336" y="390" text-anchor="end" fill="#17202A">MG International</text>
    <text x="24" y="425">Reference</text><text x="336" y="425" text-anchor="end" fill="#17202A">${txnRef}</text>
    <text x="24" y="460">Date</text><text x="336" y="460" text-anchor="end" fill="#17202A">${when}</text>
  </g>
  <rect x="24" y="540" width="312" height="44" rx="10" fill="#FDF1DC"/>
  <text x="180" y="568" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#9A5B00">DEMO RECEIPT — not a real transfer</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
