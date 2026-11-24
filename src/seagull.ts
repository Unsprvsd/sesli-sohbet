// ASCII seagull: shape, animations and flight behaviour in one place.
// Tuned in vault/Design/ascii-bird.html (test page with "Animation sheets").
// All numbers live in the SEAGULL object below - change them there.

type P2 = [number, number]
type P3 = [number, number, number]

export type Pose = {
  a1: number // inner wing angle (up +)
  a2: number // extra bend at the wrist
  fold: number // hand length 0..1 (folds on the upstroke / in a dive)
  pitch: number // nose up +
  roll: number // bank
  lift: number // body up/down
  turn?: number // 0..1 progress of a turn
}

export type ActionKey = 'level' | 'climb' | 'glide' | 'down' | 'dive' | 'turn'

type Action = {
  name: string
  flaps: boolean // true = wing beats (cycle speed follows flapHz)
  hz: number // cycles per second (x flapHz when flapping)
  pose: (t: number) => Pose // t = 0..1 through one cycle
}

const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export const SEAGULL = {
  // ---- shape, in 3D "bird units": x = forward, y = up, z = right wing ----
  shape: {
    // wing outline from above [x, s] (s = distance from the body): broad inner
    // wing, sharp bend at the wrist, long narrow pointed hand
    wing: [
      [3, 0], [3.8, 4], [3.6, 8.5], [1.5, 13], [-1.5, 18], [-5.5, 23],
      [-4.6, 18.5], [-3.3, 14], [-2.7, 9], [-3.7, 4.5], [-4.3, 0],
    ] as P2[],
    wrist: 8.5, // where the hand starts
    wingBack: -1.5, // wings sit a bit behind the head
    // body = circles along the body line [x, y, radius]; narrows into the neck
    body: [[-9, 0.3, 1.1], [-6.5, 0.2, 1.9], [-4, 0, 2.4], [-1, 0, 2.7], [2, 0.1, 2.7],
      [4.8, 0.4, 2.2], [6.8, 0.9, 1.5]] as P3[],
    // head + short beak as one slim wedge (flat crown, tiny hook)
    head: [
      [6.5, 2.2, 0], [8.5, 2.8, 0], [10.5, 2.9, 0], [12, 2.6, 0],
      [13.8, 2.1, 0], [15.4, 1.6, 0], [16.2, 1.3, 0], [16.1, 0.85, 0],
      [15.5, 1.0, 0], [13.8, 1.3, 0], [12, 1.35, 0],
      [10.5, 1.0, 0], [8.5, 0.3, 0], [6.5, -0.2, 0],
    ] as P3[],
    tail: [[-8, 0.3, -1.7], [-14.5, 0.2, -2.6], [-15, 0.2, 0], [-14.5, 0.2, 2.6], [-8, 0.3, 1.7]] as P3[],
    width: 50, // about the wingspan, used for sizing
  },

  // ---- animations (the "animation sheets") ----
  actions: {
    level: {
      name: 'Level flap', flaps: true, hz: 1,
      pose: (t) => {
        const ph = t * TAU
        return { a1: 0.15 + 0.8 * Math.sin(ph), a2: 0.45 * Math.sin(ph - 1), fold: 0.84 - 0.15 * Math.cos(ph),
          pitch: 0.03 * Math.sin(ph), roll: 0, lift: -0.9 * Math.cos(ph) }
      },
    },
    climb: {
      name: 'Climb', flaps: true, hz: 1.3,
      pose: (t) => {
        const ph = t * TAU
        return { a1: 0.22 + 0.9 * Math.sin(ph), a2: 0.52 * Math.sin(ph - 1.05), fold: 0.78 - 0.2 * Math.cos(ph),
          pitch: 0.35 + 0.05 * Math.sin(ph), roll: 0.03 * Math.sin(ph * 0.5 + 0.4), lift: -1.2 * Math.cos(ph) }
      },
    },
    glide: {
      name: 'Glide', flaps: false, hz: 0.35,
      pose: (t) => ({ a1: 0.18, a2: -0.22, fold: 1, pitch: -0.05 + 0.02 * Math.sin(t * TAU),
        roll: 0.05 * Math.sin(t * TAU), lift: 0.15 * Math.sin(t * TAU) }),
    },
    down: {
      name: 'Glide down', flaps: false, hz: 0.35,
      pose: (t) => ({ a1: 0.1, a2: -0.32, fold: 0.9, pitch: -0.3 + 0.02 * Math.sin(t * TAU),
        roll: 0.04 * Math.sin(t * TAU), lift: 0 }),
    },
    dive: {
      name: 'Dive', flaps: false, hz: 0.5,
      pose: (t) => ({ a1: 0.3 + 0.04 * Math.sin(t * TAU), a2: -0.65, fold: 0.55, pitch: -0.7,
        roll: 0.03 * Math.sin(t * TAU), lift: 0 }),
    },
    turn: {
      name: 'Turn', flaps: false, hz: 0.7,
      pose: (t) => ({ a1: 0.2, a2: -0.25, fold: 0.95, pitch: 0.05, roll: -0.65 * Math.sin(Math.PI * t), lift: 0,
        turn: smooth(t) }),
    },
  } as Record<ActionKey, Action>,

  // ---- flight across the screen (positions: 0..1 of screen width / height) ----
  flight: {
    flapHz: 1.2, // wing beats per second (level flight)
    move: { // target speed [forward, down] per second
      level: [0.07, 0], climb: [0.06, -0.05], glide: [0.075, 0.008],
    } as Record<'level' | 'climb' | 'glide', P2>,
    steer: 1.6, // how fast the speed follows the target (higher = sharper curves)
    swoopDown: 0.26, // top speed along a glide-down curve (screen widths / s)
    swoopDive: 0.36, // top speed along a dive curve
    high: 0.15, // above this (closer to the top) -> glide down
    low: 0.8, // below this -> climb
    startY: [0.2, 0.7] as P2, // height where a gull enters
    flaps: [2, 5] as P2, // wing beats before a glide
    glide: [0.8, 2] as P2, // seconds of gliding
    randomSwoop: 0.06, // chance per second of a swoop down (when not too low)
    randomClimb: 0.05, // chance per second of a short climb (when not too high)
    firstSpawn: [8, 20] as P2, // seconds until the first gull
    spawnEvery: [25, 70] as P2, // seconds between gulls
    maxGulls: 2,
  },

  // ---- drawing ----
  render: {
    ramp: ' .,:-=+*#%@', // letters from empty to full
    fontSize: 7,
    lineHeight: 1.15,
    color: '#5c5c5c', // faint, like the other background effects
    size: 0.14, // gull width as part of the screen width
    viewYaw: [0.2, 0.6] as P2, // seen from the side .. three-quarter
    tilt: [0.15, 0.45] as P2, // camera a bit below
  },
}

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
  const { wrist, wingBack } = SEAGULL.shape
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
  const { wing, body, head, tail } = SEAGULL.shape
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

