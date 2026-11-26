// SHAPE-MATCHED ASCII — picks letters by their SHAPE, not only by brightness.
// Method: Alex Harri, "ASCII characters are not pixels" (alexharri.com/blog/ascii-rendering).
// Research notes: vault/Research/ASCII/Techniques.md (section 3).
//
// Every letter cell is split into 6 parts (2 columns x 3 rows).
//  - Once per font: draw every letter big and measure how much of each part it
//    covers -> a "shape vector" of 6 numbers per letter (T = heavy on top, _ = bottom…).
//  - Per frame: the picture is drawn on a hidden canvas with sx x sy pixels per
//    cell; we measure the same 6 parts of each cell and pick the letter whose
//    shape vector is closest. Edges then follow the outline (/ \ _ ( ' …).
//  - Contrast: uneven cells (edges) are pushed further apart -> sharper letters;
//    even cells (flat areas) hardly change.
// Not tied to the seagulls: any canvas effect (or a future editor) can use it.

export type ShapeAsciiOptions = {
  /** letters allowed in the output (space is always added) */
  chars: string
  /** hidden-canvas pixels per letter cell [x, y]; x must divide by 2, y by 3 */
  sub: [number, number]
  /** 1 = off; higher = sharper edges (1.5–2.5 is a good range) */
  contrast: number
  /** cells with less ink than this (0..1) stay empty */
  minInk: number
}

/** Every printable ASCII letter (space … ~). */
export const ALL_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')

const Q = 10 // cache: each of the 6 values is rounded to one of Q steps
const DIMS = 6

export class ShapeAscii {
  readonly sx: number
  readonly sy: number
  private chars: string[]
  private vecs: Float32Array // DIMS numbers per letter
  private cache = new Int16Array(Q ** DIMS).fill(-1)
  private contrast: number
  private minInk: number

  /**
   * @param family CSS font family used on screen (e.g. "'JetBrains Mono', monospace")
   * @param fontSize letter size in px, cellW / lineH = the letter cell on screen
   */
  constructor(family: string, fontSize: number, cellW: number, lineH: number, o: ShapeAsciiOptions) {
    this.sx = o.sub[0]
    this.sy = o.sub[1]
    this.contrast = o.contrast
    this.minInk = o.minInk
    this.chars = [...new Set(' ' + o.chars)]
    this.vecs = measureGlyphs(this.chars, family, fontSize, cellW, lineH)
  }

  /** Change the contrast later (lab slider). */
  setContrast(c: number) {
    this.contrast = c
  }

  /**
   * RGBA pixels of a hidden-canvas area (white = ink, read from the red channel)
   * that is cols x rows cells big (cols*sx x rows*sy pixels) -> one string per row.
   */
  convert(d: Uint8ClampedArray, cols: number, rows: number): string[] {
    const { sx, sy } = this
    const pw = cols * sx // pixels per row
    const hx = sx / 2, hy = sy / 3 // pixels per part
    const norm = 1 / (hx * hy * 255)
    const v = new Float32Array(DIMS)
    const out: string[] = []
    for (let r = 0; r < rows; r++) {
      let line = ''
      for (let c = 0; c < cols; c++) {
        v.fill(0)
        for (let y = 0; y < sy; y++) {
          const part = Math.floor(y / hy) * 2
          let i = ((r * sy + y) * pw + c * sx) * 4
          for (let x = 0; x < sx; x++, i += 4) v[part + (x < hx ? 0 : 1)] += d[i]
        }
        let max = 0
        for (let k = 0; k < DIMS; k++) {
          v[k] *= norm
          if (v[k] > max) max = v[k]
        }
        line += max < this.minInk ? ' ' : this.pick(v, max)
      }
      out.push(line)
    }
    return out
  }

  private pick(v: Float32Array, max: number): string {
    // contrast: (v / max) ^ contrast * max — edges sharper, flat areas unchanged
    let key = 0
    for (let k = 0; k < DIMS; k++) {
      const e = Math.pow(v[k] / max, this.contrast) * max
      key = key * Q + Math.min(Q - 1, Math.floor(e * Q))
    }
    let best = this.cache[key]
    if (best < 0) {
      // nearest letter to the middle of this cache step (same answer every time)
      let rest = key
      const q = new Float32Array(DIMS)
      for (let k = DIMS - 1; k >= 0; k--) {
        q[k] = ((rest % Q) + 0.5) / Q
        rest = Math.floor(rest / Q)
      }
      let bestD = Infinity
      for (let n = 0; n < this.chars.length; n++) {
        let dist = 0
        for (let k = 0; k < DIMS; k++) {
          const t = this.vecs[n * DIMS + k] - q[k]
          dist += t * t
        }
        if (dist < bestD) {
          bestD = dist
          best = n
        }
      }
      this.cache[key] = best
    }
    return this.chars[best]
  }
}

/** Draws each letter big (like on screen: textBaseline top) and measures its 6 parts. */
function measureGlyphs(chars: string[], family: string, fontSize: number, cellW: number, lineH: number) {
  const K = 8 // draw 8x bigger for exact numbers
  const W = Math.max(2, Math.round(cellW * K / 2) * 2)
  const H = Math.max(3, Math.round(lineH * K / 3) * 3)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.font = `${fontSize * K}px ${family}`
  g.textBaseline = 'top'
  g.fillStyle = '#fff'
  const vecs = new Float32Array(chars.length * DIMS)
  const hw = W / 2, hh = H / 3
  chars.forEach((ch, n) => {
    g.clearRect(0, 0, W, H)
    g.fillText(ch, 0, 0)
    const d = g.getImageData(0, 0, W, H).data
    for (let y = 0; y < H; y++) {
      const part = Math.floor(y / hh) * 2
      for (let x = 0; x < W; x++) vecs[n * DIMS + part + (x < hw ? 0 : 1)] += d[(y * W + x) * 4 + 3]
    }
    for (let k = 0; k < DIMS; k++) vecs[n * DIMS + k] /= hw * hh * 255
  })
  // scale each part so the fullest letter = 1 (a fully white cell part = 1 too)
  for (let k = 0; k < DIMS; k++) {
    let m = 0
    for (let n = 0; n < chars.length; n++) m = Math.max(m, vecs[n * DIMS + k])
    if (m > 0) for (let n = 0; n < chars.length; n++) vecs[n * DIMS + k] /= m
  }
  return vecs
}
