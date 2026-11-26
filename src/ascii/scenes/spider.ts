// SPIDER — a long-legged ASCII spider (like a harvestman / "daddy long-legs").
// Settings: SPIDER below (final values from the studio: src/ascii/final.json).
//
// Two ways to move (`mode`):
//  - 'lines' (the app): a route like the gull's. It enters at one side, walks along
//    the bottom edge, the top edge or the sidebar footer line, and at each vertical
//    layout line (sidebar | middle | online list) it turns: low -> climbs up,
//    high -> goes down; then walks on and leaves on the other side. Feet grip the
//    line, the long legs bow out to both sides. The route comes from a seed, so every
//    user sees the same spider (points follow each user's own layout).
//  - 'floor' (studio only): it wanders on the screen as on a floor, knees up (3D look).
//
// Legs: 8 legs, thigh + shin, 2-bone IK. Feet stay planted and step in two groups
// (L1 R2 L3 R4 / R1 L2 R3 L4). Drawn white on a hidden canvas, then letters are
// picked by SHAPE (src/ascii/shapeAscii.ts) -> legs become / \ | _ ' , : letters.

import { applyFinal } from '../tune'
import { LETTER_SETS, ShapeAscii } from '../shapeAscii'
import { seededRandom } from '../../seagull/engine'

type P2 = [number, number]

export const SPIDER = {
  mode: 'lines' as 'lines' | 'floor', // climb the layout lines (app) or walk on a floor (studio)
  // ---- look ----
  fontSize: 10, // letter size (smaller = finer legs)
  lineHeight: 1.15,
  color: '#7a7a7a', // letter colour
  letters: LETTER_SETS.symbols, // letters it may use
  contrast: 1.8, // sharper letter edges (1 = off)
  minInk: 0.06, // less ink than this = empty cell
  legWidth: 2.6, // leg thickness (px on the hidden canvas, before letters)
  legInk: 0.75, // leg brightness 0..1 (lower = thin letters - / \ , higher = # @)
  bodySize: 0.018, // body radius, part of the screen height
  headSize: 0.55, // head size, part of the body size
  // ---- legs ----
  legLength: 0.2, // full leg length (thigh + shin), part of the screen height
  thigh: 0.45, // part of the leg that is the thigh (rest = shin)
  reach: 0.7, // how far the feet stand from the body (part of leg length)
  legSpread: [28, 150] as P2, // angle of the front pair .. back pair (degrees from forward)
  grip: 0.18, // lines: feet this far beside the line (part of leg length; 0 = exactly on it)
  bodyHeight: 0.3, // floor: body height above the floor (part of leg length)
  tilt: 0.55, // floor: how much height shows on screen (0 = straight from above)
  // ---- moving ----
  speed: 0.05, // floor: walking speed (screen widths / s)
  lineSpeed: 0.05, // lines: climbing speed (screen heights / s)
  turn: 1.8, // floor: how fast it turns (radians / s)
  stepAt: 0.32, // a foot steps when it is this far from its rest place (part of leg length)
  stepTime: 0.16, // seconds for one step
  stepLift: 0.18, // how high a foot lifts (part of leg length)
  bob: 0.04, // floor: body moves up/down with the steps
  pause: [0.5, 2.5] as P2, // seconds it stands still at a stop
  pauseChance: 0.35, // floor: chance to stand still at each new target
  stops: [1, 3] as P2, // lines: how many pauses on the way
  footChance: 0.4, // lines: chance to use the sidebar footer line (start on it / go down to it)
  edgeInset: 0.35, // lines: walk this far inside the top / bottom screen edge (part of leg length)
  followMouse: false, // floor: walk towards the mouse instead of wandering
  margin: 0.12, // floor: stay this far from the screen edge
  // ---- game (app) ----
  firstSpawn: [30, 180] as P2, // seconds until the first spider (leader)
  spawnEvery: [90, 420] as P2, // seconds between spiders
  hitRadius: 0.45, // click this close to the body counts (part of leg length)
}
applyFinal(SPIDER, 'spider')

// ============================ layout lines ==============================

export type LineId = 'side-r' | 'people-l' | 'foot-t'
export type Line = { x1: number; y1: number; x2: number; y2: number }
export type Lines = Partial<Record<LineId, Line>>

