// Seagull Lab (dev only): seagull-lab.html. Shows the animation sheets, a big
// preview and the real flight engine — all from shape.ts / sheets.ts / settings.ts.

import { SETTINGS, SHAPE, SHEETS, SeagullFlock, drawGull, toAscii, type ActionKey } from './index'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const KEYS = Object.keys(SHEETS) as ActionKey[]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

let tab: 'sheets' | 'preview' | 'flight' = 'sheets'
let action: ActionKey = 'level'

// ---- tabs ----
function setTab(t: typeof tab) {
  tab = t
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t))
  document.querySelectorAll<HTMLElement>('[data-for]').forEach((el) => (el.hidden = el.dataset.for !== t))
  $('sheet').hidden = t !== 'sheets'
  $('view').hidden = t === 'sheets'
  if (t === 'sheets') buildSheets()
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab as typeof tab)))

// ---- sheets ----
const FRAMES = 8, FW = 50, FH = 24
const sc = document.createElement('canvas')
sc.width = FW
sc.height = FH
const sctx = sc.getContext('2d', { willReadFrequently: true })!
let sheetText = ''

function cellRatio(fontPx: number, lineH: number) {
  const c = document.createElement('canvas').getContext('2d')!
  c.font = `${fontPx}px 'JetBrains Mono', Consolas, monospace`
  return c.measureText('M').width / lineH
}

function buildSheets() {
  const [vy, vt] = $<HTMLSelectElement>('sheetView').value.split(',').map(Number)
  const ratio = cellRatio(6, 7)
  const s = (FW * 0.95) / SHAPE.width
  const root = $('sheet')
  root.innerHTML = ''
  sheetText = `ASCII seagull - animation sheets (${FRAMES} frames per action, ${FW}x${FH} letters)\n\n`
  for (const k of KEYS) {
    const a = SHEETS[k]
    const box = document.createElement('div')
    box.className = 'act'
    box.innerHTML = `<h3>${a.name} <span class="hint">(${k})</span></h3><p>${a.note}</p>`
    const row = document.createElement('div')
    row.className = 'frames'
    sheetText += `== ${k} : ${a.name} ==\n`
    for (let f = 0; f < FRAMES; f++) {
      const pose = a.pose(k === 'turn' ? f / (FRAMES - 1) : f / FRAMES)
      const yaw = k === 'turn' ? lerp(vy, Math.PI - vy, pose.turn ?? 0) : vy
      sctx.setTransform(1, 0, 0, 1, 0, 0)
      sctx.fillStyle = '#000'
      sctx.fillRect(0, 0, FW, FH)
      sctx.translate(FW / 2, FH / 2)
      sctx.scale(s, s * ratio)
      drawGull(sctx, pose, yaw, vt)
      const lines = toAscii(sctx, 0, 0, FW, FH)
      const fr = document.createElement('div')
      fr.className = 'fr'
      fr.innerHTML = `<span>${k} ${f + 1}/${FRAMES}</span>`
      const pre = document.createElement('pre')
      pre.textContent = lines.join('\n')
      fr.appendChild(pre)
      row.appendChild(fr)
      sheetText += `-- frame ${f + 1} --\n${lines.join('\n')}\n`
    }
    box.appendChild(row)
    root.appendChild(box)
    sheetText += '\n'
  }
}
$<HTMLSelectElement>('sheetView').onchange = buildSheets
$('download').onclick = () => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([sheetText], { type: 'text/plain' }))
  a.download = 'seagull-frames.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---- preview buttons ----
for (const k of KEYS) {
  const b = document.createElement('button')
  b.textContent = SHEETS[k].name
  b.dataset.k = k
  b.onclick = () => {
    action = k
    document.querySelectorAll<HTMLButtonElement>('#actions button').forEach((x) => x.classList.toggle('on', x.dataset.k === k))
  }
  $('actions').appendChild(b)
}
;($('actions').firstElementChild as HTMLButtonElement).classList.add('on')

// ---- live canvas (preview + flight) ----
const view = $<HTMLCanvasElement>('view')
const vctx = view.getContext('2d')!
const off = document.createElement('canvas')
const octx = off.getContext('2d', { willReadFrequently: true })!
const R = SETTINGS.render
let cols = 0, rows = 0, cellW = 4, lineH = 8

function resize() {
  const dpr = window.devicePixelRatio || 1
  view.width = innerWidth * dpr
  view.height = innerHeight * dpr
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  vctx.font = `${R.fontSize}px 'JetBrains Mono', Consolas, monospace`
  vctx.textBaseline = 'top'
  lineH = Math.round(R.fontSize * R.lineHeight)
  cellW = vctx.measureText('M').width || 4
  cols = Math.ceil(innerWidth / cellW)
  rows = Math.ceil(innerHeight / lineH)
  off.width = cols
  off.height = rows
}
addEventListener('resize', resize)

const flock = new SeagullFlock()
let autoSpawn = 1
$('spawn').onclick = () => flock.spawnNew()

let t = 0, turnDir = 1
let last = performance.now()
function frame(now: number) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (tab === 'sheets') return
  const ratio = cellW / lineH

  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.fillStyle = '#000'
  octx.fillRect(0, 0, cols, rows)

  if (tab === 'preview') {
    const a = SHEETS[action]
    t += dt * a.hz * (a.flaps ? SETTINGS.flight.flapHz : 1)
    if (t >= 1) {
      t -= 1
      if (action === 'turn') turnDir = -turnDir
    }
    const pose = a.pose(t)
    const v = 0.45
    const yaw = action === 'turn'
      ? (turnDir > 0 ? lerp(v, Math.PI - v, pose.turn ?? 0) : lerp(Math.PI - v, v, pose.turn ?? 0))
      : v
    const s = (cols * +$<HTMLInputElement>('pvSize').value) / SHAPE.width
    octx.translate(cols / 2, rows / 2)
    octx.scale(s, s * ratio)
    drawGull(octx, pose, yaw, 0.3)
  } else {
    // flight: the app's engine, as leader, spawning often for testing
    autoSpawn -= dt
    if (autoSpawn <= 0 && !flock.gulls.length) {
      flock.spawnNew()
      autoSpawn = 2
    }
    flock.update(dt)
    const s = (cols * R.size) / SHAPE.width
    for (const g of flock.gulls) {
      octx.setTransform(1, 0, 0, 1, 0, 0)
      octx.translate(g.x * cols, g.y * rows)
      octx.scale(s, s * ratio)
      drawGull(octx, g.pose, g.yaw, g.tilt)
    }
  }

  vctx.clearRect(0, 0, innerWidth, innerHeight)
  vctx.fillStyle = tab === 'flight' ? R.color : '#d8d8d8'
  toAscii(octx, 0, 0, cols, rows).forEach((l, y) => {
    if (l.trim()) vctx.fillText(l, 0, y * lineH)
  })
}

resize()
setTab('sheets')
requestAnimationFrame(frame)
