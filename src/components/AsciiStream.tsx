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
// Glow: letters from the brightest one until it is gone (in front / behind).
const RISE = 10
const FADE = 10
// Keep glows at least this far apart in height (part of the screen, 0..1).
const MIN_GAP = 0.08

type Glow = {
  y: number // height on the screen (0..1)
  line: string // random letters of this glow's (invisible) line
  pos: number // position of the glow, in letters (can be outside the line)
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
 * as the glow reaches them and fade again about 10 letters later.
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
      for (const g of glows) if (g.line.length < cols) g.line = randomLine(cols)
    }

    const spawn = () => {
      // random height, not too close to the glows already on the screen
      let y = rand(0.06, 0.94)
      for (let tries = 0; tries < 12; tries++) {
        if (glows.every((o) => Math.abs(o.y - y) >= MIN_GAP)) break
        y = rand(0.06, 0.94)
      }
      const dir = Math.random() < 0.5 ? -1 : 1
      glows.push({
        y,
        line: randomLine(cols),
        dir,
        speed: rand(6, 11),
        pos: dir > 0 ? -RISE : cols + RISE,
      })
    }

    // brightness of letter i, given its glow
    const level = (i: number, g: Glow) => {
      // d > 0: the glow has passed this letter (behind); d < 0: still in front
      const d = (g.pos - i) * g.dir
      const f = d >= 0 ? Math.max(0, 1 - d / FADE) : Math.max(0, 1 + d / RISE)
      return Math.round(PEAK * f * f)
    }

    const draw = () => {
      const h = window.innerHeight
      ctx.clearRect(0, 0, window.innerWidth, h)
      for (const g of glows) {
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

      // send a new glow at random moments, if there is room for one
      nextSpawn -= dt
      if (nextSpawn <= 0) {
        if (glows.length < MAX_GLOWS) spawn()
        nextSpawn = rand(SPAWN_MIN, SPAWN_MAX)
      }

      for (const g of glows) g.pos += g.dir * g.speed * dt
      // remove glows whose faded tail has left the screen
      glows = glows.filter((g) => {
        const tail = g.pos - g.dir * FADE
        return g.dir > 0 ? tail <= cols : tail >= 0
      })
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
