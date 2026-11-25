import { useEffect, useRef } from 'react'

const FONT_SIZE = 14
const CHARS = '@#&%$*+=~-:;,.'
// Space between letters, in letter widths (>1 so each letter can be read).
const SPACING = 1.6
// Never more than this many glows on the screen at the same time.
const MAX_GLOWS = 5
// Seconds between two new glows (random in this range).
const SPAWN_MIN = 1
const SPAWN_MAX = 5
// Brightness of the brightest letter (grey level on black).
const PEAK = 0x48
// Glow length: letters in front of the brightest one (RISE) and behind it
// (FADE, the tail). Random per row, so some glows are short, some long.
const RISE_MIN = 3
const RISE_MAX = 10
const FADE_MIN = 4
const FADE_MAX = 28
// Part of the glows that are two rows (one long, one short), one above the other.
const DOUBLE_CHANCE = 0.35
// Distance between the two rows, in letter heights.
const ROW_GAP = 1.15
// Keep glows at least this far apart in height (part of the screen, 0..1).
const MIN_GAP = 0.08

type Row = {
  dy: number // offset from the glow's height, in pixels
  line: string // random letters of this row's (invisible) line
  rise: number // letters lit in front of the brightest one
  fade: number // letters lit behind it (the tail)
  lag: number // how many letters this row's head is behind the glow's head
}

type Glow = {
  y: number // height on the screen (0..1)
  rows: Row[] // 1 or 2 rows
  pos: number // position of the glow's head, in letters (can be outside the line)
  dir: number // -1 = right to left, +1 = left to right
  speed: number // letters per second
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function randomLine(cols: number) {
  let s = ''
  for (let i = 0; i < cols; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]
  return s
}

/**
 * Faint ASCII glows behind the server screen. New glows are sent at random
 * moments (at most MAX_GLOWS at once). Each one runs along an invisible line
 * of fixed letters at a random height: the letters never move, they light up
 * as the glow reaches them and fade again a few letters later (the tail
 * length is random). Some glows are two rows: one long tail, one short.
 */
export default function AsciiStream() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Reduced motion: nothing to show (the lines are invisible without a glow).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    let step = 13
    let cols = 0
    let glows: Glow[] = []
    let nextSpawn = rand(0.2, 1)

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'middle'
      step = (ctx.measureText('M').width || 8) * SPACING
      cols = Math.ceil(window.innerWidth / step) + 1
      for (const g of glows)
        for (const r of g.rows) if (r.line.length < cols) r.line = randomLine(cols)
    }

    const spawn = () => {
      // random height, not too close to the glows already on the screen
      let y = rand(0.06, 0.94)
      for (let tries = 0; tries < 12; tries++) {
        if (glows.every((o) => Math.abs(o.y - y) >= MIN_GAP)) break
        y = rand(0.06, 0.94)
      }
      const dir = Math.random() < 0.5 ? -1 : 1
      const row = (dy: number, fade: number, lag = 0): Row => ({
        dy,
        line: randomLine(cols),
        rise: rand(RISE_MIN, RISE_MAX),
        fade,
        lag,
      })
      let rows: Row[]
      if (Math.random() < DOUBLE_CHANCE) {
        // one long + one short row; random which one is on top
        const gap = FONT_SIZE * ROW_GAP
        const long = row(0, rand(16, FADE_MAX))
        const short = row(0, rand(FADE_MIN, 9), rand(0, 4))
        const longOnTop = Math.random() < 0.5
        long.dy = longOnTop ? -gap / 2 : gap / 2
        short.dy = -long.dy
        rows = [long, short]
      } else {
        rows = [row(0, rand(FADE_MIN, FADE_MAX))]
      }
      const front = Math.max(...rows.map((r) => r.rise))
      glows.push({ y, rows, dir, speed: rand(6, 11), pos: dir > 0 ? -front : cols + front })
    }

    // head position of one row of a glow
    const head = (g: Glow, r: Row) => g.pos - g.dir * r.lag

    // brightness of letter i in row r
    const level = (i: number, g: Glow, r: Row) => {
      // d > 0: the glow has passed this letter (behind); d < 0: still in front
      const d = (head(g, r) - i) * g.dir
      const f = d >= 0 ? Math.max(0, 1 - d / r.fade) : Math.max(0, 1 + d / r.rise)
      return Math.round(PEAK * f * f)
    }

    const draw = () => {
      const h = window.innerHeight
      ctx.clearRect(0, 0, window.innerWidth, h)
      for (const g of glows) {
        for (const r of g.rows) {
          const y = Math.round(g.y * h + r.dy)
          // only the letters near the glow can be visible
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

      // send a new glow at random moments, if there is room for one
      nextSpawn -= dt
      if (nextSpawn <= 0) {
        if (glows.length < MAX_GLOWS) spawn()
        nextSpawn = rand(SPAWN_MIN, SPAWN_MAX)
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
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="ascii-stream" aria-hidden="true" />
}
