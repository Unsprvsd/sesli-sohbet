import { useEffect, useRef } from 'react'
import { SPIDER, Spider, SpiderLayer, layoutLines } from '../ascii/scenes/spider'
import { drawCatchWaves } from '../seagull/render'
import { SETTINGS, type Wave } from '../seagull'
import type { GullListener, GullMsg } from '../lobby'

type Props = {
  selfId: string
  /** The leader spawns spiders and decides who caught one (same leader as the gulls). */
  isLeader: boolean
  sendGull: (msg: GullMsg) => void
  onGull: (fn: GullListener) => () => void
  nameOf: (uid: string) => string
  /** Someone (maybe me) caught a spider — counts like a gull. */
  onCaught: (uid: string) => void
}

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a)

/**
 * The ASCII spider on the server screen: now and then it climbs along the layout
 * lines (sidebar | middle | online list). Same spider for everyone: the leader
 * sends "sp-spawn" (id + seed), every browser plans the same route from the seed.
 * Click it to catch it (+1, same score as gulls). Look / motion:
 * src/ascii/scenes/spider.ts (tune it in the studio: ascii-studio.html).
 */
export default function AsciiSpider({ selfId, isLeader, sendGull, onGull, nameOf, onCaught }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{ layer: SpiderLayer | null; waves: Wave[]; caught: Set<string>; mine: Map<string, Wave> }>({
    layer: null, waves: [], caught: new Set(), mine: new Map(),
  })
  const live = useRef({ selfId, isLeader, sendGull, nameOf, onCaught })
  live.current = { selfId, isLeader, sendGull, nameOf, onCaught }

  const addSpider = (id: string, seed: number) => {
    const st = stateRef.current
    if (!st.layer || st.caught.has(id) || st.layer.spiders.some((s) => s.id === id)) return
    st.layer.spiders.push(new Spider(id, seed))
  }

  const applyCaught = (id: string, uid: string, x: number, y: number) => {
    const st = stateRef.current
    if (st.caught.has(id)) return
    st.caught.add(id)
    const sp = st.layer?.spiders.find((s) => s.id === id)
    if (st.layer) st.layer.spiders = st.layer.spiders.filter((s) => s.id !== id)
    const L = live.current
    const label = `<${uid === L.selfId ? 'you' : L.nameOf(uid) || '?'}> +1`
    const mine = st.mine.get(id)
    if (mine) mine.label = label
    else {
      // wave where the spider is on MY screen (layouts differ between users)
      const W = st.layer?.W || 1, H = st.layer?.H || 1
      st.waves.push({ x: sp ? sp.x / W : x, y: sp ? sp.y / H : y, age: 0, label })
    }
    st.mine.delete(id)
    L.onCaught(uid)
  }

  // messages from the others
  useEffect(
    () =>
      onGull((msg, from) => {
        const L = live.current
        if (msg.t === 'sp-spawn') addSpider(msg.id, msg.seed)
        else if (msg.t === 'sp-hit') {
          // only the leader decides; the first hit wins
          if (!L.isLeader || stateRef.current.caught.has(msg.id)) return
          L.sendGull({ t: 'sp-caught', id: msg.id, uid: from, x: msg.x, y: msg.y })
          applyCaught(msg.id, from, msg.x, msg.y)
        } else if (msg.t === 'sp-caught') applyCaught(msg.id, msg.uid, msg.x, msg.y)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onGull],
  )

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    // Reduced motion: no spider.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const st = stateRef.current
    const layer = new SpiderLayer(canvas)
    st.layer = layer
    const root = canvas.parentElement ?? document
    let nextSpawn = rand(SPIDER.firstSpawn)
    let wasLeader = false

    const spawnNew = () => {
      const id = 's' + Math.random().toString(36).slice(2, 10)
      const seed = Math.floor(Math.random() * 4294967296)
      addSpider(id, seed)
      live.current.sendGull({ t: 'sp-spawn', id, seed })
    }
    if (import.meta.env.DEV) (window as unknown as { __spiders: object }).__spiders = { layer, spawnNew }

    // click on the spider: it wins over what is under it (like the gull)
    let blockClickUntil = 0
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const sp = layer.hitTest(e.clientX - r.left, e.clientY - r.top)
      if (!sp) return
      e.preventDefault()
      e.stopImmediatePropagation()
      blockClickUntil = performance.now() + 700
      const L = live.current
      const x = sp.x / layer.W, y = sp.y / layer.H
      if (L.isLeader) {
        L.sendGull({ t: 'sp-caught', id: sp.id, uid: L.selfId, x, y })
        applyCaught(sp.id, L.selfId, x, y)
      } else {
        layer.spiders = layer.spiders.filter((s) => s !== sp)
        const w: Wave = { x, y, age: 0, label: '' }
        st.waves.push(w)
        st.mine.set(sp.id, w)
        L.sendGull({ t: 'sp-hit', id: sp.id, x, y })
      }
    }
    const onClick = (e: MouseEvent) => {
      if (performance.now() > blockClickUntil) return
      blockClickUntil = 0
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    let raf = 0
    let last = performance.now()
    let drawn = false
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // leader: send a spider now and then (one at a time)
      const leader = live.current.isLeader
      if (leader && !wasLeader) nextSpawn = rand(SPIDER.firstSpawn)
      wasLeader = leader
      if (leader && !layer.spiders.length) {
        nextSpawn -= dt
        if (nextSpawn <= 0) {
          spawnNew()
          nextSpawn = rand(SPIDER.spawnEvery)
        }
      }
      for (const w of st.waves) w.age += dt
      st.waves = st.waves.filter((w) => w.age < SETTINGS.catch.wave.duration)
      if (!layer.spiders.length && !st.waves.length) {
        if (drawn) layer.draw() // clears
        drawn = false
        return
      }
      drawn = true
      const lines = layoutLines(root, canvas)
      for (const s of layer.spiders) s.updateLines(dt, layer.W, layer.H, lines)
      layer.spiders = layer.spiders.filter((s) => !s.done)
      layer.draw()
      const ctx = canvas.getContext('2d')!
      drawCatchWaves(ctx, st.waves, { ...layer, font: layer.font, fontSize: SPIDER.fontSize })
    }

    const resize = () => layer.resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    document.fonts?.addEventListener('loadingdone', resize)
    window.addEventListener('pointerdown', onPointer, { capture: true })
    window.addEventListener('click', onClick, { capture: true })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.fonts?.removeEventListener('loadingdone', resize)
      window.removeEventListener('pointerdown', onPointer, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
      st.layer = null
    }
  }, [])

  return <canvas ref={ref} className="ascii-spider" aria-hidden="true" />
}