/**
 * The layout lines in canvas px, from the DOM under `root`:
 *  side-r   = right edge of .sidebar (top -> bottom)
 *  people-l = left edge of .people   (top -> bottom)
 *  foot-t   = top edge of .sidebar-foot (left -> the sidebar line)
 * On a phone (no columns) there are no vertical lines: the spider just walks across.
 */
export function layoutLines(root: ParentNode, canvas: HTMLCanvasElement): Lines {
  const cr = canvas.getBoundingClientRect()
  const k = cr.width / (canvas.clientWidth || 1) || 1
  const X = (x: number) => (x - cr.left) / k, Y = (y: number) => (y - cr.top) / k
  const H = canvas.clientHeight
  const box = (sel: string) => {
    const el = root.querySelector(sel)
    const r = el?.getBoundingClientRect()
    return r && r.width > 0 && r.height > 0 ? r : null
  }
  const narrow = (r: DOMRect | null) => !!r && r.width < (cr.width / k) * 0.6
  const side = box('.sidebar'), people = box('.people'), foot = box('.sidebar-foot')
  const lines: Lines = {}
  if (side && narrow(side)) {
    const x = X(side.right) - 0.5
    lines['side-r'] = { x1: x, y1: 0, x2: x, y2: H }
    if (foot) lines['foot-t'] = { x1: X(side.left), y1: Y(foot.top), x2: x, y2: Y(foot.top) }
  }
  if (people && narrow(people) && narrow(side)) {
    const x = X(people.left) + 0.5
    lines['people-l'] = { x1: x, y1: 0, x2: x, y2: H }
  }
  return lines
}

// ============================ route ==============================
// Like the gull: the route is planned once from the seed (same for everyone):
// enter at one side on a horizontal "rail" (bottom edge, top edge or the sidebar
// footer line) -> walk to the next vertical line -> LOW (bottom / footer)? climb up
// to the top; HIGH (top)? go down to the bottom (or, going left on the sidebar line,
// down to the footer line) -> walk on to the next vertical line -> ... -> leave
// the screen on the other side. Each user turns the plan into points on their own
// layout, so the spider follows their lines.

type Rail = 'top' | 'bottom' | 'foot'
type Plan = { dir: 1 | -1; start: Rail; turns: { line: LineId; to: Rail }[]; pauses: { at: number; time: number }[] }

// ============================ one spider ==============================

type Leg = {
  side: -1 | 1 // -1 = left, +1 = right
  angle: number // rest direction (radians from forward)
  group: 0 | 1 // step group
  foot: P2 // planted foot (px)
  from: P2
  to: P2
  t: number // step progress 0..1, or -1 = planted
}

