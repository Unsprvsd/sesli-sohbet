// BUTTERFLY — a small ASCII butterfly that flutters over the server screen and
// lands on the layout lines now and then.
// Settings: BUTTERFLY below (final values from the studio: src/ascii/final.json).
//
// Route (from a seed, so every user sees the same butterfly; the points follow each
// user's own layout): it enters at one side -> flutters to 1–2 free points -> lands on
// a layout line (sidebar line | online list line | sidebar footer line) -> rests there,
// slowly opening and closing its wings -> flies on -> ... -> leaves the screen.
// Flying: fast wing beats, the body bobs up with every beat, a wavy path.
// Seen from the front/top: head up, body tilts a bit to the side it flies to.
// Drawn white on a hidden canvas, then letters are picked by SHAPE (shapeAscii.ts).

import { applyFinal } from '../tune'
import { LETTER_SETS, ShapeAscii } from '../shapeAscii'
import { seededRandom } from '../../seagull/engine'
import { layoutLines, type LineId, type Lines } from './spider'

type P2 = [number, number]

export const BUTTERFLY = {
  // ---- look ----
  size: 0.038, // wingspan, part of the screen height
  fontSize: 7, // letter size (smaller = finer wings)
  lineHeight: 1.15,
  color: '#686868', // letter colour (spider -15%)
  letters: LETTER_SETS.symbols, // letters it may use
  contrast: 1.8, // sharper letter edges (1 = off)
  minInk: 0.06, // less ink than this = empty cell
  wingInk: 0.75, // fore wing brightness 0..1
  hindInk: 0.6, // hind wing brightness 0..1
  spots: true, // a dark spot on each fore wing
  antennae: 1.2, // antenna thickness (px on the hidden canvas, 0 = none)
  // ---- flying ----
  flySpeed: 0.13, // screen heights per second
  flapHz: 3.2, // wing beats per second while flying
  minOpen: 0.15, // how far the wings close on a beat (0 = fully, 1 = never)
  bob: 0.25, // body bobs up with each beat (part of the wingspan)
  wobble: 0.9, // how wavy the path is (radians)
  turn: 4, // how fast it turns (radians / s)
  tilt: 25, // body tilts to the side it flies to (degrees)
  freePoints: [1, 2] as P2, // free points before each landing
  // ---- landing ----
  landings: [1, 3] as P2, // how many times it lands on the way
  rest: [3, 8] as P2, // seconds it sits on a line
  restPeriod: 2.6, // seconds for one slow open + close while sitting
  restMin: 0.1, // sitting: how far the wings close (0 = fully)
  // ---- game (app) ----
  firstSpawn: [60, 240] as P2, // seconds until the first butterfly (leader)
  spawnEvery: [120, 480] as P2, // seconds between butterflies
  hitRadius: 0.9, // click this close to the body counts (part of the wingspan)
}
applyFinal(BUTTERFLY, 'butterfly')

// ============================ route plan ==============================

type Step =
  | { k: 'fly'; x: number; y: number } // free point, 0..1 of the screen
  | { k: 'land'; line: LineId; t: number; rest: number } // t = 0..1 along the line
  | { k: 'exit'; y: number }

const DEG = Math.PI / 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const LINES: LineId[] = ['side-r', 'people-l', 'foot-t']
/** after this many seconds it leaves, whatever the plan says */
const MAX_LIFE = 180

// ============================ one butterfly ==============================

export class Butterfly {
  readonly id: string
  private rnd: () => number
  x = 0
  y = 0
  /** drawn y offset from the wing beats (px) */
  bobY = 0
  done = false
  private dir: 1 | -1
  private startY: number
  private steps: Step[]
  private step = 0
  private placed = false
  private heading = 0
  private age = 0
  private phase = 0 // wing beat phase (radians)
  private open = 1 // shown wing opening 0..1
  private tiltNow = 0
  private resting = -1 // seconds left on the line, -1 = flying
  private restT = 0
  private p1: number
  private p2: number

