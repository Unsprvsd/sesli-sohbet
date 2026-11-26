// SPIDER — a long-legged ASCII spider (like a harvestman / "daddy long-legs")
// walking around the screen. Settings: SPIDER below (final values: src/ascii/final.json).
//
// How it works:
//  - The floor is the screen. The body wanders (or follows the mouse).
//  - 8 legs, 2 parts each (thigh + shin). Each foot stays planted until it is
//    too far from its "rest" place under the body, then it steps there in a
//    short arc. Legs step in two groups (like real spiders), never all at once.
//  - The knee is found with simple 2-bone IK: it bends UP, high above the body.
//  - A small 3D look: height (z) is drawn a bit upwards on the screen (`tilt`).
//  - Lines + body are drawn white on a hidden canvas, then turned into letters by
//    SHAPE (src/ascii/shapeAscii.ts), so legs become / \ _ | ' , letters.

import { applyFinal } from '../tune'
import { LETTER_SETS, ShapeAscii } from '../shapeAscii'

type P2 = [number, number]

export const SPIDER = {
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
  bodyHeight: 0.3, // body height above the floor (part of leg length)
  tilt: 0.55, // how much height shows on screen (0 = straight from above)
  // ---- walking ----
  speed: 0.05, // walking speed (screen widths / s)
  turn: 1.8, // how fast it turns (radians / s)
  stepAt: 0.32, // a foot steps when it is this far from its rest place (part of leg length)
  stepTime: 0.16, // seconds for one step
  stepLift: 0.18, // how high a foot lifts (part of leg length)
  bob: 0.04, // body moves up/down with the steps (part of leg length)
  pause: [0.5, 2.5] as P2, // seconds it sometimes stands still
  pauseChance: 0.35, // chance to stand still at each new target
  followMouse: false, // walk towards the mouse instead of wandering
  margin: 0.12, // stay this far from the screen edge (part of the screen)
}
applyFinal(SPIDER, 'spider')

type Leg = {
  side: -1 | 1 // -1 = left, +1 = right
  angle: number // rest direction (radians from forward)
  group: 0 | 1 // step group
  foot: P2 // planted foot on the floor (px)
  from: P2 // step start
  to: P2 // step target
  t: number // step progress 0..1, or -1 = planted
}

