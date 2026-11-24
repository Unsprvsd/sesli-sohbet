import { useEffect, useRef } from 'react'
import { SEAGULL, SeagullFlock, drawGull } from '../seagull'

/**
 * ASCII seagulls behind the server screen: a gull appears at random times,
 * crosses the screen (gliding down when too high, climbing when too low)
 * and leaves on the other side. All settings: SEAGULL in src/seagull.ts.
 */
export default function AsciiSeagulls() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const R = SEAGULL.render
    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    // hidden low-res canvas: 1 pixel = 1 letter cell
    const off = document.createElement('canvas')
    const octx = off.getContext('2d', { willReadFrequently: true })
    if (!octx) return
    const flock = new SeagullFlock()
    if (import.meta.env.DEV) (window as unknown as { __seagulls: SeagullFlock }).__seagulls = flock

    let cols = 0, rows = 0, cellW = 4, lineH = 8

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.font = `${R.fontSize}px ${font}`
      ctx.textBaseline = 'top'
      lineH = Math.round(R.fontSize * R.lineHeight)
      cellW = ctx.measureText('M').width || 4
      cols = Math.ceil(window.innerWidth / cellW)
      rows = Math.ceil(window.innerHeight / lineH)
      off.width = cols
      off.height = rows
    }

    let drawn = false
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000) // cap after a hidden tab
      last = now
      const w = window.innerWidth, h = window.innerHeight
      flock.update(dt, { w, h })

      if (!flock.gulls.length) {
        if (drawn) ctx.clearRect(0, 0, w, h)
        drawn = false
        return
      }
      drawn = true

      const ratio = cellW / lineH
      const s = (cols * R.size) / SEAGULL.shape.width
      const rx = Math.ceil(s * 30) + 2 // half size of the area around a gull, in cells
      const ry = Math.ceil(s * 30 * ratio) + 2

      octx.setTransform(1, 0, 0, 1, 0, 0)
      octx.fillStyle = '#000'
      octx.fillRect(0, 0, cols, rows)
      for (const g of flock.gulls) {
        octx.setTransform(1, 0, 0, 1, 0, 0)
        octx.translate(g.x * cols, g.y * rows)
        octx.scale(s, s * ratio)
        drawGull(octx, g.pose, g.yaw, g.tilt)
      }

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = R.color
      const ramp = R.ramp
      for (const g of flock.gulls) {
        // only turn the area around this gull into letters
        const x0 = Math.max(0, Math.floor(g.x * cols) - rx)
        const y0 = Math.max(0, Math.floor(g.y * rows) - ry)
        const x1 = Math.min(cols, Math.floor(g.x * cols) + rx)
        const y1 = Math.min(rows, Math.floor(g.y * rows) + ry)
        const bw = x1 - x0, bh = y1 - y0
        if (bw <= 0 || bh <= 0) continue
        const d = octx.getImageData(x0, y0, bw, bh).data
        for (let y = 0; y < bh; y++) {
          let line = ''
          for (let x = 0; x < bw; x++) {
            line += ramp[Math.min(ramp.length - 1, Math.floor((d[(y * bw + x) * 4] / 255) * ramp.length))]
          }
          if (line.trim()) ctx.fillText(line, x0 * cellW, (y0 + y) * lineH)
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="ascii-gulls" aria-hidden="true" />
}