  constructor(id: string, seed: number) {
    this.id = id
    this.rnd = seededRandom(seed)
    const S = BUTTERFLY
    this.dir = this.rnd() < 0.5 ? 1 : -1
    this.startY = this.r(0.15, 0.85)
    this.p1 = this.r(0, Math.PI * 2)
    this.p2 = this.r(0, Math.PI * 2)
    this.steps = []
    const lands = Math.round(this.r(S.landings[0], S.landings[1]))
    for (let i = 0; i < lands; i++) {
      const n = Math.round(this.r(S.freePoints[0], S.freePoints[1]))
      for (let j = 0; j < n; j++) this.steps.push({ k: 'fly', x: this.r(0.1, 0.9), y: this.r(0.12, 0.88) })
      const line = LINES[Math.floor(this.rnd() * LINES.length)]
      this.steps.push({ k: 'land', line, t: this.r(0.15, 0.85), rest: this.r(S.rest[0], S.rest[1]) })
    }
    this.steps.push({ k: 'fly', x: this.r(0.2, 0.8), y: this.r(0.12, 0.88) })
    this.steps.push({ k: 'exit', y: this.r(0.15, 0.85) })
  }

  private r(a: number, b: number) {
    return a + this.rnd() * (b - a)
  }

  /** wingspan in px */
  span(H: number) {
    return BUTTERFLY.size * H
  }

  /** where a landing step is on this user's layout (null = that line is missing here) */
  private landPoint(s: Step & { k: 'land' }, lines: Lines, H: number): P2 | null {
    const l = lines[s.line]
    if (!l) return null
    const p: P2 = [lerp(l.x1, l.x2, s.t), lerp(l.y1, l.y2, s.t)]
    // on a horizontal line it sits ON the line (body above it)
    if (l.y1 === l.y2) p[1] -= this.span(H) * 0.3
    return p
  }

  private target(W: number, H: number, lines: Lines): P2 | null {
    const s = this.steps[this.step]
    if (!s) return null
    if (s.k === 'fly') return [s.x * W, s.y * H]
    if (s.k === 'exit') return [this.dir > 0 ? W + this.out(H) : -this.out(H), s.y * H]
    return this.landPoint(s, lines, H)
  }

  private out(H: number) {
    return this.span(H) * 2 + 4
  }