const DEG = Math.PI / 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Spider {
  readonly id: string
  private rnd: () => number
  x = 0
  y = 0
  heading = 0
  legs: Leg[] = []
  private lastGroup: 0 | 1 = 1
  private placed = false
  done = false // left the screen
  // lines mode: plan (from the seed) + progress along this user's path
  private plan: Plan
  private path: P2[] = []
  private pathKey = ''
  private seg = 0 // current segment of the path
  private f = 0 // 0..1 along it
  private pauseAt = 0 // index of the next pause in plan.pauses
  private wait = 0
  // floor mode
  private target: P2 = [0, 0]
  private moving = true

  constructor(id: string, seed: number) {
    this.id = id
    this.rnd = seededRandom(seed)
    this.plan = this.makePlan()
  }

  private r(a: number, b: number) {
    return a + this.rnd() * (b - a)
  }

  /** the route plan, from the seed only (no screen sizes): the same for everyone */
  private makePlan(): Plan {
    const S = SPIDER
    const dir: 1 | -1 = this.rnd() < 0.5 ? 1 : -1
    // entering from the left, it may start on the sidebar footer line
    const x = this.rnd()
    const start: Rail = dir > 0 && x < S.footChance * 0.5 ? 'foot' : x < 0.5 + S.footChance * 0.25 ? 'bottom' : 'top'
    const order: LineId[] = dir > 0 ? ['side-r', 'people-l'] : ['people-l', 'side-r']
    const turns: Plan['turns'] = []
    let rail = start
    for (const line of order) {
      // low -> climb up, high -> go down
      let to: Rail = rail === 'top' ? 'bottom' : 'top'
      if (to === 'bottom' && line === 'side-r' && dir < 0 && this.rnd() < S.footChance) to = 'foot'
      turns.push({ line, to })
      rail = to
    }
    // pauses at random places along the whole route (0..1 of its segments)
    const n = Math.round(this.r(S.stops[0], S.stops[1]))
    const pauses = Array.from({ length: n }, () => ({ at: this.r(0.08, 0.92), time: this.r(S.pause[0], S.pause[1]) }))
      .sort((a, b) => a.at - b.at)
    return { dir, start, turns, pauses }
  }

  /** the plan as points on this user's layout */
  private buildPath(W: number, H: number, lines: Lines): P2[] {
    const inset = SPIDER.edgeInset * this.L(H)
    const railY = (r: Rail) => {
      if (r === 'top') return inset
      if (r === 'foot' && lines['foot-t']) return lines['foot-t'].y1
      return H - inset
    }
    const out = this.L(H) * 1.5 + 4 // start / end outside the screen
    const { dir } = this.plan
    let rail = this.plan.start
    if (rail === 'foot' && !lines['foot-t']) rail = 'bottom'
    const pts: P2[] = [[dir > 0 ? -out : W + out, railY(rail)]]
    for (const t of this.plan.turns) {
      const l = lines[t.line]
      if (!l) continue // this user has no such line (phone): keep walking
      let to = t.to
      if (to === 'foot' && !lines['foot-t']) to = 'bottom'
      pts.push([l.x1, railY(rail)], [l.x1, railY(to)])
      rail = to
    }
    pts.push([dir > 0 ? W + out : -out, railY(rail)])
    return pts
  }

  // ---------- legs ----------
  private L(H: number) {
    return SPIDER.legLength * H
  }

  /** direction of the current path segment */
  private segDir(): P2 {
    const a = this.path[this.seg], b = this.path[this.seg + 1]
    if (!a || !b) return [Math.cos(this.heading), Math.sin(this.heading)]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
  }

  private restFoot(leg: Leg, H: number, onLine: boolean): P2 {
    const S = SPIDER
    const R = S.reach * this.L(H)
    if (onLine) {
      // feet along the line (front legs ahead, back legs behind), a bit beside it
      const [dx, dy] = this.segDir()
      const nx = -dy, ny = dx
      const along = Math.cos(leg.angle) * R
      const beside = Math.sin(leg.angle) * S.grip * this.L(H) * leg.side
      return [this.x + dx * along + nx * beside, this.y + dy * along + ny * beside]
    }
    const a = this.heading + leg.side * leg.angle
    return [this.x + Math.cos(a) * R, this.y + Math.sin(a) * R]
  }

  private makeLegs(H: number, onLine: boolean) {
    const [a0, a1] = SPIDER.legSpread
    this.legs = []
    for (let i = 0; i < 4; i++) {
      const angle = lerp(a0, a1, i / 3) * DEG
      for (const side of [-1, 1] as const) {
        const group = ((i + (side > 0 ? 1 : 0)) % 2) as 0 | 1
        const leg: Leg = { side, angle, group, foot: [0, 0], from: [0, 0], to: [0, 0], t: -1 }
        leg.foot = this.restFoot(leg, H, onLine)
        this.legs.push(leg)
      }
    }
  }

  private stepLegs(dt: number, H: number, onLine: boolean, speedPx: number) {
    const S = SPIDER
    const stepping = this.legs.some((l) => l.t >= 0)
    for (const leg of this.legs) {
      if (leg.t < 0) continue
      leg.t += dt / Math.max(0.03, S.stepTime)
      if (leg.t >= 1) {
        leg.t = -1
        leg.foot = leg.to
      } else {
        const k = leg.t * leg.t * (3 - 2 * leg.t)
        leg.foot = [lerp(leg.from[0], leg.to[0], k), lerp(leg.from[1], leg.to[1], k)]
      }
    }
    if (stepping) return
    const limit = S.stepAt * this.L(H)
    const far = (l: Leg) => {
      const r = this.restFoot(l, H, onLine)
      return Math.hypot(l.foot[0] - r[0], l.foot[1] - r[1])
    }
    // the group that waited longest goes first, if any of its feet is too far
    for (const g of [this.lastGroup === 0 ? 1 : 0, this.lastGroup] as (0 | 1)[]) {
      const group = this.legs.filter((l) => l.group === g)
      if (!group.some((l) => far(l) > limit)) continue
      const ahead = speedPx * S.stepTime * 0.8 // land where the body will be
      for (const l of group) {
        const r = this.restFoot(l, H, onLine)
        l.from = l.foot
        l.to = [r[0] + Math.cos(this.heading) * ahead, r[1] + Math.sin(this.heading) * ahead]
        l.t = 0
      }
      this.lastGroup = g
      break
    }
  }

  // ---------- moving ----------
  /** lines mode: follow the route (rail -> vertical line -> rail -> … -> other side). */
  updateLines(dt: number, W: number, H: number, lines: Lines) {
    const S = SPIDER
    // (re)build the path when the layout changes; progress (segment + f) is kept
    const key = [W, H, ...Object.values(lines).map((l) => `${l!.x1 | 0},${l!.y1 | 0}`)].join('|')
    if (key !== this.pathKey) {
      this.path = this.buildPath(W, H, lines)
      this.pathKey = key
      this.seg = Math.min(this.seg, this.path.length - 2)
    }
    const segs = this.path.length - 1
    const pos = () => {
      const a = this.path[this.seg], b = this.path[this.seg + 1]
      return [lerp(a[0], b[0], this.f), lerp(a[1], b[1], this.f)] as P2
    }
    if (!this.placed) {
      ;[this.x, this.y] = pos()
      const [dx, dy] = this.segDir()
      this.heading = Math.atan2(dy, dx)
      this.makeLegs(H, true)
      this.placed = true
    }
    let speedPx = 0
    if (this.wait > 0) {
      this.wait -= dt
    } else {
      // walk along the path; segments are passed in order, corners are turns
      let move = S.lineSpeed * H * dt
      speedPx = S.lineSpeed * H
      while (move > 0 && this.seg < segs) {
        const a = this.path[this.seg], b = this.path[this.seg + 1]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const left = (1 - this.f) * len
        if (move < left) {
          this.f += move / len
          move = 0
        } else {
          move -= left
          this.seg++
          this.f = 0
        }
      }
      // a planned pause? (positions are parts of the whole route: segment + f)
      const p = this.plan.pauses[this.pauseAt]
      if (p && (this.seg + this.f) / segs >= p.at) {
        this.wait = p.time
        this.pauseAt++
      }
      if (this.seg >= segs) {
        this.done = true
        return
      }
    }
    ;[this.x, this.y] = pos()
    // turn smoothly towards the walking direction (corners)
    const [dx, dy] = this.segDir()
    this.heading += wrapAngle(Math.atan2(dy, dx) - this.heading) * Math.min(1, dt * 8)
    this.stepLegs(dt, H, true, speedPx)
  }

  /** floor mode (studio): wander or follow the mouse. */
  updateFloor(dt: number, W: number, H: number, mouse: { x: number; y: number; on: boolean }) {
    const S = SPIDER
    if (!this.placed) {
      this.x = W / 2
      this.y = H / 2
      this.heading = this.r(-Math.PI, Math.PI)
      this.pick(W, H)
      this.makeLegs(H, false)
      this.placed = true
    }
    const L = this.L(H)
    if (S.followMouse && mouse.on) {
      this.target = [mouse.x, mouse.y]
      this.moving = Math.hypot(this.target[0] - this.x, this.target[1] - this.y) > L * 0.3
    } else if (!this.moving) {
      this.wait -= dt
      if (this.wait <= 0) this.moving = true
    } else if (Math.hypot(this.target[0] - this.x, this.target[1] - this.y) < L * 0.3) {
      this.pick(W, H)
      if (this.rnd() < S.pauseChance) {
        this.moving = false
        this.wait = this.r(S.pause[0], S.pause[1])
      }
    }
    let v = 0
    if (this.moving) {
      const want = Math.atan2(this.target[1] - this.y, this.target[0] - this.x)
      const d = wrapAngle(want - this.heading)
      this.heading += Math.max(-S.turn * dt, Math.min(S.turn * dt, d))
      v = S.speed * W * (0.35 + 0.65 * Math.max(0, Math.cos(d)))
      this.x += Math.cos(this.heading) * v * dt
      this.y += Math.sin(this.heading) * v * dt
    }
    this.stepLegs(dt, H, false, v)
  }

  private pick(W: number, H: number) {
    const m = SPIDER.margin
    this.target = [this.r(m, 1 - m) * W, this.r(m, 1 - m) * H]
  }

  // ---------- drawing ----------
  /** Draw on a hidden canvas (already transformed to screen px). */
  draw(h: CanvasRenderingContext2D, H: number) {
    const S = SPIDER
    const len = this.L(H)
    const a = len * S.thigh, b = len * (1 - S.thigh)
    const floor = S.mode === 'floor'
    const stepping = this.legs.some((l) => l.t >= 0)
    const bob = stepping ? S.bob * Math.sin(Math.PI * Math.max(0, ...this.legs.map((l) => l.t))) : 0
    const bz = floor ? len * (S.bodyHeight + bob) : 0
    const tilt = floor ? S.tilt : 0
    const br = S.bodySize * H
    const scr = (x: number, y: number, z: number): P2 => [x, y - z * tilt]

    const ink = Math.round(Math.max(0, Math.min(1, S.legInk)) * 255)
    h.strokeStyle = `rgb(${ink},${ink},${ink})`
    h.lineWidth = S.legWidth
    h.lineCap = 'round'
    h.lineJoin = 'round'
    for (const leg of this.legs) {
      const ha = this.heading + leg.side * leg.angle
      const hip: [number, number, number] = [this.x + Math.cos(ha) * br * 0.8, this.y + Math.sin(ha) * br * 0.8, bz]
      const lift = leg.t >= 0 ? Math.sin(Math.PI * leg.t) * S.stepLift * len : 0
      let knee: [number, number, number]
      let foot: [number, number, number]
      if (floor) {
        // 3D: knee bends UP in the plane through hip, foot and "up"
        foot = [leg.foot[0], leg.foot[1], lift]
        const dx = foot[0] - hip[0], dy = foot[1] - hip[1], dz = foot[2] - hip[2]
        const d = Math.min(Math.hypot(dx, dy, dz), (a + b) * 0.999)
        const ux = dx / (d || 1), uy = dy / (d || 1), uz = dz / (d || 1)
        const along = (a * a - b * b + d * d) / (2 * d || 1)
        const up = Math.sqrt(Math.max(0, a * a - along * along))
        let px = -uz * ux, py = -uz * uy, pz = 1 - uz * uz
        const pl = Math.hypot(px, py, pz) || 1
        px /= pl; py /= pl; pz /= pl
        knee = [hip[0] + ux * along + px * up, hip[1] + uy * along + py * up, hip[2] + uz * along + pz * up]
      } else {
        // on a line: flat 2D, the knee bows OUT to the leg's side; a lifted foot
        // moves a little outwards too
        const ox = -Math.sin(this.heading) * leg.side, oy = Math.cos(this.heading) * leg.side
        foot = [leg.foot[0] + ox * lift, leg.foot[1] + oy * lift, 0]
        const dx = foot[0] - hip[0], dy = foot[1] - hip[1]
        const d = Math.min(Math.hypot(dx, dy), (a + b) * 0.999)
        const ux = dx / (d || 1), uy = dy / (d || 1)
        const along = (a * a - b * b + d * d) / (2 * d || 1)
        const up = Math.sqrt(Math.max(0, a * a - along * along))
        let px = -uy, py = ux
        if (px * ox + py * oy < 0) { px = -px; py = -py }
        knee = [hip[0] + ux * along + px * up, hip[1] + uy * along + py * up, 0]
      }
      const P0 = scr(...hip), K = scr(...knee), F = scr(...foot)
      h.beginPath()
      h.moveTo(P0[0], P0[1])
      h.lineTo(K[0], K[1])
      h.lineTo(F[0], F[1])
      h.stroke()
    }
    // body + head (full white = dense letters)
    const [bx, by] = scr(this.x, this.y, bz)
    h.fillStyle = '#fff'
    h.beginPath()
    h.ellipse(bx, by, br, br * 0.8, this.heading, 0, Math.PI * 2)
    h.fill()
    const hr = br * S.headSize
    h.beginPath()
    h.ellipse(bx + Math.cos(this.heading) * br * 1.15, by + Math.sin(this.heading) * br * 1.15, hr, hr * 0.85, this.heading, 0, Math.PI * 2)
    h.fill()
  }

  /** screen box around the spider (px), for drawing and hit tests */
  box(H: number) {
    const pad = this.L(H) * 1.1 + SPIDER.bodySize * H * 2
    const up = SPIDER.mode === 'floor' ? this.L(H) * SPIDER.tilt : 0
    return { x0: this.x - pad, y0: this.y - pad - up, x1: this.x + pad, y1: this.y + pad }
  }
}

