import { useEffect, useRef, type RefObject } from 'react'

// Letters from dark to bright. One letter = one cell of the grid.
const RAMP = ' .:-=+*#%@'
const FONT_SIZE = 14
const LINE_HEIGHT = 16
const FPS = 30
const MOUSE_RADIUS = 8.4 // in cells
// Letter colour (grey on black). Lower = fainter.
const TEXT_COLOR = '#222222'
// Soft edge around the form: letters start this far out (px) ...
const CLEAR_MARGIN = 4
// ... and reach full strength over this distance (px).
const CLEAR_FADE = 240
// Random shift of the edge per cell (part of CLEAR_FADE), so it is not a neat box.
const CLEAR_JITTER = 0.35

/** Fixed pseudo-random number 0..1 for a cell (same every frame). */
function cellNoise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Full-screen animated ASCII background (used behind the login form).
 * Idea: for each cell compute a brightness 0..1 (moving sine "plasma"),
 * then swap it for a letter from RAMP. Each row is drawn as one string,
 * so even a big screen is only ~70 fillText calls per frame.
 */
type Props = {
  /** Element to keep clear of letters (the login form). */
  clearRef?: RefObject<HTMLElement | null>
}

export default function AsciiBackground({ clearRef }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    let cols = 0
    let rows = 0
    let cellW = 8
    const mouse = { x: -1e4, y: -1e4 }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'top'
      cellW = ctx.measureText('M').width || 8
      cols = Math.ceil(window.innerWidth / cellW)
      rows = Math.ceil(window.innerHeight / LINE_HEIGHT)
    }

    const draw = (t: number) => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = TEXT_COLOR
      const cx = cols / 2
      const cy = rows / 2
      const mx = mouse.x / cellW
      const my = mouse.y / LINE_HEIGHT
      // the form's box: no letters inside (+ margin), fading in around it
      const r = clearRef?.current?.getBoundingClientRect()
      for (let y = 0; y < rows; y++) {
        let line = ''
        for (let x = 0; x < cols; x++) {
          // moving waves: sum of a few sines, mapped to 0..1
          let v =
            Math.sin(x * 0.09 + t * 0.7) +
            Math.sin(y * 0.16 - t * 0.5) +
            Math.sin((x * 0.05 + y * 0.11) + t * 0.4) +
            Math.sin(Math.hypot(x - cx, (y - cy) * 2) * 0.12 - t * 0.9)
          v = (v + 4) / 8
          // brighter around the mouse
          const md = Math.hypot(x - mx, (y - my) * 2)
          if (md < MOUSE_RADIUS) v += (1 - md / MOUSE_RADIUS) * 0.5
          // fade out around the form
          if (r) {
            const px = (x + 0.5) * cellW
            const py = (y + 0.5) * LINE_HEIGHT
            const ox = Math.max(r.left - px, 0, px - r.right)
            const oy = Math.max(r.top - py, 0, py - r.bottom)
            const d = (Math.hypot(ox, oy) - CLEAR_MARGIN) / CLEAR_FADE
            const k = Math.min(1, Math.max(0, d + (cellNoise(x, y) - 0.5) * CLEAR_JITTER))
            v *= k * k * (3 - 2 * k) // smoothstep: gentle start and end, no hard line
          }
          const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * RAMP.length)))
          line += RAMP[i]
        }
        ctx.fillText(line, 0, y * LINE_HEIGHT)
      }
    }

    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      last = now
      draw(now / 1000)
    }

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const onResize = () => {
      resize()
      if (reduceMotion) draw(0)
    }

    resize()
    window.addEventListener('resize', onResize)
    if (reduceMotion) {
      draw(0)
    } else {
      window.addEventListener('pointermove', onMove)
      raf = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [clearRef])

  return <canvas ref={ref} className="ascii-bg" aria-hidden="true" />
}
