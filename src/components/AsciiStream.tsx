import { useEffect, useRef } from 'react'

const FONT_SIZE = 14
const CHARS = '@#&%$*+=~-:;,.'
// Space between letters, in letter widths (>1 so each letter can be read).
const SPACING = 1.6
// How many glows can be on the screen at the same time.
const COUNT = 4
// Brightness (grey level on black): resting letter (0 = invisible) / brightest.
const BASE = 0
const PEAK = 0x48
// Glow: letters from the brightest one until it is gone (in front / behind).
const RISE = 10
const FADE = 10
// Keep glows at least this far apart in height (part of the screen, 0..1).
const MIN_GAP = 0.08

type Glow = {
  y: number // height on the screen (0..1), new random value for each glow
  line: string // random letters of this glow's line
  pos: number // position of the glow, in letters (can be outside the line)
  dir: number // -1 = right to left, +1 = left to right
  speed: number // letters per second
  wait: number // seconds until the next glow starts
  running: boolean
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
 * Faint ASCII glows behind the server screen. Each glow runs along an
 * invisible line of fixed letters at a random height: the letters never move,
 * they light up as the glow reaches them and fade again about 10 letters later.
 */
export default function AsciiStream() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    let step = 13
    let cols = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'middle'
      step = (ctx.measureText('M').width || 8) * SPACING
      cols = Math.ceil(window.innerWidth / step) + 1
      for (const g of glows) if (g.line.length < cols) g.line = randomLine(cols)
    }

    const start = (g: Glow) => {
      // random height, not too close to the other glows on the screen
      let y = rand(0.06, 0.94)
      for (let tries = 0; tries < 12; tries++) {
        if (glows.every((o) => o === g || !o.running || Math.abs(o.y - y) >= MIN_GAP)) break
        y = rand(0.06, 0.94)
      }
      g.y = y
      g.line = randomLine(cols)
      g.running = true
      g.dir = Math.random() < 0.5 ? -1 : 1
      g.speed = rand(6, 11)
      g.pos = g.dir > 0 ? -RISE : cols + RISE
    }

    // first starts are spread out, so the glows do not run side by side
    const glows: Glow[] = Array.from({ length: COUNT }, (_, i) => ({
      y: 0,
      line: '',
      pos: 0,
      dir: 1,
      speed: 0,
      wait: i * 1.5 + rand(0.2, 1.5),
      running: false,
    }))

    // brightness of letter i on a line, given that line's glow
    const level = (i: number, g: Glow) => {
      if (!g.running) return BASE
      // d > 0: the glow has passed this letter (behind); d < 0: still in front
      const d = (g.pos - i) * g.dir
      let f = 0
      if (d >= 0) f = Math.max(0, 1 - d / FADE)
      else f = Math.max(0, 1 + d / RISE)
      return Math.round(BASE + (PEAK - BASE) * f * f)
    }

    const draw = () => {
      const h = window.innerHeight
      ctx.clearRect(0, 0, window.innerWidth, h)
      for (const g of glows) {
        if (!g.running) continue
        const y = Math.round(g.y * h)
        // only the letters near the glow can be visible
        const from = Math.max(0, Math.floor(g.pos - Math.max(RISE, FADE)) - 1)
        const to = Math.min(cols - 1, Math.ceil(g.pos + Math.max(RISE, FADE)) + 1)
        for (let i = from; i <= to; i++) {
          const c = level(i, g)
          if (c <= 0) continue
          ctx.fillStyle = `rgb(${c},${c},${c})`
          ctx.fillText(g.line[i], i * step, y)
        }
      }
    }

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000) // cap after a hidden tab
      last = now
      for (const g of glows) {
        if (!g.running) {
          g.wait -= dt
          if (g.wait <= 0) start(g)
          continue
        }
        g.pos += g.dir * g.speed * dt
        // done when the faded tail has left the line
        const tail = g.pos - g.dir * FADE
        if ((g.dir > 0 && tail > cols) || (g.dir < 0 && tail < 0)) {
          g.running = false
          g.wait = rand(1, 5)
        }
      }
      draw()
    }

    const onResize = () => {
      resize()
      draw()
    }

    resize()
    draw()
    window.addEventListener('resize', onResize)
    if (!reduceMotion) raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={ref} className="ascii-stream" aria-hidden="true" />
}
