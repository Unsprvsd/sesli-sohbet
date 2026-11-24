import { useEffect, useRef } from 'react'

const FONT_SIZE = 14
const CHARS = '@#&%$*+=~-:;,.'
// Space between letters, in letter widths (>1 so each letter can be read).
const SPACING = 1.6
// Lanes: height of each fixed line on the screen (0..1).
const LANES = [0.17, 0.39, 0.62, 0.84]
// Brightness (grey level on black): resting letter / fully lit letter.
const BASE = 0x10
const PEAK = 0x48
// Glow: how many letters it takes to light up (in front) and to fade (behind).
const RISE = 5
const FADE = 28

type Glow = {
  pos: number // position of the glow, in letters (can be outside the line)
  dir: number // -1 = right to left, +1 = left to right
  speed: number // letters per second
  wait: number // seconds until the next glow starts
  running: boolean
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

/**
 * Faint, fixed ASCII lines behind the server screen. The letters never move;
 * a soft glow travels along each line, lighting the letters up one by one,
 * and the letters it leaves behind slowly fade back.
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
    let lines: string[] = []

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'middle'
      step = (ctx.measureText('M').width || 8) * SPACING
      cols = Math.ceil(window.innerWidth / step) + 1
      // fixed random letters for each line
      lines = LANES.map(() => {
        let s = ''
        for (let i = 0; i < cols; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)]
        return s
      })
    }

    const start = (g: Glow) => {
      g.running = true
      g.dir = Math.random() < 0.5 ? -1 : 1
      g.speed = rand(6, 11)
      g.pos = g.dir > 0 ? -RISE : cols + RISE
    }

    const glows: Glow[] = LANES.map(() => ({
      pos: 0,
      dir: 1,
      speed: 0,
      wait: rand(0.2, 4),
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
      LANES.forEach((lane, li) => {
        const y = Math.round(lane * h)
        const g = glows[li]
        const line = lines[li]
        for (let i = 0; i < cols; i++) {
          const c = level(i, g)
          ctx.fillStyle = `rgb(${c},${c},${c})`
          ctx.fillText(line[i], i * step, y)
        }
      })
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