function mixPose(p: Pose, q: Pose, k: number): Pose {
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

// ============================ one flying gull ==============================

type Gull = {
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

export type ScreenSize = { w: number; h: number } // px

/** Gulls that appear at random times and cross the screen. */
export class SeagullFlock {
  gulls: Gull[] = []
  private nextSpawn = rand(...SEAGULL.flight.firstSpawn)

  /** margin outside the screen (part of the width) where a gull starts / ends */
  private margin() {
    return SEAGULL.render.size * 0.6 + 0.02
  }

  spawn() {
    const F = SEAGULL.flight
    const heading = Math.random() < 0.5 ? 1 : -1
    const m = this.margin()
    const g: Gull = {
      x: heading > 0 ? -m : 1 + m,
      y: rand(...F.startY),
      vx: heading * F.move.level[0], vy: 0,
      heading,
      yaw: 0, tilt: rand(...SEAGULL.render.tilt),
      action: 'level', prev: 'level', blend: 1,
      t: Math.random(), actT: 0,
      flapsLeft: Math.round(rand(...F.flaps)), glideLeft: 0,
      climbTo: 0,
      path: null,
      pose: SEAGULL.actions.level.pose(0),
    }
    const v = rand(...SEAGULL.render.viewYaw)
    g.yaw = heading > 0 ? v : Math.PI - v // facing right / left
    this.gulls.push(g)
  }

  private setAction(g: Gull, a: ActionKey) {
    if (g.action === a) return
    g.prev = g.action
    g.action = a
    g.blend = 0
    g.actT = 0
    if (!SEAGULL.actions[a].flaps) g.t = 0
  }

  // glide down / dive along a curve that starts in the current flight direction,
  // is steepest in the middle and arrives level
  private startSwoop(g: Gull, dist: number, ty: number, kind: 'down' | 'dive', s: ScreenSize) {
    const F = SEAGULL.flight
    const tx = g.x + g.heading * dist
    const L = Math.abs(tx - g.x), D = ty - g.y
    let ux = g.vx * s.w, uy = g.vy * s.h
    if (Math.hypot(ux, uy) < 1e-3) { ux = g.heading; uy = 0 }
    const ul = Math.hypot(ux, uy)
    const k = Math.hypot(L * s.w, D * s.h) * (kind === 'dive' ? 0.18 : 0.3)
    const P: P2[] = [
      [g.x, g.y],
      [g.x + ((ux / ul) * k) / s.w, Math.max(0.04, g.y + ((uy / ul) * k) / s.h)],
      [tx - g.heading * L * (kind === 'dive' ? 0.35 : 0.5), ty],
      [tx, ty],
    ]
    g.path = { P, u: 0, peak: (kind === 'dive' ? F.swoopDive : F.swoopDown) * s.w }
    this.setAction(g, kind)
  }

  // decide what to do: keep the height between `high` and `low`
  private think(g: Gull, dt: number, s: ScreenSize) {
    const F = SEAGULL.flight
    if (g.path) return
    if (g.action === 'climb') {
      if (g.y > g.climbTo) return // keep climbing
      this.setAction(g, 'level')
      g.flapsLeft = Math.round(rand(...F.flaps))
    }
    if (g.y < F.high) {
      this.startSwoop(g, rand(0.25, 0.45), rand(0.35, 0.6), 'down', s)
    } else if (g.y > F.low) {
      g.climbTo = rand(0.4, 0.6)
      this.setAction(g, 'climb')
    } else if (g.y < 0.55 && Math.random() < F.randomSwoop * dt) {
      const drop = rand(0.15, 0.3)
      this.startSwoop(g, rand(0.2, 0.4), g.y + drop, Math.random() < 0.3 ? 'dive' : 'down', s)
    } else if (g.y > 0.4 && Math.random() < F.randomClimb * dt) {
      g.climbTo = g.y - rand(0.12, 0.22)
      this.setAction(g, 'climb')
    } else if (g.action === 'glide') {
      g.glideLeft -= dt
      if (g.glideLeft <= 0) {
        this.setAction(g, 'level')
        g.flapsLeft = Math.round(rand(...F.flaps))
      }
    } else if (g.action !== 'level') {
      this.setAction(g, 'level')
    }
  }

  /** Moves every gull; spawns and removes gulls. dt in seconds. */
  update(dt: number, s: ScreenSize) {
    const F = SEAGULL.flight
    const A = SEAGULL.actions

    if (this.gulls.length < F.maxGulls) {
      this.nextSpawn -= dt
      if (this.nextSpawn <= 0) {
        this.spawn()
        this.nextSpawn = rand(...F.spawnEvery)
      }
    }

    for (const g of this.gulls) {
      this.think(g, dt, s)
      const act = A[g.action]

      // run through the cycle; after N wing beats, glide a while
      g.t += dt * act.hz * (act.flaps ? F.flapHz : 1)
      if (g.t >= 1) {
        g.t -= 1
        if (g.action === 'level' && --g.flapsLeft <= 0) {
          this.setAction(g, 'glide')
          g.glideLeft = rand(...F.glide)
        }
      }
      g.blend = Math.min(1, g.blend + dt / 0.45)
      g.actT += dt

      // how steep the swoop is right now (0 = level)
      let steep = 0
      if (g.path) {
        const d = bezD(g.path.P, g.path.u)
        steep = Math.atan2(d[1] * s.h, Math.abs(d[0]) * s.w + 1e-6)
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
        const len = Math.hypot(d[0] * s.w, d[1] * s.h) + 1e-6
        p.u = Math.min(1, p.u + (v * dt) / len)
        ;[g.x, g.y] = bez(p.P, p.u)
        pose.pitch = lerp(pose.pitch, -Math.min(1.2, steep), smooth(Math.min(1, g.actT / 0.3)))
        if (p.u >= 1) {
          g.vx = (g.heading * v) / s.w
          g.vy = 0
          g.path = null
          this.setAction(g, 'glide')
          g.glideLeft = rand(...F.glide)
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
          const ang = Math.atan2(g.vy * s.h, Math.abs(g.vx) * s.w + 1e-6)
          pose.pitch = lerp(pose.pitch, clamp(-ang, -0.9, 0.3), 0.75 * smooth(g.blend))
        }
      }
      g.pose = pose
    }

    // gone past the other side -> remove
    const m = this.margin()
    this.gulls = this.gulls.filter((g) => (g.heading > 0 ? g.x < 1 + m : g.x > -m))
  }
}
