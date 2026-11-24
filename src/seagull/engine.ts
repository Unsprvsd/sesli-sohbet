// SEAGULL ENGINE — moves and draws the gulls. Normally you don't need to change this:
// the look is in shape.ts, the motion in sheets.ts, the behaviour in settings.ts.

import { SHAPE, type P2, type P3 } from './shape'
import { SHEETS, type ActionKey, type Pose } from './sheets'
import { SETTINGS, type ScreenSize } from './settings'

const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// ============================== drawing =====================================

function makeCam(pitch: number, roll: number, yaw: number, tilt: number) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const cr = Math.cos(roll), sr = Math.sin(roll)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const ct = Math.cos(tilt), st = Math.sin(tilt)
  return ([x, y, z]: P3): P2 => {
    const x0 = x * cp - y * sp, y0 = x * sp + y * cp // pitch
    const y1 = y0 * cr - z * sr, z1 = y0 * sr + z * cr // roll
    const x2 = x0 * cy + z1 * sy, z2 = -x0 * sy + z1 * cy // yaw
    return [x2, y1 * ct + z2 * st] // camera tilt
  }
}

function wingPoint([x0, s]: P2, side: number, p: Pose): P3 {
  const { wrist, wingBack } = SHAPE
  let x = x0, y: number, z: number
  if (s <= wrist) {
    y = s * Math.sin(p.a1)
    z = s * Math.cos(p.a1)
  } else {
    const h = (s - wrist) * p.fold
    y = wrist * Math.sin(p.a1) + h * Math.sin(p.a1 + p.a2)
    z = wrist * Math.cos(p.a1) + h * Math.cos(p.a1 + p.a2)
    x = lerp(2.8, x, p.fold)
  }
  return [x + wingBack, 0.9 + y, side * (1.4 + z)]
}

function poly(ctx: CanvasRenderingContext2D, cam: (p: P3) => P2, pts: P3[]) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [X, Y] = cam(p)
    if (i) ctx.lineTo(X, -Y)
    else ctx.moveTo(X, -Y)
  })
  ctx.closePath()
  ctx.fill()
}