// ============================ the layer ==============================

/** Canvas that shows spiders as letters. */
export class SpiderLayer {
  spiders: Spider[] = []
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
    const S = SPIDER
    return [S.fontSize, S.lineHeight, S.letters, S.minInk, document.fonts?.status].join('|')
  }

  resize() {
    const S = SPIDER
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

  /** The spider under (x, y) canvas px, if any. */
  hitTest(x: number, y: number): Spider | null {
    const r = SPIDER.hitRadius * SPIDER.legLength * this.H
    return this.spiders.find((s) => Math.hypot(x - s.x, y - s.y) <= r) ?? null
  }

  /** Draw all spiders (clears the canvas first). */
  draw() {
    const S = SPIDER
    const { ctx, hctx, cellW, lineH, cols, rows } = this
    if (this.key !== this.settingsKey()) this.resize()
    const m = this.matcher!
    m.setContrast(S.contrast)
    ctx.clearRect(0, 0, this.W, this.H)
    const sx = m.sx, sy = m.sy
    for (const sp of this.spiders) {
      const b = sp.box(this.H)
      const c0 = Math.max(0, Math.floor(b.x0 / cellW)), c1 = Math.min(cols, Math.ceil(b.x1 / cellW))
      const r0 = Math.max(0, Math.floor(b.y0 / lineH)), r1 = Math.min(rows, Math.ceil(b.y1 / lineH))
      const bw = c1 - c0, bh = r1 - r0
      if (bw <= 0 || bh <= 0) continue
      hctx.setTransform(1, 0, 0, 1, 0, 0)
      hctx.fillStyle = '#000'
      hctx.fillRect(c0 * sx, r0 * sy, bw * sx, bh * sy)
      hctx.setTransform(sx / cellW, 0, 0, sy / lineH, 0, 0)
      sp.draw(hctx, this.H)
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
  /** called when a spider is caught (x, y = 0..1 of the canvas) */
  onCatch?: (x: number, y: number) => void
}

/** Runs spiders on a canvas for the studio. Returns stop() + actions. */
export function startSpider(canvas: HTMLCanvasElement, opt: StudioOptions = {}) {
  const layer = new SpiderLayer(canvas)
  const mouse = { x: -1, y: -1, on: false }
  let wait = 0.3, raf = 0, last = performance.now(), n = 0
  const spawn = () => {
    layer.spiders = [new Spider(`studio${n++}`, Math.floor(Math.random() * 4294967296))]
  }
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!layer.spiders.length) {
      wait -= dt
      if (wait <= 0) {
        spawn()
        wait = 1.2
      }
    }
    if (SPIDER.mode === 'lines') {
      const lines = layoutLines(opt.linesRoot ?? document, canvas)
      for (const s of layer.spiders) s.updateLines(dt, layer.W, layer.H, lines)
    } else {
      for (const s of layer.spiders) s.updateFloor(dt, layer.W, layer.H, mouse)
    }
    layer.spiders = layer.spiders.filter((s) => !s.done)
    layer.draw()
  }
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const k = r.width / (layer.W || 1) || 1
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }
  const onMove = (e: PointerEvent) => {
    const p = pos(e)
    mouse.x = p.x
    mouse.y = p.y
    mouse.on = p.x >= 0 && p.y >= 0 && p.x <= layer.W && p.y <= layer.H
  }
  const onDown = (e: PointerEvent) => {
    const p = pos(e)
    const s = layer.hitTest(p.x, p.y)
    if (!s) return
    layer.spiders = layer.spiders.filter((o) => o !== s)
    opt.onCatch?.(s.x / layer.W, s.y / layer.H)
  }
  const ro = new ResizeObserver(() => layer.resize())
  ro.observe(canvas)
  window.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  raf = requestAnimationFrame(loop)
  return {
    stop: () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
    },
    newSpider: spawn,
  }
}
