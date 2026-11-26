// Seagull Lab (dev only): seagull-lab.html. Shows the animation sheets, a big
// preview and the real flight engine — all from shape.ts / sheets.ts / settings.ts.
// The "Letters" row changes SETTINGS only on this page (to try things out);
// copy good values into settings.ts.

import { GullPainter, LETTER_SETS, SETTINGS, SHAPE, SHEETS, SeagullFlock, type ActionKey, type Pose } from './index'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const KEYS = Object.keys(SHEETS) as ActionKey[]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const FONT = `'JetBrains Mono', Consolas, monospace`
const R = SETTINGS.render

let tab: 'sheets' | 'preview' | 'flight' = 'sheets'
let action: ActionKey = 'level'

// ---- letters: shape / brightness / compare ----
const fromSettings = { letters: R.letters, chars: R.shape.chars, contrast: R.shape.contrast }
type Mode = 'shape' | 'ramp' | 'compare'
let mode: Mode = R.letters
function readLetters() {
  const l = $<HTMLSelectElement>('letters').value
  mode = l === 'settings' ? fromSettings.letters : (l as Mode)
  const cs = $<HTMLSelectElement>('charset').value
  R.shape.chars = cs === 'settings' ? fromSettings.chars : LETTER_SETS[cs as keyof typeof LETTER_SETS]
  R.shape.contrast = +$<HTMLInputElement>('contrast').value
  $('contrastV').textContent = R.shape.contrast.toFixed(1)
  resize()
  if (tab === 'sheets') buildSheets()
}
$<HTMLInputElement>('contrast').value = String(fromSettings.contrast)
$('letters').onchange = $('charset').onchange = $('contrast').oninput = readLetters

// ---- tabs ----
function setTab(t: typeof tab) {
  tab = t
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t))
  document.querySelectorAll<HTMLElement>('[data-for]').forEach((el) => (el.hidden = el.dataset.for !== t))
  $('sheet').hidden = t !== 'sheets'
  $('view').hidden = t === 'sheets'
  $('screenRow').hidden = t === 'sheets'
  if (t === 'sheets') buildSheets()
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab as typeof tab)))

// ---- sheets ----
const FRAMES = 8, FW = 50, FH = 24, SFONT = 6, SLINE = 7
const sheetShape = new GullPainter()
const sheetRamp = new GullPainter()
let sheetText = ''

function cellW(fontPx: number) {
  const c = document.createElement('canvas').getContext('2d')!
  c.font = `${fontPx}px ${FONT}`
  return c.measureText('M').width
}

function buildSheets() {
  const [vy, vt] = $<HTMLSelectElement>('sheetView').value.split(',').map(Number)
  const cw = cellW(SFONT)
  const ratio = cw / SLINE
  sheetShape.setup(FONT, SFONT, cw, SLINE, FW, FH, 'shape')
  sheetRamp.setup(FONT, SFONT, cw, SLINE, FW, FH, 'ramp')
  const painters = mode === 'compare' ? [sheetRamp, sheetShape] : [mode === 'shape' ? sheetShape : sheetRamp]
  const s = (FW * 0.95) / SHAPE.width
  const root = $('sheet')
  root.innerHTML = ''
  sheetText = `ASCII seagull - animation sheets (${FRAMES} frames per action, ${FW}x${FH} letters, letters: ${mode})\n\n`
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
      const fr = document.createElement('div')
      fr.className = 'fr'
      fr.innerHTML = `<span>${k} ${f + 1}/${FRAMES}</span>`
      sheetText += `-- frame ${f + 1} --\n`
      for (const p of painters) {
        p.clear()
        p.draw(pose, yaw, vt, FW / 2, FH / 2, s, ratio)
        const lines = p.lines()
        const pre = document.createElement('pre')
        pre.textContent = lines.join('\n')
        fr.appendChild(pre)
        sheetText += `${lines.join('\n')}\n`
      }
      row.appendChild(fr)
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
const liveShape = new GullPainter()
const liveRamp = new GullPainter()
let cols = 0, rows = 0, cw = 4, lineH = 8
// Virtual screen: everything is computed for SW x SH (like a real browser of
// that size) and the picture is shrunk by k to fit this panel.
let SW = innerWidth, SH = innerHeight, k = 1

function resize() {
  const choice = $<HTMLSelectElement>('screen').value
  if (choice === 'fit') {
    SW = innerWidth
    SH = innerHeight
    k = 1
  } else {
    ;[SW, SH] = choice.split('x').map(Number)
    k = Math.min(innerWidth / SW, innerHeight / SH)
  }
  const cssW = SW * k, cssH = SH * k
  view.style.width = `${cssW}px`
  view.style.height = `${cssH}px`
  view.style.left = `${(innerWidth - cssW) / 2}px`
  view.style.top = `${(innerHeight - cssH) / 2}px`
  const dpr = window.devicePixelRatio || 1
  view.width = Math.round(cssW * dpr)
  view.height = Math.round(cssH * dpr)
  vctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0) // draw in virtual-screen pixels
  vctx.font = `${R.fontSize}px ${FONT}`
  vctx.textBaseline = 'top'
  lineH = Math.round(R.fontSize * R.lineHeight)
  cw = vctx.measureText('M').width || 4
  cols = Math.ceil(SW / cw)
  rows = Math.ceil(SH / lineH)
  liveShape.setup(FONT, R.fontSize, cw, lineH, cols, rows, 'shape')
  liveRamp.setup(FONT, R.fontSize, cw, lineH, cols, rows, 'ramp')
  const gullPx = Math.round(R.size * SW)
  $('screenInfo').textContent =
    `gull ≈ ${gullPx}px wide on this screen` + (k < 1 ? ` · shown at ${Math.round(k * 100)}%` : '')
}
addEventListener('resize', resize)
$<HTMLSelectElement>('screen').onchange = () => {
  resize()
  flock.gulls = []
}

