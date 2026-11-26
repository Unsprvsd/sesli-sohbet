// Draws a SeagullFlock (gulls + catch waves) on a canvas sized by CSS.
// Used by the server screen (AsciiSeagulls.tsx) and the studio (ascii-studio.html).

import { GullPainter, type SeagullFlock } from './engine'
import { SHAPE } from './shape'
import { SETTINGS } from './settings'

export class GullScreen {
  private ctx: CanvasRenderingContext2D
  private painter = new GullPainter()
  private font: string
  private key = ''
  cols = 0
  rows = 0
  cellW = 4
  lineH = 8
  W = 0
  H = 0
  private drawn = false

  constructor(private canvas: HTMLCanvasElement, private flock: SeagullFlock) {
    this.ctx = canvas.getContext('2d')!
    this.font = getComputedStyle(canvas).fontFamily || 'monospace'
    this.resize()
  }

  /** settings that need a new measure / new letter matcher */
  private settingsKey() {
    const R = SETTINGS.render
    return [R.fontSize, R.lineHeight, R.letters, R.shape.chars, R.shape.sub, R.shape.minInk, R.shape.contrast].join('|')
  }

  resize() {
    const { canvas, ctx } = this
    const R = SETTINGS.render
    this.W = canvas.clientWidth
    this.H = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = this.W * dpr
    canvas.height = this.H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${R.fontSize}px ${this.font}`
    ctx.textBaseline = 'top'
    this.lineH = Math.round(R.fontSize * R.lineHeight)
    this.cellW = ctx.measureText('M').width || 4
    this.cols = Math.ceil(this.W / this.cellW)
    this.rows = Math.ceil(this.H / this.lineH)
    this.painter.setup(this.font, R.fontSize, this.cellW, this.lineH, this.cols, this.rows)
    this.key = this.settingsKey()
  }

  /** Draw one frame (gulls unless `noGulls`, then waves). */
  draw(noGulls = false) {
    const { ctx, flock } = this
    if (this.key !== this.settingsKey()) this.resize()
    if (!flock.gulls.length && !flock.waves.length) {
      if (this.drawn) ctx.clearRect(0, 0, this.W, this.H)
      this.drawn = false
      return
    }
    this.drawn = true
    ctx.clearRect(0, 0, this.W, this.H)
    if (!noGulls) this.drawGulls()
    this.drawWaves()
  }

  private drawGulls() {
    const { ctx, painter, flock, cols, rows, cellW, lineH } = this
    const R = SETTINGS.render
    const ratio = cellW / lineH
    const s = (cols * R.size) / SHAPE.width
    const rx = Math.ceil(s * 30) + 2 // half size of the area around a gull, in cells
    const ry = Math.ceil(s * 30 * ratio) + 2
    // only the area around each gull is cleared, drawn and turned into letters
    const boxes = flock.gulls.map((g) => {
      const x0 = Math.max(0, Math.floor(g.x * cols) - rx)
      const y0 = Math.max(0, Math.floor(g.y * rows) - ry)
      const x1 = Math.min(cols, Math.floor(g.x * cols) + rx)
      const y1 = Math.min(rows, Math.floor(g.y * rows) + ry)
      return { x0, y0, w: x1 - x0, h: y1 - y0 }
    }).filter((b) => b.w > 0 && b.h > 0)
    for (const b of boxes) painter.clear(b.x0, b.y0, b.w, b.h)
    for (const g of flock.gulls) painter.draw(g.pose, g.yaw, g.tilt, g.x * cols, g.y * rows, s, ratio)
    ctx.fillStyle = R.color
    for (const b of boxes) {
      painter.lines(b.x0, b.y0, b.w, b.h).forEach((line, y) => {
        if (line.trim()) ctx.fillText(line, b.x0 * cellW, (b.y0 + y) * lineH)
      })
    }
  }

  // wave: rings of letters growing from the catch point, fading out
  private drawWaves() {
    const { ctx, flock, cols, rows, cellW, lineH, W, H } = this
    const R = SETTINGS.render
    const WV = SETTINGS.catch.wave
    const ramp = R.ramp
    ctx.fillStyle = WV.color
    const maxR = WV.radius * W
    for (const wave of flock.waves) {
      const cx = wave.x * W, cy = wave.y * H
      const reach = maxR + WV.band * 2
      const c0 = Math.max(0, Math.floor((cx - reach) / cellW)), c1 = Math.min(cols, Math.ceil((cx + reach) / cellW))
      const r0 = Math.max(0, Math.floor((cy - reach) / lineH)), r1 = Math.min(rows, Math.ceil((cy + reach) / lineH))
      const rings: { r: number; a: number }[] = []
      for (let i = 0; i < WV.rings; i++) {
        const t = (wave.age - i * WV.ringDelay) / (WV.duration - (WV.rings - 1) * WV.ringDelay)
        if (t <= 0 || t >= 1) continue
        rings.push({ r: maxR * (1 - (1 - t) * (1 - t)), a: (1 - t) * (i === 0 ? 1 : 0.7) })
      }
      if (rings.length) {
        for (let row = r0; row < r1; row++) {
          let line = ''
          const py = (row + 0.5) * lineH
          for (let col = c0; col < c1; col++) {
            const px = (col + 0.5) * cellW
            const dist = Math.hypot(px - cx, py - cy)
            let v = 0
            for (const ring of rings) {
              const k = (dist - ring.r) / WV.band
              v = Math.max(v, Math.exp(-k * k) * ring.a)
            }
            line += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))]
          }
          if (line.trim()) ctx.fillText(line, c0 * cellW, row * lineH)
        }
      }
      // catcher's name in the middle, fading out
      if (wave.label) {
        const a = Math.max(0, 1 - wave.age / WV.duration)
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = '#e6e6e6'
        ctx.font = `12px ${this.font}`
        ctx.textAlign = 'center'
        ctx.fillText(wave.label, cx, cy - 6 - wave.age * 10)
        ctx.restore()
        ctx.font = `${R.fontSize}px ${this.font}`
      }
    }
  }
}
