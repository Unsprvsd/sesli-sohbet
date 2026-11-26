// GLOW LINES — faint glows running along invisible lines of fixed letters,
// behind the server screen. Settings: GLOW below (final values: src/ascii/final.json).
// Each glow lights letters as it reaches them; they fade again behind it (tail).
// Some glows are two rows: one long tail, one short.

import { applyFinal } from '../tune'

type P2 = [number, number]

export const GLOW = {
  fontSize: 14,
  chars: '@#&%$*+=~-:;,.', // letters the lines are made of
  spacing: 1.6, // space between letters, in letter widths (>1 = readable letters)
  maxGlows: 5, // most glows on the screen at once
  spawn: [1, 5] as P2, // seconds between two new glows (random)
  peak: 0x48, // brightness of the brightest letter (0..255 grey)
  speed: [6, 11] as P2, // letters per second
  rise: [3, 10] as P2, // letters lit in front of the brightest one
  fade: [4, 40] as P2, // tail length (letters behind it)
  doubleChance: 0.15, // part of the glows that are two rows
  rowGap: 1.15, // distance between the two rows, in letter heights
  minGap: 0.08, // keep glows this far apart in height (part of the screen)
  yRange: [0.06, 0.94] as P2, // where glows may appear (0 = top, 1 = bottom)
  curve: 2, // fading curve: 2 = soft-sharp (f*f), 1 = softer, wider glow
}
applyFinal(GLOW, 'glow')

type Row = { dy: number; line: string; rise: number; fade: number; lag: number }
type Glow = { y: number; rows: Row[]; pos: number; dir: number; speed: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randIn = ([a, b]: P2) => rand(a, b)

function randomLine(cols: number) {
  const ch = GLOW.chars || '.'
  let s = ''
  for (let i = 0; i < cols; i++) s += ch[Math.floor(Math.random() * ch.length)]
  return s
}

/** Runs the glow lines on a canvas (sized by CSS). Returns stop(). */
export function startGlow(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const S = GLOW
  const font = getComputedStyle(canvas).fontFamily || 'monospace'
  let step = 13, cols = 0, W = 0, H = 0, metricsKey = ''
  let glows: Glow[] = []
  let nextSpawn = rand(0.2, 1)

  const resize = () => {
    W = canvas.clientWidth
    H = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${S.fontSize}px ${font}`
    ctx.textBaseline = 'middle'
    step = (ctx.measureText('M').width || 8) * S.spacing
    cols = Math.ceil(W / step) + 1
    metricsKey = `${S.fontSize}|${S.spacing}`
    for (const g of glows) for (const r of g.rows) if (r.line.length < cols) r.line = randomLine(cols)
  }

  const spawn = () => {
    // random height, not too close to the glows already on the screen
    let y = randIn(S.yRange)
    for (let tries = 0; tries < 12; tries++) {
      if (glows.every((o) => Math.abs(o.y - y) >= S.minGap)) break
      y = randIn(S.yRange)
    }
    const dir = Math.random() < 0.5 ? -1 : 1
    const row = (dy: number, fade: number, lag = 0): Row => ({ dy, line: randomLine(cols), rise: randIn(S.rise), fade, lag })
    let rows: Row[]
    if (Math.random() < S.doubleChance) {
      // one long + one short row; random which one is on top
      const gap = S.fontSize * S.rowGap
      const long = row(0, rand(Math.min(24, S.fade[1]), S.fade[1]))
      const short = row(0, rand(S.fade[0], Math.max(S.fade[0], 9)), rand(0, 4))
      long.dy = Math.random() < 0.5 ? -gap / 2 : gap / 2
      short.dy = -long.dy
      rows = [long, short]
    } else {
      rows = [row(0, randIn(S.fade))]
    }
    const front = Math.max(...rows.map((r) => r.rise))
    glows.push({ y, rows, dir, speed: randIn(S.speed), pos: dir > 0 ? -front : cols + front })
  }

  // head position of one row of a glow
  const head = (g: Glow, r: Row) => g.pos - g.dir * r.lag

  // brightness of letter i in row r
  const level = (i: number, g: Glow, r: Row) => {
    // d > 0: the glow has passed this letter (behind); d < 0: still in front
    const d = (head(g, r) - i) * g.dir
    const f = d >= 0 ? Math.max(0, 1 - d / r.fade) : Math.max(0, 1 + d / r.rise)
    return Math.round(S.peak * Math.pow(f, S.curve))
  }

  const draw = () => {
    ctx.clearRect(0, 0, W, H)
    for (const g of glows) {
      for (const r of g.rows) {
        const y = Math.round(g.y * H + r.dy)
        const p = head(g, r)
        const reach = Math.max(r.rise, r.fade)
        const from = Math.max(0, Math.floor(p - reach) - 1)
        const to = Math.min(cols - 1, Math.ceil(p + reach) + 1)
        for (let i = from; i <= to; i++) {
          const c = level(i, g, r)
          if (c <= 0) continue
          ctx.fillStyle = `rgb(${c},${c},${c})`
          ctx.fillText(r.line[i], i * step, y)
        }
      }
    }
  }

  let raf = 0
  let last = performance.now()
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.1, (now - last) / 1000) // cap after a hidden tab
    last = now
    if (metricsKey !== `${S.fontSize}|${S.spacing}`) resize()

    // send a new glow at random moments, if there is room for one
    nextSpawn -= dt
    if (nextSpawn <= 0) {
      if (glows.length < S.maxGlows) spawn()
      nextSpawn = randIn(S.spawn)
    }
    for (const g of glows) g.pos += g.dir * g.speed * dt
    // remove glows whose faded tail has left the screen
    glows = glows.filter((g) =>
      g.rows.some((r) => {
        const tail = head(g, r) - g.dir * r.fade
        return g.dir > 0 ? tail <= cols : tail >= 0
      }),
    )
    draw()
  }

  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  document.fonts?.addEventListener('loadingdone', resize)
  document.fonts?.ready.then(resize)
  raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    document.fonts?.removeEventListener('loadingdone', resize)
  }
}
