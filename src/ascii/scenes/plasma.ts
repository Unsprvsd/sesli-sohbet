// PLASMA — the slow ASCII waves behind the login form.
// Settings: PLASMA below (final values from the studio: src/ascii/final.json).
// Idea: per cell a brightness 0..1 from a sum of moving sines, swapped for a
// letter from `ramp`. Each row is one string -> ~70 fillText calls per frame.

import { applyFinal } from '../tune'

export const PLASMA = {
  ramp: ' .:-=+*#%@', // letters from dark to bright
  fontSize: 14,
  lineHeight: 16,
  fps: 30,
  color: '#222222', // letter colour (lower = fainter)
  speed: 1, // how fast the waves move (1 = as before)
  scale: 1, // wave size (bigger = wider, calmer waves)
  mouseRadius: 8.4, // cells around the mouse that get brighter
  mouseBoost: 0.5, // how much brighter
  clearMargin: 4, // px: letters start this far from the form ...
  clearFade: 240, // ... and reach full strength over this distance
  clearJitter: 0.35, // random edge per cell (part of clearFade): not a neat box
}
applyFinal(PLASMA, 'plasma')

/** Fixed pseudo-random number 0..1 for a cell (same every frame). */
function cellNoise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

type Options = {
  /** element box (viewport px) to keep clear of letters, e.g. the login form */
  clearRect?: () => DOMRect | null | undefined
  /** one still frame (prefers-reduced-motion) */
  still?: boolean
}

/** Runs the plasma on a canvas (sized by CSS). Returns stop(). */
export function startPlasma(canvas: HTMLCanvasElement, opt: Options = {}) {
  const ctx = canvas.getContext('2d')!
  const S = PLASMA
  const font = getComputedStyle(canvas).fontFamily || 'monospace'
  let cols = 0, rows = 0, cellW = 8, W = 0, H = 0, metricsKey = ''
  const mouse = { x: -1e4, y: -1e4 }

  const resize = () => {
    W = canvas.clientWidth
    H = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${S.fontSize}px ${font}`
    ctx.textBaseline = 'top'
    cellW = ctx.measureText('M').width || 8
    cols = Math.ceil(W / cellW)
    rows = Math.ceil(H / S.lineHeight)
    metricsKey = `${S.fontSize}|${S.lineHeight}`
  }

  const draw = (t: number) => {
    if (metricsKey !== `${S.fontSize}|${S.lineHeight}`) resize()
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = S.color
    const ramp = S.ramp || ' '
    const lh = S.lineHeight
    const cx = cols / 2, cy = rows / 2
    const sc = 1 / Math.max(0.05, S.scale)
    const tt = t * S.speed
    // canvas may be scaled (studio): page px -> canvas px
    const cr = canvas.getBoundingClientRect()
    const k = cr.width / (W || 1) || 1
    const mx = (mouse.x - cr.left) / k / cellW
    const my = (mouse.y - cr.top) / k / lh
    const r = opt.clearRect?.()
    const box = r && {
      left: (r.left - cr.left) / k, right: (r.right - cr.left) / k,
      top: (r.top - cr.top) / k, bottom: (r.bottom - cr.top) / k,
    }
    for (let y = 0; y < rows; y++) {
      let line = ''
      for (let x = 0; x < cols; x++) {
        // moving waves: sum of a few sines, mapped to 0..1
        let v =
          Math.sin(x * 0.09 * sc + tt * 0.7) +
          Math.sin(y * 0.16 * sc - tt * 0.5) +
          Math.sin((x * 0.05 + y * 0.11) * sc + tt * 0.4) +
          Math.sin(Math.hypot(x - cx, (y - cy) * 2) * 0.12 * sc - tt * 0.9)
        v = (v + 4) / 8
        // brighter around the mouse
        const md = Math.hypot(x - mx, (y - my) * 2)
        if (md < S.mouseRadius) v += (1 - md / S.mouseRadius) * S.mouseBoost
        // fade out around the form
        if (box) {
          const px = (x + 0.5) * cellW, py = (y + 0.5) * lh
          const ox = Math.max(box.left - px, 0, px - box.right)
          const oy = Math.max(box.top - py, 0, py - box.bottom)
          const d = (Math.hypot(ox, oy) - S.clearMargin) / Math.max(1, S.clearFade)
          const kk = Math.min(1, Math.max(0, d + (cellNoise(x, y) - 0.5) * S.clearJitter))
          v *= kk * kk * (3 - 2 * kk) // smoothstep: gentle start and end, no hard line
        }
        line += ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))]
      }
      ctx.fillText(line, 0, y * lh)
    }
  }

  let raf = 0, last = 0
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (now - last < 1000 / Math.max(1, S.fps)) return
    last = now
    draw(now / 1000)
  }
  const onMove = (e: PointerEvent) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  }
  const onResize = () => {
    resize()
    if (opt.still) draw(0)
  }

  resize()
  const ro = new ResizeObserver(onResize)
  ro.observe(canvas)
  // The web font often loads after the first measure; a wrong letter width
  // shifts the form gap and the mouse glow.
  document.fonts?.addEventListener('loadingdone', onResize)
  document.fonts?.ready.then(onResize)
  if (opt.still) draw(0)
  else {
    window.addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(loop)
  }
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
    document.fonts?.removeEventListener('loadingdone', onResize)
    window.removeEventListener('pointermove', onMove)
  }
}
