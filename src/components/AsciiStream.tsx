import { useEffect, useRef } from 'react'

// Letters from dark to bright (same as the login background).
const RAMP = ' .:-=+*#%@'
const FONT_SIZE = 14
const LINE_HEIGHT = 16
const SPEED = 2.2 // cells per second, right to left
// One colour per row: middle row a bit brighter, outer rows dimmer.
const ROW_COLORS = ['#141414', '#1e1e1e', '#141414']

/**
 * Very faint band of 3 ASCII rows across the middle of the screen,
 * flowing slowly from right to left (background of the server screen).
 * The pattern is a few sine waves sampled at (x + time * SPEED); the
 * fractional part of the offset moves the text by sub-cell pixels,
 * so the flow is smooth instead of jumping one letter at a time.
 */
export default function AsciiStream() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    const rows = ROW_COLORS.length
    let cols = 0
    let cellW = 8

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = rows * LINE_HEIGHT * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${FONT_SIZE}px ${font}`
      ctx.textBaseline = 'top'
      cellW = ctx.measureText('M').width || 8
      cols = Math.ceil(window.innerWidth / cellW) + 2
    }

    const draw = (t: number) => {
      const offset = t * SPEED
      const shift = Math.floor(offset)
      const frac = offset - shift
      ctx.clearRect(0, 0, window.innerWidth, rows * LINE_HEIGHT)
      for (let y = 0; y < rows; y++) {
        let line = ''
        for (let x = 0; x < cols; x++) {
          const sx = x + shift
          let v =
            Math.sin(sx * 0.07 + y * 0.6) +
            Math.sin(sx * 0.023 - y * 0.4 + t * 0.15) +
            Math.sin(sx * 0.15 + t * 0.3)
          v = (v + 3) / 6
          const i = Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * RAMP.length)))
          line += RAMP[i]
        }
        ctx.fillStyle = ROW_COLORS[y]
        ctx.fillText(line, -frac * cellW, y * LINE_HEIGHT)
      }
    }

    let raf = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      draw(now / 1000)
    }
    const onResize = () => {
      resize()
      if (reduceMotion) draw(0)
    }

    resize()
    window.addEventListener('resize', onResize)
    if (reduceMotion) draw(0)
    else raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={ref} className="ascii-stream" aria-hidden="true" />
}