const flock = new SeagullFlock()
let autoSpawn = 1
$('spawn').onclick = () => flock.spawnNew()

let t = 0, turnDir = 1
let last = performance.now()
let frames = 0
;(window as unknown as { __lab: object }).__lab = { flock, frames: () => frames }
function frame(now: number) {
  requestAnimationFrame(frame)
  frames++
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (tab === 'sheets') return
  const ratio = cw / lineH
  const painters = mode === 'compare' ? [liveRamp, liveShape] : [mode === 'shape' ? liveShape : liveRamp]

  // what to draw this frame: [pose, yaw, tilt, x cells, y cells, cells per bird unit]
  const items: [Pose, number, number, number, number, number][] = []
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
    const size = +$<HTMLInputElement>('pvSize').value * (mode === 'compare' ? 0.5 : 1)
    const s = (cols * size) / SHAPE.width
    // compare: one gull in each half (old left, new right)
    const xs = mode === 'compare' ? [cols / 4, (cols * 3) / 4] : [cols / 2]
    for (const x of xs) items.push([pose, yaw, 0.3, x, rows / 2, s])
  } else {
    // flight: the app's engine, as leader, spawning often for testing
    autoSpawn -= dt
    if (autoSpawn <= 0 && !flock.gulls.length) {
      flock.spawnNew()
      autoSpawn = 2
    }
    flock.update(dt)
    const s = (cols * R.size) / SHAPE.width
    for (const g of flock.gulls) items.push([g.pose, g.yaw, g.tilt, g.x * cols, g.y * rows, s])
  }

  const out: string[][] = painters.map((p) => {
    p.clear()
    for (const [pose, yaw, tilt, x, y, s] of items) p.draw(pose, yaw, tilt, x, y, s, ratio)
    return p.lines()
  })
  // compare: left half from the old way, right half from the new way
  const half = Math.floor(cols / 2)
  const lines = out.length === 2 ? out[0].map((l, y) => l.slice(0, half) + out[1][y].slice(half)) : out[0]

  vctx.clearRect(0, 0, SW, SH)
  vctx.fillStyle = tab === 'flight' ? R.color : '#d8d8d8'
  lines.forEach((l, y) => {
    if (l.trim()) vctx.fillText(l, 0, y * lineH)
  })
  if (out.length === 2) {
    vctx.fillStyle = '#333'
    vctx.fillRect(half * cw, 0, 1, SH)
    vctx.fillStyle = '#7c7c7c'
    vctx.fillText('old: brightness', 8, SH - lineH * 3)
    vctx.fillText('new: shape', half * cw + 8, SH - lineH * 3)
  }

  // flight: show each gull's planned route (+) and its trail (.)
  if (tab === 'flight') {
    for (const g of flock.gulls) {
      const tr = (trails[g.id] ??= [])
      tr.push([g.x, g.y])
      if (tr.length > 2000) tr.shift()
      vctx.fillStyle = '#3a3a3a'
      for (let i = 0; i < tr.length; i += 6) vctx.fillText('.', tr[i][0] * SW, tr[i][1] * SH)
      vctx.fillStyle = '#9a9a9a'
      g.route.forEach(([x, y], i) => vctx.fillText(i < g.wp ? '+' : `+${i + 1}`, x * SW, y * SH))
    }
    for (const id of Object.keys(trails)) if (!flock.has(id)) delete trails[id]
  }
}
const trails: Record<string, [number, number][]> = {}

// wait for the web font, so the letter shapes are measured with the right font
document.fonts.load(`${R.fontSize}px 'JetBrains Mono'`).finally(() => {
  readLetters()
  setTab('sheets')
  requestAnimationFrame(frame)
})