/** Draws one gull silhouette in white at the current transform (origin = center). */
export function drawGull(ctx: CanvasRenderingContext2D, pose: Pose, yaw: number, tilt: number) {
  const { wing, body, head, tail } = SHAPE
  const cam = makeCam(pose.pitch, pose.roll, yaw, tilt)
  ctx.save()
  ctx.translate(0, -pose.lift)
  ctx.fillStyle = '#fff'
  for (const side of [-1, 1]) poly(ctx, cam, wing.map((p) => wingPoint(p, side, pose)))
  poly(ctx, cam, tail)
  poly(ctx, cam, head)
  for (const [x, y, r] of body) {
    const [X, Y] = cam([x, y, 0])
    ctx.beginPath()
    ctx.arc(X, -Y, r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/** Brightness of an area of a low-res canvas -> lines of letters (1 pixel = 1 letter). */
export function toAscii(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): string[] {
  const ramp = SETTINGS.render.ramp
  const d = ctx.getImageData(x0, y0, w, h).data
  const out: string[] = []
  for (let y = 0; y < h; y++) {
    let line = ''
    for (let x = 0; x < w; x++) line += ramp[Math.min(ramp.length - 1, Math.floor((d[(y * w + x) * 4] / 255) * ramp.length))]
    out.push(line)
  }
  return out
}

export function mixPose(p: Pose, q: Pose, k: number): Pose {
  return {
    a1: lerp(p.a1, q.a1, k), a2: lerp(p.a2, q.a2, k), fold: lerp(p.fold, q.fold, k),
    pitch: lerp(p.pitch, q.pitch, k), roll: lerp(p.roll, q.roll, k), lift: lerp(p.lift, q.lift, k),
    turn: q.turn ?? p.turn,
  }
}

// ======================= curved swoops (cubic Bezier) ======================

type Path = { P: P2[]; u: number; peak: number }

function bez(P: P2[], u: number): P2 {
  const v = 1 - u
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]
}

function bezD(P: P2[], u: number): P2 {
  const v = 1 - u
  const a = 3 * v * v, b = 6 * v * u, c = 3 * u * u
  return [a * (P[1][0] - P[0][0]) + b * (P[2][0] - P[1][0]) + c * (P[3][0] - P[2][0]),
    a * (P[1][1] - P[0][1]) + b * (P[2][1] - P[1][1]) + c * (P[3][1] - P[2][1])]
}

// =========================== seeded randomness =============================
// Same seed -> same numbers on every computer -> same flight path everywhere.

export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================ one flying gull ==============================

export type Gull = {
  id: string
  rnd: () => number // this gull's own random numbers (from its seed)
  x: number; y: number // 0..1 of the screen
  vx: number; vy: number // per second
  heading: number // +1 = to the right, -1 = to the left
  yaw: number; tilt: number
  action: ActionKey; prev: ActionKey; blend: number
  t: number; actT: number
  flapsLeft: number; glideLeft: number
  climbTo: number
  path: Path | null
  pose: Pose
}

export type Wave = { x: number; y: number; age: number; label: string }

/**
 * Gulls crossing the screen + catch waves.
 * Only the leader spawns gulls (onSpawn tells the others); everyone else
 * adds them with addGull(id, seed) and gets exactly the same flight.
 */
export class SeagullFlock {
  gulls: Gull[] = []
  waves: Wave[] = []
  leader = false
  onSpawn: ((id: string, seed: number) => void) | null = null
  private nextSpawn = 0
  private acc = 0

  constructor() {
    this.resetTimer(true)
  }

  resetTimer(first = false) {
    const [a, b] = first ? SETTINGS.flight.firstSpawn : SETTINGS.flight.spawnEvery
    this.nextSpawn = a + Math.random() * (b - a)
  }

  /** margin outside the screen (part of the width) where a gull starts / ends */
  private margin() {
    return SETTINGS.render.size * 0.6 + 0.02
  }

  has(id: string) {
    return this.gulls.some((g) => g.id === id)
  }

  /** Leader: make a new gull and tell everyone. */
  spawnNew() {
    const id = Math.random().toString(36).slice(2, 10)
    const seed = Math.floor(Math.random() * 4294967296)
    this.addGull(id, seed)
    this.onSpawn?.(id, seed)
  }

  /** Adds a gull from its id + seed (same seed -> same flight everywhere). */
  addGull(id: string, seed: number) {
    if (this.has(id)) return
    const F = SETTINGS.flight, R = SETTINGS.render
    const rnd = seededRandom(seed)
    const r = (a: number, b: number) => a + rnd() * (b - a)
    const heading = rnd() < 0.5 ? 1 : -1
    const m = this.margin()
    const v = r(R.viewYaw[0], R.viewYaw[1])
    this.gulls.push({
      id, rnd,
      x: heading > 0 ? -m : 1 + m,
      y: r(F.startY[0], F.startY[1]),
      vx: heading * F.move.level[0], vy: 0,
      heading,
      yaw: heading > 0 ? v : Math.PI - v, // facing right / left
      tilt: r(R.tilt[0], R.tilt[1]),
      action: 'level', prev: 'level', blend: 1,
      t: rnd(), actT: 0,
      flapsLeft: Math.round(r(F.flaps[0], F.flaps[1])), glideLeft: 0,
      climbTo: 0,
      path: null,
      pose: SHEETS.level.pose(0),
    })
  }

  remove(id: string) {
    this.gulls = this.gulls.filter((g) => g.id !== id)
  }

  /** Starts a catch wave at (x, y) = 0..1 of the screen. */
  addWave(x: number, y: number, label: string): Wave {
    const w = { x, y, age: 0, label }
    this.waves.push(w)
    return w
  }

  private setAction(g: Gull, a: ActionKey) {
    if (g.action === a) return
    g.prev = g.action
    g.action = a
    g.blend = 0
    g.actT = 0
    if (!SHEETS[a].flaps) g.t = 0
  }

  // glide down / dive along a curve that starts in the current flight direction,
  // is steepest in the middle and arrives level
  private startSwoop(g: Gull, dist: number, ty: number, kind: 'down' | 'dive') {
    const F = SETTINGS.flight, S = F.virtualScreen
    const tx = g.x + g.heading * dist
    const L = Math.abs(tx - g.x), D = ty - g.y
    let ux = g.vx * S.w, uy = g.vy * S.h
    if (Math.hypot(ux, uy) < 1e-3) { ux = g.heading; uy = 0 }
    const ul = Math.hypot(ux, uy)
    const k = Math.hypot(L * S.w, D * S.h) * (kind === 'dive' ? 0.18 : 0.3)
    const P: P2[] = [
      [g.x, g.y],
      [g.x + ((ux / ul) * k) / S.w, Math.max(0.04, g.y + ((uy / ul) * k) / S.h)],
      [tx - g.heading * L * (kind === 'dive' ? 0.35 : 0.5), ty],
      [tx, ty],
    ]
    g.path = { P, u: 0, peak: (kind === 'dive' ? F.swoopDive : F.swoopDown) * S.w }
    this.setAction(g, kind)
  }

  // decide what to do: keep the height between `high` and `low`
  private think(g: Gull, dt: number) {
    const F = SETTINGS.flight
    const r = (a: number, b: number) => a + g.rnd() * (b - a)
    if (g.path) return
    if (g.action === 'climb') {
      if (g.y > g.climbTo) return // keep climbing
      this.setAction(g, 'level')
      g.flapsLeft = Math.round(r(F.flaps[0], F.flaps[1]))
    }
    if (g.y < F.high) {
      this.startSwoop(g, r(0.25, 0.45), r(0.35, 0.6), 'down')
    } else if (g.y > F.low) {
      g.climbTo = r(0.4, 0.6)
      this.setAction(g, 'climb')
    } else if (g.y < 0.55 && g.rnd() < F.randomSwoop * dt) {
      const drop = r(0.15, 0.3)
      this.startSwoop(g, r(0.2, 0.4), g.y + drop, g.rnd() < 0.3 ? 'dive' : 'down')
    } else if (g.y > 0.4 && g.rnd() < F.randomClimb * dt) {
      g.climbTo = g.y - r(0.12, 0.22)
      this.setAction(g, 'climb')
    } else if (g.action === 'glide') {
      g.glideLeft -= dt
      if (g.glideLeft <= 0) {
        this.setAction(g, 'level')
        g.flapsLeft = Math.round(r(F.flaps[0], F.flaps[1]))
      }
    } else if (g.action !== 'level') {
      this.setAction(g, 'level')
    }
  }

  /** One fixed simulation step for one gull. */
  private stepGull(g: Gull, dt: number) {
    const F = SETTINGS.flight, A = SHEETS, S = F.virtualScreen
    this.think(g, dt)
    const act = A[g.action]

    // run through the cycle; after N wing beats, glide a while
    g.t += dt * act.hz * (act.flaps ? F.flapHz : 1)
    if (g.t >= 1) {
      g.t -= 1
      if (g.action === 'level' && --g.flapsLeft <= 0) {
        this.setAction(g, 'glide')
        g.glideLeft = F.glide[0] + g.rnd() * (F.glide[1] - F.glide[0])
      }
    }
    g.blend = Math.min(1, g.blend + dt / 0.45)
    g.actT += dt

    // how steep the swoop is right now (0 = level)
    let steep = 0
    if (g.path) {
      const d = bezD(g.path.P, g.path.u)
      steep = Math.atan2(d[1] * S.h, Math.abs(d[0]) * S.w + 1e-6)
    }

    // pose: blend from the previous action; on a swoop the wings fold where steep
    const pNow = g.path
      ? mixPose(A.down.pose(g.t), A.dive.pose(g.t), clamp((steep - 0.3) / 0.7, 0, 1))
      : act.pose(g.t)
    const pOld = A[g.prev].pose(A[g.prev].flaps === act.flaps ? g.t : 0)
    const pose = g.blend < 1 ? mixPose(pOld, pNow, smooth(g.blend)) : pNow

    if (g.path) {
      // along the curve: fast in the steep middle, slower on the pull-out
      const p = g.path
      const v = p.peak * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, p.u * 1.15)))
      const d = bezD(p.P, p.u)
      const len = Math.hypot(d[0] * S.w, d[1] * S.h) + 1e-6
      p.u = Math.min(1, p.u + (v * dt) / len)
      ;[g.x, g.y] = bez(p.P, p.u)
      pose.pitch = lerp(pose.pitch, -Math.min(1.2, steep), smooth(Math.min(1, g.actT / 0.3)))
      if (p.u >= 1) {
        g.vx = (g.heading * v) / S.w
        g.vy = 0
        g.path = null
        this.setAction(g, 'glide')
        g.glideLeft = F.glide[0] + g.rnd() * (F.glide[1] - F.glide[0])
      }
    } else {
      // speed eases towards the target speed -> curved changes of direction
      const [fw, dn] = F.move[g.action as 'level' | 'climb' | 'glide'] ?? F.move.level
      const k = Math.min(1, dt * F.steer)
      g.vx += (g.heading * fw - g.vx) * k
      g.vy += (dn - g.vy) * k
      g.x += g.vx * dt
      g.y = clamp(g.y + g.vy * dt, 0.04, 0.96)
      if (!act.flaps) {
        const ang = Math.atan2(g.vy * S.h, Math.abs(g.vx) * S.w + 1e-6)
        pose.pitch = lerp(pose.pitch, clamp(-ang, -0.9, 0.3), 0.75 * smooth(g.blend))
      }
    }
    g.pose = pose
  }

  /** Real time passed (seconds): spawn (leader), move gulls, age waves. */
  update(dt: number) {
    const F = SETTINGS.flight

    if (this.leader && this.gulls.length < F.maxGulls) {
      this.nextSpawn -= dt
      if (this.nextSpawn <= 0) {
        this.spawnNew()
        this.resetTimer()
      }
    }

    // fixed steps, so every computer computes the same path
    this.acc = Math.min(this.acc + dt, 0.25)
    while (this.acc >= F.step) {
      this.acc -= F.step
      for (const g of this.gulls) this.stepGull(g, F.step)
    }

    // gone past the other side -> remove
    const m = this.margin()
    this.gulls = this.gulls.filter((g) => (g.heading > 0 ? g.x < 1 + m : g.x > -m))

    for (const w of this.waves) w.age += dt
    this.waves = this.waves.filter((w) => w.age < SETTINGS.catch.wave.duration)
  }

  /** The gull under (px, py), if any (screen px). */
  hitTest(px: number, py: number, s: ScreenSize): Gull | null {
    const r = SETTINGS.render.size * s.w * SETTINGS.catch.hitRadius
    for (const g of this.gulls) {
      if (Math.hypot(px - g.x * s.w, py - g.y * s.h) <= r) return g
    }
    return null
  }
}