  update(dt: number, W: number, H: number, lines: Lines) {
    const S = BUTTERFLY
    this.age += dt
    if (!this.placed) {
      this.x = this.dir > 0 ? -this.out(H) : W + this.out(H)
      this.y = this.startY * H
      this.heading = this.dir > 0 ? 0 : Math.PI
      this.placed = true
    }
    if (this.age > MAX_LIFE && this.resting < 0) this.step = this.steps.length - 1
    // skip landings on lines this user does not have (phone: no columns)
    while (this.steps[this.step]?.k === 'land' && !this.target(W, H, lines)) this.step++
    const cur = this.steps[this.step]
    if (!cur) {
      this.done = true
      return
    }

    let wantOpen: number
    let wantTilt = 0
    if (this.resting >= 0) {
      // sitting on a line: follow it (the layout can change), wings open + close slowly
      const p = this.target(W, H, lines)
      if (p) [this.x, this.y] = p
      this.resting -= dt
      this.restT += dt
      const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.restT) / Math.max(0.3, S.restPeriod))
      wantOpen = S.restMin + (1 - S.restMin) * k
      this.bobY *= Math.max(0, 1 - dt * 10)
      if (this.resting < 0 || !p) {
        this.resting = -1
        this.step++
        this.heading = -Math.PI / 2 // take off upwards
      }
    } else {
      const p = this.target(W, H, lines)!
      const dx = p[0] - this.x, dy = p[1] - this.y
      const dist = Math.hypot(dx, dy)
      const landing = cur.k === 'land'
      const slowR = 0.12 * H
      const near = Math.min(1, dist / slowR)
      // wavy path: steer to the target + a wobble (less wobble close to a landing)
      const t = this.age
      const wob = S.wobble * (Math.sin(t * 1.7 + this.p1) + 0.6 * Math.sin(t * 3.3 + this.p2)) * (landing ? near : 1)
      const want = Math.atan2(dy, dx) + wob
      const turn = S.turn * (landing && near < 1 ? 2 : 1)
      this.heading += Math.max(-turn * dt, Math.min(turn * dt, wrapAngle(want - this.heading)))
      const speed = S.flySpeed * H * (landing ? 0.3 + 0.7 * near : 1)
      const stepLen = speed * dt
      if ((landing && dist <= Math.max(2, stepLen * 1.5)) || (!landing && dist < 0.05 * H)) {
        if (landing) {
          ;[this.x, this.y] = p
          this.resting = cur.rest
          this.restT = 0
        } else if (cur.k === 'exit') {
          this.done = true
          return
        } else this.step++
      } else {
        this.x += Math.cos(this.heading) * stepLen
        this.y += Math.sin(this.heading) * stepLen
      }
      // the exit is outside the screen: done once it is out
      if (cur.k === 'exit' && (this.x < -this.out(H) * 0.9 || this.x > W + this.out(H) * 0.9)) {
        this.done = true
        return
      }
      this.phase += dt * S.flapHz * Math.PI * 2
      const beat = 0.5 + 0.5 * Math.cos(this.phase)
      wantOpen = S.minOpen + (1 - S.minOpen) * beat
      this.open = wantOpen // beats are fast: no smoothing
      this.bobY = -S.bob * this.span(H) * Math.sin(this.phase) * 0.5
      wantTilt = Math.max(-1, Math.min(1, Math.cos(this.heading) * 1.5)) * S.tilt * DEG
    }
    this.open += (wantOpen - this.open) * Math.min(1, dt * 10)
    this.tiltNow += (wantTilt - this.tiltNow) * Math.min(1, dt * 5)
  }

  /** Draw on a hidden canvas (already transformed to screen px). */
  draw(h: CanvasRenderingContext2D, H: number) {
    const S = BUTTERFLY
    const s = this.span(H) / 2 // half span = 1 unit below
    const ink = (v: number) => {
      const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
      return `rgb(${c},${c},${c})`
    }
    h.save()
    h.translate(this.x, this.y + this.bobY)
    h.rotate(this.tiltNow)
    h.scale(s, s)
    for (const side of [-1, 1]) {
      h.save()
      h.scale(side * Math.max(0.02, this.open), 1)
      // hind wing (drawn first, the fore wing lies over it)
      h.fillStyle = ink(S.hindInk)
      h.beginPath()
      h.moveTo(0.04, 0)
      h.bezierCurveTo(0.6, 0, 0.85, 0.35, 0.65, 0.6)
      h.bezierCurveTo(0.45, 0.82, 0.15, 0.55, 0.04, 0.3)
      h.closePath()
      h.fill()
      // fore wing
      h.fillStyle = ink(S.wingInk)
      h.beginPath()
      h.moveTo(0.04, -0.12)
      h.bezierCurveTo(0.35, -0.75, 0.9, -0.95, 1, -0.7)
      h.bezierCurveTo(1.05, -0.4, 0.7, -0.05, 0.04, 0.04)
      h.closePath()
      h.fill()
      if (S.spots) {
        h.fillStyle = '#000'
        h.beginPath()
        h.ellipse(0.62, -0.55, 0.13, 0.11, 0, 0, Math.PI * 2)
        h.fill()
      }
      h.restore()
    }
    // body + head
    h.fillStyle = '#fff'
    h.beginPath()
    h.ellipse(0, 0.06, 0.07, 0.42, 0, 0, Math.PI * 2)
    h.fill()
    h.beginPath()
    h.arc(0, -0.38, 0.09, 0, Math.PI * 2)
    h.fill()
    if (S.antennae > 0) {
      h.strokeStyle = '#fff'
      h.lineWidth = S.antennae / s
      h.lineCap = 'round'
      for (const side of [-1, 1]) {
        h.beginPath()
        h.moveTo(side * 0.02, -0.44)
        h.quadraticCurveTo(side * 0.08, -0.75, side * 0.28, -0.88)
        h.stroke()
      }
    }
    h.restore()
  }

  /** screen box around the butterfly (px), for drawing */
  box(H: number) {
    const pad = this.span(H) * 0.7
    const by = this.y + this.bobY
    return { x0: this.x - pad, y0: by - pad, x1: this.x + pad, y1: by + pad }
  }
}

// ============================ the layer ==============================

