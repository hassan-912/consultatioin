/** A block of the document that should not be split across pages, in px from the top of the document. */
export interface Block { top: number; bottom: number }

/**
 * Where to cut a tall rendered document into pages, so no block is split: each cut falls on the end of the last
 * block that still fits. A block taller than a whole page is cut where the page ends. Returns the cut positions,
 * the last one being `total`.
 */
export function pageCuts(blocks: Block[], total: number, firstPage: number, nextPages: number): number[] {
  const ends = [...new Set(blocks.map(b => Math.ceil(b.bottom)))].sort((a, b) => a - b)
  const cuts: number[] = []
  let start = 0
  while (start < total) {
    const limit = start + (cuts.length === 0 ? firstPage : nextPages)
    if (limit >= total) { cuts.push(total); break }
    const fit = ends.filter(e => e > start && e <= limit)
    const cut = fit.length ? fit[fit.length - 1] : limit
    cuts.push(cut)
    start = cut
  }
  return cuts
}
