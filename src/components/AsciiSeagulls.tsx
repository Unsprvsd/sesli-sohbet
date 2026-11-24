import { useEffect, useRef } from 'react'
import { SETTINGS, SHAPE, SeagullFlock, drawGull, type Wave } from '../seagull'
import type { GullListener, GullMsg } from '../lobby'

type Props = {
  selfId: string
  /** The leader spawns gulls and decides who caught one. */
  isLeader: boolean
  sendGull: (msg: GullMsg) => void
  onGull: (fn: GullListener) => () => void
  nameOf: (uid: string) => string
  /** Someone (maybe me) caught a gull. */
  onCaught: (uid: string) => void
}

/**
 * ASCII seagulls behind the server screen, the same for everyone:
 * the leader sends "spawn" (id + seed) and every browser flies the same gull.
 * Clicking a gull -> "hit" -> the leader sends "caught" -> wave + score.
 * Look / motion / settings: src/seagull/shape.ts, sheets.ts, settings.ts.
 */
export default function AsciiSeagulls({ selfId, isLeader, sendGull, onGull, nameOf, onCaught }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const flockRef = useRef<SeagullFlock | null>(null)
  if (!flockRef.current) flockRef.current = new SeagullFlock()
  const flock = flockRef.current

  // latest props, for the event handlers below
  const live = useRef({ selfId, isLeader, sendGull, nameOf, onCaught })
  live.current = { selfId, isLeader, sendGull, nameOf, onCaught }

  // gulls that are already caught (ignore late messages about them)
  const caughtRef = useRef(new Set<string>())
  // waves I started myself on click, waiting for the leader's answer
  const myWavesRef = useRef(new Map<string, Wave>())

  // a caught gull: remove it, wave at its place, count the point
  const applyCaught = (id: string, uid: string, x: number, y: number) => {
    if (caughtRef.current.has(id)) return
    caughtRef.current.add(id)
    flock.remove(id)
    const L = live.current
    const label = `<${uid === L.selfId ? 'you' : L.nameOf(uid) || '?'}> +1`
    const mine = myWavesRef.current.get(id)
    if (mine) mine.label = label // my click already started the wave
    else flock.addWave(x, y, label)
    myWavesRef.current.delete(id)
    L.onCaught(uid)
  }

  // leader role: spawn gulls and tell everyone
  useEffect(() => {
    const wasLeader = flock.leader
    flock.leader = isLeader
    if (isLeader && !wasLeader) flock.resetTimer(true)
    flock.onSpawn = (id, seed) => live.current.sendGull({ t: 'spawn', id, seed })
  }, [isLeader, flock])

  // messages from the others
  useEffect(
    () =>
      onGull((msg, from) => {
        const L = live.current
        if (msg.t === 'spawn') {
          if (!caughtRef.current.has(msg.id)) flock.addGull(msg.id, msg.seed)
        } else if (msg.t === 'hit') {
          // only the leader decides; the first hit wins
          if (!L.isLeader || caughtRef.current.has(msg.id)) return
          const caught: GullMsg = { t: 'caught', id: msg.id, uid: from, x: msg.x, y: msg.y }
          L.sendGull(caught)
          applyCaught(msg.id, from, msg.x, msg.y)
        } else if (msg.t === 'caught') {
          applyCaught(msg.id, msg.uid, msg.x, msg.y)
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onGull, flock],
  )

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const R = SETTINGS.render
    const font = getComputedStyle(document.body).fontFamily || 'monospace'
    // hidden low-res canvas: 1 pixel = 1 letter cell
    const off = document.createElement('canvas')
    const octx = off.getContext('2d', { willReadFrequently: true })
    if (!octx) return
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

    // Click on a gull. The gull wins over whatever is under it (buttons, inputs…):
    // we listen first (capture phase) and stop the event, so the button
    // underneath gets neither the press nor the click that follows.
    let blockClickUntil = 0
    const onPointer = (e: PointerEvent) => {
      if (reduceMotion) return // gulls are not drawn then
      const w = window.innerWidth, h = window.innerHeight
      const g = flock.hitTest(e.clientX, e.clientY, { w, h })
      if (!g) return
      e.preventDefault() // no focus / text selection on what is underneath
      e.stopPropagation()
      blockClickUntil = performance.now() + 700
      const L = live.current
      if (L.isLeader) {
        L.sendGull({ t: 'caught', id: g.id, uid: L.selfId, x: g.x, y: g.y })
        applyCaught(g.id, L.selfId, g.x, g.y)
      } else {
        // feedback at once; the leader's "caught" message decides the point
        flock.remove(g.id)
        myWavesRef.current.set(g.id, flock.addWave(g.x, g.y, ''))
        L.sendGull({ t: 'hit', id: g.id, x: g.x, y: g.y })
      }
    }
    // the click that follows a gull catch must not reach the button underneath
    const onClick = (e: MouseEvent) => {
      if (performance.now() > blockClickUntil) return
      blockClickUntil = 0
      e.preventDefault()
      e.stopPropagation()
    }

    const ramp = R.ramp
    const W = SETTINGS.catch.wave

    const drawGulls = (ratio: number) => {
      const s = (cols * R.size) / SHAPE.width
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
      ctx.fillStyle = R.color
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

    // wave: rings of letters growing from the catch point, fading out
    const drawWaves = (w: number) => {
      ctx.fillStyle = W.color
      const maxR = W.radius * w
      for (const wave of flock.waves) {
        const cx = wave.x * w, cy = wave.y * window.innerHeight
        const reach = maxR + W.band * 2
        const c0 = Math.max(0, Math.floor((cx - reach) / cellW)), c1 = Math.min(cols, Math.ceil((cx + reach) / cellW))
        const r0 = Math.max(0, Math.floor((cy - reach) / lineH)), r1 = Math.min(rows, Math.ceil((cy + reach) / lineH))
        const rings: { r: number; a: number }[] = []
        for (let i = 0; i < W.rings; i++) {
          const t = (wave.age - i * W.ringDelay) / (W.duration - (W.rings - 1) * W.ringDelay)
          if (t <= 0 || t >= 1) continue
          rings.push({ r: maxR * (1 - (1 - t) * (1 - t)), a: (1 - t) * (i === 0 ? 1 : 0.7) })
        }
        if (rings.length) {
          for (let row = r0; row < r1; row++) {
            let line = ''
            const py = (row + 0.5) * lineH
            for (let col = c0; col < c1; col++) {
              const px = (col + 0.5) * cellW
              const dist = Math.hypot(px - cx, py - cy)
              let v = 0
              for (const ring of rings) {
                const k = (dist - ring.r) / W.band
                v = Math.max(v, Math.exp(-k * k) * ring.a)
              }
              line += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))]
            }
            if (line.trim()) ctx.fillText(line, c0 * cellW, row * lineH)
          }
        }
        // catcher's name in the middle, fading out
        if (wave.label) {
          const a = Math.max(0, 1 - wave.age / W.duration)
          ctx.save()
          ctx.globalAlpha = a
          ctx.fillStyle = '#e6e6e6'
          ctx.font = `12px ${font}`
          ctx.textAlign = 'center'
          ctx.fillText(wave.label, cx, cy - 6 - wave.age * 10)
          ctx.restore()
          ctx.font = `${R.fontSize}px ${font}`
        }
      }
    }

    let drawn = false
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      flock.update(dt)
      const w = window.innerWidth, h = window.innerHeight

      if (!flock.gulls.length && !flock.waves.length) {
        if (drawn) ctx.clearRect(0, 0, w, h)
        drawn = false
        return
      }
      drawn = true
      ctx.clearRect(0, 0, w, h)
      if (!reduceMotion) drawGulls(cellW / lineH)
      drawWaves(w)
    }

    resize()
    window.addEventListener('resize', resize)
    // capture: true -> we see the press before any button does
    window.addEventListener('pointerdown', onPointer, { capture: true })
    window.addEventListener('click', onClick, { capture: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onPointer, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flock])

  return <canvas ref={ref} className="ascii-gulls" aria-hidden="true" />
}