const DEG = Math.PI / 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Runs the spider on a canvas (sized by CSS). Returns stop(). */
export function startSpider(canvas: HTMLCanvasElement, opt: { still?: boolean } = {}) {
  const ctx = canvas.getContext('2d')!
  const S = SPIDER
  const font = getComputedStyle(canvas).fontFamily || 'monospace'
  const hidden = document.createElement('canvas')
  const hctx = hidden.getContext('2d', { willReadFrequently: true })!
  let W = 0, H = 0, cols = 0, rows = 0, cellW = 6, lineH = 12
  let matcher: ShapeAscii | null = null
  let key = ''

  // body
  const body = { x: 0, y: 0, heading: rand(-Math.PI, Math.PI), moving: true, wait: 0 }
  let target: P2 = [0, 0]
  let legs: Leg[] = []
  let lastGroup: 0 | 1 = 1
  const mouse = { x: -1, y: -1, on: false }

  const L = () => S.legLength * H // leg length in px

  const restFoot = (leg: Leg): P2 => {
    const a = body.heading + leg.side * leg.angle
    const r = S.reach * L()
    return [body.x + Math.cos(a) * r, body.y + Math.sin(a) * r]
  }

  const makeLegs = () => {
    const [a0, a1] = S.legSpread
    legs = []
    for (let i = 0; i < 4; i++) {
      const angle = lerp(a0, a1, i / 3) * DEG
      for (const side of [-1, 1] as const) {
        // groups like a real spider: L1 R2 L3 R4 / R1 L2 R3 L4
        const group = ((i + (side > 0 ? 1 : 0)) % 2) as 0 | 1
        const leg: Leg = { side, angle, group, foot: [0, 0], from: [0, 0], to: [0, 0], t: -1 }
        leg.foot = restFoot(leg)
        legs.push(leg)
      }
    }
  }

  const pickTarget = () => {
    const m = S.margin
    target = [rand(m, 1 - m) * W, rand(m, 1 - m) * H]
  }

  const resize = () => {
    const oldW = W, oldH = H
    W = canvas.clientWidth
    H = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${S.fontSize}px ${font}`
    ctx.textBaseline = 'top'
    cellW = ctx.measureText('M').width || 6
    lineH = Math.round(S.fontSize * S.lineHeight)
    cols = Math.ceil(W / cellW)
    rows = Math.ceil(H / lineH)
    matcher = new ShapeAscii(font, S.fontSize, cellW, lineH, {
      chars: S.letters, sub: [6, 9], contrast: S.contrast, minInk: S.minInk,
    })
    hidden.width = cols * matcher.sx
    hidden.height = rows * matcher.sy
    key = [S.fontSize, S.lineHeight, S.letters, S.minInk].join('|')
    if (!oldW) {
      body.x = W / 2
      body.y = H / 2
      pickTarget()
      makeLegs()
    } else if (oldW !== W || oldH !== H) {
      body.x *= W / oldW
      body.y *= H / oldH
      makeLegs()
      pickTarget()
    }
  }

  // ---------- walking ----------
  const update = (dt: number) => {
    // goal: the mouse, or a random point (sometimes stand still first)
    if (S.followMouse && mouse.on) {
      target = [mouse.x, mouse.y]
      body.moving = Math.hypot(target[0] - body.x, target[1] - body.y) > L() * 0.3
    } else if (!body.moving) {
      body.wait -= dt
      if (body.wait <= 0) body.moving = true
    } else if (Math.hypot(target[0] - body.x, target[1] - body.y) < L() * 0.3) {
      pickTarget()
      if (Math.random() < S.pauseChance) {
        body.moving = false
        body.wait = rand(S.pause[0], S.pause[1])
      }
    }

    if (body.moving) {
      const want = Math.atan2(target[1] - body.y, target[0] - body.x)
      const d = wrapAngle(want - body.heading)
      body.heading += Math.max(-S.turn * dt, Math.min(S.turn * dt, d))
      // slow down while turning sharply
      const v = S.speed * W * (0.35 + 0.65 * Math.max(0, Math.cos(d)))
      body.x += Math.cos(body.heading) * v * dt
      body.y += Math.sin(body.heading) * v * dt
    }

    // legs: finish steps, then start new ones (one group at a time)
    const stepping = legs.some((l) => l.t >= 0)
    for (const leg of legs) {
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
    if (!stepping) {
      const limit = S.stepAt * L()
      const far = (l: Leg) => {
        const r = restFoot(l)
        return Math.hypot(l.foot[0] - r[0], l.foot[1] - r[1])
      }
      // the group that waited longest goes first, if any of its legs is too far
      for (const g of [lastGroup === 0 ? 1 : 0, lastGroup] as (0 | 1)[]) {
        const group = legs.filter((l) => l.group === g)
        if (!group.some((l) => far(l) > limit)) continue
        for (const l of group) {
          // aim a bit ahead, so the foot lands where the body will be
          const r = restFoot(l)
          const ahead = body.moving ? S.speed * W * S.stepTime * 0.8 : 0
          l.from = l.foot
          l.to = [r[0] + Math.cos(body.heading) * ahead, r[1] + Math.sin(body.heading) * ahead]
          l.t = 0
        }
        lastGroup = g
        break
      }
    }
  }

  // ---------- drawing ----------
  /** floor point (x, y) at height z -> screen */
  const toScreen = (x: number, y: number, z: number): P2 => [x, y - z * S.tilt]

  const draw = () => {
    if (!matcher) return
    if (key !== [S.fontSize, S.lineHeight, S.letters, S.minInk].join('|')) resize()
    matcher.setContrast(S.contrast)
    const sx = matcher.sx, sy = matcher.sy
    const len = L()
    const a = len * S.thigh, b = len * (1 - S.thigh)
    const stepping = legs.some((l) => l.t >= 0)
    const bz = len * (S.bodyHeight + (stepping ? S.bob * Math.sin(Math.PI * Math.max(0, ...legs.map((l) => l.t))) : 0))
    const br = S.bodySize * H

    // area to convert: around the body, legs and knees
    const pad = len * 1.1 + br * 2
    const c0 = Math.max(0, Math.floor((body.x - pad) / cellW))
    const c1 = Math.min(cols, Math.ceil((body.x + pad) / cellW))
    const r0 = Math.max(0, Math.floor((body.y - pad - len * S.tilt) / lineH))
    const r1 = Math.min(rows, Math.ceil((body.y + pad) / lineH))
    const bw = c1 - c0, bh = r1 - r0

    const h = hctx
    h.setTransform(1, 0, 0, 1, 0, 0)
    h.fillStyle = '#000'
    h.fillRect(c0 * sx, r0 * sy, bw * sx, bh * sy)
    // draw in screen px
    h.setTransform(sx / cellW, 0, 0, sy / lineH, 0, 0)
    const ink = Math.round(Math.max(0, Math.min(1, S.legInk)) * 255)
    h.strokeStyle = `rgb(${ink},${ink},${ink})`
    h.lineWidth = S.legWidth
    h.lineCap = 'round'
    h.lineJoin = 'round'

    for (const leg of legs) {
      // hip on the body edge, foot on the floor (lifted while stepping)
      const ha = body.heading + leg.side * leg.angle
      const hip: [number, number, number] = [body.x + Math.cos(ha) * br * 0.8, body.y + Math.sin(ha) * br * 0.8, bz]
      const lift = leg.t >= 0 ? Math.sin(Math.PI * leg.t) * S.stepLift * len : 0
      const foot: [number, number, number] = [leg.foot[0], leg.foot[1], lift]
      // 2-bone IK: the knee bends UP in the plane through hip, foot and "up"
      const dx = foot[0] - hip[0], dy = foot[1] - hip[1], dz = foot[2] - hip[2]
      let d = Math.hypot(dx, dy, dz)
      const maxD = (a + b) * 0.999
      if (d > maxD) d = maxD
      const ux = dx / (d || 1), uy = dy / (d || 1), uz = dz / (d || 1)
      const along = (a * a - b * b + d * d) / (2 * d) // distance from hip to the knee's foot point
      const up = Math.sqrt(Math.max(0, a * a - along * along))
      // "up" vector perpendicular to the hip->foot line
      let px = -uz * ux, py = -uz * uy, pz = 1 - uz * uz
      const pl = Math.hypot(px, py, pz) || 1
      px /= pl; py /= pl; pz /= pl
      const knee: [number, number, number] = [
        hip[0] + ux * along + px * up, hip[1] + uy * along + py * up, hip[2] + uz * along + pz * up,
      ]
      const H1 = toScreen(...hip), K = toScreen(...knee), F = toScreen(...foot)
      h.beginPath()
      h.moveTo(H1[0], H1[1])
      h.lineTo(K[0], K[1])
      h.lineTo(F[0], F[1])
      h.stroke()
    }

    // body + head (full white = dense letters)
    const [bx, by] = toScreen(body.x, body.y, bz)
    h.fillStyle = '#fff'
    h.beginPath()
    h.ellipse(bx, by, br, br * 0.8, body.heading, 0, Math.PI * 2)
    h.fill()
    const hr = br * S.headSize
    h.beginPath()
    h.ellipse(bx + Math.cos(body.heading) * br * 1.15, by + Math.sin(body.heading) * br * 1.15, hr, hr * 0.85, body.heading, 0, Math.PI * 2)
    h.fill()

    // hidden canvas -> letters
    ctx.clearRect(0, 0, W, H)
    if (bw <= 0 || bh <= 0) return
    const data = hctx.getImageData(c0 * sx, r0 * sy, bw * sx, bh * sy).data
    ctx.fillStyle = S.color
    ctx.font = `${S.fontSize}px ${font}`
    matcher.convert(data, bw, bh).forEach((line, y) => {
      if (line.trim()) ctx.fillText(line, c0 * cellW, (r0 + y) * lineH)
    })
  }

  // ---------- loop + events ----------
  let raf = 0
  let last = performance.now()
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    update(dt)
    draw()
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    const k = r.width / (W || 1) || 1
    mouse.x = (e.clientX - r.left) / k
    mouse.y = (e.clientY - r.top) / k
    mouse.on = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= W && mouse.y <= H
  }

  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  document.fonts?.addEventListener('loadingdone', resize)
  document.fonts?.ready.then(resize)
  window.addEventListener('pointermove', onMove)
  if (opt.still) draw()
  else raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    document.fonts?.removeEventListener('loadingdone', resize)
    window.removeEventListener('pointermove', onMove)
  }
}