/** Canvas that shows butterflies as letters. */
export class ButterflyLayer {
  butterflies: Butterfly[] = []
  private ctx: CanvasRenderingContext2D
  private hidden = document.createElement('canvas')
  private hctx = this.hidden.getContext('2d', { willReadFrequently: true })!
  private matcher: ShapeAscii | null = null
  private key = ''
  readonly font: string
  W = 0
  H = 0
  cols = 0
  rows = 0
  cellW = 6
  lineH = 12

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.font = getComputedStyle(canvas).fontFamily || 'monospace'
    this.resize()
  }

  private settingsKey() {
    const S = BUTTERFLY
    return [S.fontSize, S.lineHeight, S.letters, S.minInk, document.fonts?.status].join('|')
  }

  resize() {
    const S = BUTTERFLY
    const { canvas, ctx } = this
    this.W = canvas.clientWidth
    this.H = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = this.W * dpr
    canvas.height = this.H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${S.fontSize}px ${this.font}`
    ctx.textBaseline = 'top'
    this.cellW = ctx.measureText('M').width || 6
    this.lineH = Math.round(S.fontSize * S.lineHeight)
    this.cols = Math.ceil(this.W / this.cellW)
    this.rows = Math.ceil(this.H / this.lineH)
    this.matcher = new ShapeAscii(this.font, S.fontSize, this.cellW, this.lineH, {
      chars: S.letters, sub: [6, 9], contrast: S.contrast, minInk: S.minInk,
    })
    this.hidden.width = this.cols * this.matcher.sx
    this.hidden.height = this.rows * this.matcher.sy
    this.key = this.settingsKey()
  }

  /** The butterfly under (x, y) canvas px, if any. */
  hitTest(x: number, y: number): Butterfly | null {
    const r = BUTTERFLY.hitRadius * BUTTERFLY.size * this.H
    return this.butterflies.find((b) => Math.hypot(x - b.x, y - (b.y + b.bobY)) <= r) ?? null
  }

  update(dt: number, lines: Lines) {
    for (const b of this.butterflies) b.update(dt, this.W, this.H, lines)
    this.butterflies = this.butterflies.filter((b) => !b.done)
  }

  /** Draw all butterflies (clears the canvas first). */
  draw() {
    const S = BUTTERFLY
    const { ctx, hctx, cellW, lineH, cols, rows } = this
    if (this.key !== this.settingsKey()) this.resize()
    const m = this.matcher!
    m.setContrast(S.contrast)
    ctx.clearRect(0, 0, this.W, this.H)
    const sx = m.sx, sy = m.sy
    for (const bf of this.butterflies) {
      const b = bf.box(this.H)
      const c0 = Math.max(0, Math.floor(b.x0 / cellW)), c1 = Math.min(cols, Math.ceil(b.x1 / cellW))
      const r0 = Math.max(0, Math.floor(b.y0 / lineH)), r1 = Math.min(rows, Math.ceil(b.y1 / lineH))
      const bw = c1 - c0, bh = r1 - r0
      if (bw <= 0 || bh <= 0) continue
      hctx.setTransform(1, 0, 0, 1, 0, 0)
      hctx.fillStyle = '#000'
      hctx.fillRect(c0 * sx, r0 * sy, bw * sx, bh * sy)
      hctx.setTransform(sx / cellW, 0, 0, sy / lineH, 0, 0)
      bf.draw(hctx, this.H)
      const data = hctx.getImageData(c0 * sx, r0 * sy, bw * sx, bh * sy).data
      ctx.fillStyle = S.color
      ctx.font = `${S.fontSize}px ${this.font}`
      m.convert(data, bw, bh).forEach((line, y) => {
        if (line.trim()) ctx.fillText(line, c0 * cellW, (r0 + y) * lineH)
      })
    }
  }
}

// ============================ studio runner ==============================

type StudioOptions = {
  /** where to read the layout lines from (the studio's mock layout) */
  linesRoot?: ParentNode
}

/** Runs butterflies on a canvas for the studio. Returns stop() + a "new" action. */
export function startButterfly(canvas: HTMLCanvasElement, opt: StudioOptions = {}) {
  const layer = new ButterflyLayer(canvas)
  if (import.meta.env.DEV) (window as unknown as { __studioButterflies: ButterflyLayer }).__studioButterflies = layer
  let wait = 0.3, raf = 0, last = performance.now(), n = 0
  const spawn = () => {
    layer.butterflies = [new Butterfly(`studio${n++}`, Math.floor(Math.random() * 4294967296))]
  }
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!layer.butterflies.length) {
      wait -= dt
      if (wait <= 0) {
        spawn()
        wait = 1.2
      }
    }
    layer.update(dt, layoutLines(opt.linesRoot ?? document, canvas))
    layer.draw()
  }
  const onDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const k = r.width / (layer.W || 1) || 1
    const b = layer.hitTest((e.clientX - r.left) / k, (e.clientY - r.top) / k)
    if (b) layer.butterflies = layer.butterflies.filter((o) => o !== b)
  }
  const ro = new ResizeObserver(() => layer.resize())
  ro.observe(canvas)
  canvas.addEventListener('pointerdown', onDown)
  raf = requestAnimationFrame(loop)
  return {
    stop: () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
    },
    newButterfly: spawn,
  }
}
