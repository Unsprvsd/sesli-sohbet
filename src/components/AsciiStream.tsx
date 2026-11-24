import { useEffect, useRef } from 'react'

const FONT_SIZE = 14
// Head of the beam first, tail last: dense letters fade into dots.
const BEAM_CHARS = '@#&%$*+=~-:;,.'
// Brightness from head to tail (faint, on black).
const HEAD = 0x3c
const TAIL = 0x0a
// Space between letters, in letter widths (>1 so each letter can be read).
const SPACING = 1.6
// Lanes: height on the screen (0..1). One beam at a time per lane.
const LANES = [0.17, 0.39, 0.62, 0.84]

type Beam = {
  y: number // px
  x: number // px, position of the head
  dir: number // -1 = right to left, +1 = left to right
  speed: number // px per second
  len: number // letters
  chars: string
  wait: number // seconds until it starts (when not running)
  running: boolean
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

/**
 * Faint ASCII "beams" behind the server screen: in a few lanes a short
 * streak of letters appears at the right edge, runs to the left and leaves;
 * then, after a random pause, the next one starts.
 */
export default function AsciiStream() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Reduced motion: no beams at all (a frozen beam looks like a glitch).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    let cellW = 8

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'middle'
      cellW = ctx.measureText('M').width || 8
    }

    const reset = (b: Beam, lane: number, first: boolean) => {
      b.running = false
      b.wait = first ? rand(0.3, 5) : rand(1.5, 7)
      b.y = Math.round((LANES[lane] + rand(-0.04, 0.04)) * window.innerHeight)
      b.dir = Math.random() < 0.5 ? -1 : 1
      b.speed = rand(70, 140)
      b.len = Math.round(rand(14, 30))
      // letters along the beam: denser at the head, dots at the tail
      let s = ''
      for (let i = 0; i < b.len; i++) {
        const k = (i / b.len) * (BEAM_CHARS.length - 1) + rand(-0.8, 0.8)
        s += BEAM_CHARS[Math.max(0, Math.min(BEAM_CHARS.length - 1, Math.round(k)))]
      }
      b.chars = s
    }

    const beams: Beam[] = LANES.map((_, i) => {
      const b = { y: 0, x: 0, dir: -1, speed: 0, len: 0, chars: '', wait: 0, running: false }
      reset(b, i, true)
      return b
    })

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000) // cap after a hidden tab
      last = now
      const w = window.innerWidth
      const step = cellW * SPACING
      ctx.clearRect(0, 0, w, window.innerHeight)
      beams.forEach((b, lane) => {
        if (!b.running) {
          b.wait -= dt
          if (b.wait > 0) return
          b.running = true
          // start just outside the edge it comes from
          b.x = b.dir < 0 ? w + step : -step
        }
        b.x += b.dir * b.speed * dt
        // the tail trails behind the head, opposite to the direction
        const tailEnd = b.x - b.dir * b.len * step
        if ((b.dir < 0 && tailEnd < -step) || (b.dir > 0 && tailEnd > w + step)) {
          reset(b, lane, false)
          return
        }
        for (let i = 0; i < b.len; i++) {
          const cx = b.x - b.dir * i * step
          if (cx < -step || cx > w + step) continue
          const f = 1 - i / b.len
          const c = Math.round(TAIL + (HEAD - TAIL) * f * f)
          ctx.fillStyle = `rgb(${c},${c},${c})`
          ctx.fillText(b.chars[i], cx, b.y)
        }
      })
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
