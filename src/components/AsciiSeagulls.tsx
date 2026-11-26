import { useEffect, useRef } from 'react'
import { GullScreen, SeagullFlock, type Wave } from '../seagull'
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
    if (!canvas) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // draws the gulls (as letters) and the catch waves: src/seagull/render.ts
    const screen = new GullScreen(canvas, flock)
    const resize = () => screen.resize()
    if (import.meta.env.DEV) (window as unknown as { __seagulls: SeagullFlock }).__seagulls = flock

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

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      flock.update(dt)
      screen.draw(reduceMotion) // reduced motion: waves only, no gulls
    }

    resize()
    window.addEventListener('resize', resize)
    // Measure again when the web font has loaded (letter width changes).
    document.fonts?.addEventListener('loadingdone', resize)
    document.fonts?.ready.then(resize)
    // capture: true -> we see the press before any button does
    window.addEventListener('pointerdown', onPointer, { capture: true })
    window.addEventListener('click', onClick, { capture: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.fonts?.removeEventListener('loadingdone', resize)
      window.removeEventListener('pointerdown', onPointer, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flock])

  return <canvas ref={ref} className="ascii-gulls" aria-hidden="true" />
}
