// ASCII EDITOR (dev only): ascii-editor.html
// Paint shapes on the left, see them as sharp ASCII on the right (letters picked
// by shape: src/ascii/shapeAscii.ts). Place single letters by hand with the
// letter tool. Frames for animation. Export .txt / .ts for the app.

import { LETTER_SETS, ShapeAscii } from '../ascii/shapeAscii'
import { Doc, SX, SY, exportTs, exportTxt, type Frame, type Look, type Project } from './doc'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const FONT = `'JetBrains Mono', Consolas, monospace`
const LINE = 1.2 // line height = font size * LINE
const BASE = 14 // font size used to measure letter shapes (shapes scale with size)
const SAVE_KEY = 'ascii-editor:autosave'

type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'letter'

const doc = new Doc()
const ui = {
  tool: 'brush' as Tool,
  size: 1.5, // brush radius in letter widths
  ink: 1, // 0..1 brightness of the paint
  filled: false,
  zoom: 14,
  view: 'both' as 'both' | 'ascii' | 'paint',
  grid: false,
  onion: true,
  handMarks: true,
  invert: false,
  playing: 0, // interval id
}

// ---------------- letter cell size on screen ----------------
let cellW = 8, lineH = 16
const measure = document.createElement('canvas').getContext('2d')!
function letterWidth(px: number) {
  measure.font = `${px}px ${FONT}`
  return measure.measureText('M').width
}

// ---------------- letters: shape matcher ----------------
let matcher: ShapeAscii | null = null
let matcherKey = ''
function lookChars(l: Look) {
  return l.set === 'custom' ? l.custom || ' ' : LETTER_SETS[l.set]
}
function getMatcher() {
  const l = doc.look
  const key = [lookChars(l), l.minInk, document.fonts.status].join('|')
  if (!matcher || key !== matcherKey) {
    matcherKey = key
    matcher = new ShapeAscii(FONT, BASE, letterWidth(BASE), BASE * LINE, {
      chars: lookChars(l), sub: [SX, SY], contrast: l.contrast, minInk: l.minInk,
    })
  }
  matcher.setContrast(l.contrast)
  return matcher
}

/** A frame as letters (hand-placed letters win). */
function toLines(f: Frame): string[] {
  const { cols, rows } = doc
  const d = doc.ctx(f).getImageData(0, 0, cols * SX, rows * SY).data
  const lines = getMatcher().convert(d, cols, rows)
  if (!f.letters.size) return lines
  const grid = lines.map((l) => [...l])
  for (const [i, ch] of f.letters) {
    const y = Math.floor(i / cols)
    if (y < rows) grid[y][i % cols] = ch
  }
  return grid.map((r) => r.join(''))
}

// ---------------- boards ----------------
const paintCv = $<HTMLCanvasElement>('paint')
const asciiCv = $<HTMLCanvasElement>('ascii')
const pctx = paintCv.getContext('2d')!
const actx = asciiCv.getContext('2d')!

function layout() {
  cellW = letterWidth(ui.zoom)
  lineH = ui.zoom * LINE
  const W = doc.cols * cellW, H = doc.rows * lineH
  const dpr = window.devicePixelRatio || 1
  for (const [cv, c] of [[paintCv, pctx], [asciiCv, actx]] as const) {
    cv.style.width = `${W}px`
    cv.style.height = `${H}px`
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  $('paintBox').hidden = ui.view === 'ascii'
  $('asciiBox').hidden = ui.view === 'paint'
  requestRender()
}

// pointer position (CSS px on the board) + what is being drawn right now
let hover: { x: number; y: number } | null = null
let drag: { tool: Tool; x0: number; y0: number; x: number; y: number; shift: boolean; erase: boolean } | null = null

function drawGrid(c: CanvasRenderingContext2D, W: number, H: number) {
  c.strokeStyle = '#161616'
  c.lineWidth = 1
  c.beginPath()
  for (let x = 1; x < doc.cols; x++) { c.moveTo(Math.round(x * cellW) + 0.5, 0); c.lineTo(Math.round(x * cellW) + 0.5, H) }
  for (let y = 1; y < doc.rows; y++) { c.moveTo(0, Math.round(y * lineH) + 0.5); c.lineTo(W, Math.round(y * lineH) + 0.5) }
  c.stroke()
}

/** shape box from the drag (shift = square / circle) */
function dragBox(d: NonNullable<typeof drag>) {
  let w = d.x - d.x0, h = d.y - d.y0
  if (d.shift && d.tool !== 'line') {
    const m = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * m
    h = Math.sign(h || 1) * m
  }
  return { x: d.x0, y: d.y0, w, h }
}

/** Draws a shape tool in board (CSS px) coordinates. */
function shapePath(c: CanvasRenderingContext2D, d: NonNullable<typeof drag>) {
  const b = dragBox(d)
  c.beginPath()
  if (d.tool === 'line') {
    c.moveTo(b.x, b.y)
    c.lineTo(b.x + b.w, b.y + b.h)
  } else if (d.tool === 'rect') {
    c.rect(b.x, b.y, b.w, b.h)
  } else {
    c.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.abs(b.w / 2), Math.abs(b.h / 2), 0, 0, Math.PI * 2)
  }
}

function inkColor(erase: boolean) {
  const v = erase ? 0 : Math.round(ui.ink * 255)
  return `rgb(${v},${v},${v})`
}

let renderQueued = false
function requestRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    render()
  })
}

function render() {
  const W = doc.cols * cellW, H = doc.rows * lineH
  const prev = ui.onion && !ui.playing && doc.current > 0 ? doc.frames[doc.current - 1] : null
  const r = ui.size * cellW

  // ---- paint view ----
  if (ui.view !== 'ascii') {
    const c = pctx
    c.fillStyle = '#000'
    c.fillRect(0, 0, W, H)
    c.imageSmoothingEnabled = true
    if (prev) {
      c.globalAlpha = 0.3
      c.drawImage(prev.paint, 0, 0, W, H)
      c.globalAlpha = 1
      c.globalCompositeOperation = 'lighten'
    }
    c.drawImage(doc.frame.paint, 0, 0, W, H)
    c.globalCompositeOperation = 'source-over'
    if (ui.grid) drawGrid(c, W, H)
    if (drag && drag.tool !== 'brush' && drag.tool !== 'eraser' && drag.tool !== 'letter') {
      c.save()
      shapePath(c, drag)
      c.globalAlpha = 0.6
      if (ui.filled && drag.tool !== 'line') {
        c.fillStyle = inkColor(drag.erase)
        c.fill()
      } else {
        c.strokeStyle = drag.erase ? '#f44' : inkColor(false)
        c.lineWidth = r * 2
        c.lineCap = 'round'
        c.stroke()
      }
      c.restore()
    }
  }

  // ---- ascii view ----
  const lines = toLines(doc.frame)
  if (ui.view !== 'paint') {
    const c = actx
    c.fillStyle = '#000'
    c.fillRect(0, 0, W, H)
    if (ui.grid) drawGrid(c, W, H)
    c.font = `${ui.zoom}px ${FONT}`
    c.textBaseline = 'top'
    if (prev) {
      c.fillStyle = '#2a2a2a'
      toLines(prev).forEach((l, y) => {
        if (l.trim()) c.fillText(l, 0, y * lineH)
      })
    }
    if (ui.handMarks) {
      c.fillStyle = '#1d1d1d'
      for (const i of doc.frame.letters.keys()) {
        c.fillRect((i % doc.cols) * cellW, Math.floor(i / doc.cols) * lineH, cellW, lineH)
      }
    }
    c.fillStyle = '#d6d6d6'
    lines.forEach((l, y) => {
      if (l.trim()) c.fillText(l, 0, y * lineH)
    })
  }

  // ---- cursor ----
  if (hover && !ui.playing) {
    for (const c of [pctx, actx]) {
      c.save()
      c.strokeStyle = '#888'
      c.lineWidth = 1
      if (ui.tool === 'letter') {
        const cx = Math.floor(hover.x / cellW), cy = Math.floor(hover.y / lineH)
        c.strokeRect(cx * cellW + 0.5, cy * lineH + 0.5, cellW - 1, lineH - 1)
      } else {
        c.beginPath()
        c.arc(hover.x, hover.y, Math.max(1, r), 0, Math.PI * 2)
        c.stroke()
      }
      c.restore()
    }
  }

  drawThumbs()
  const cell = hover ? `cell ${Math.floor(hover.x / cellW) + 1},${Math.floor(hover.y / lineH) + 1} · ` : ''
  $('status').textContent =
    `${cell}frame ${doc.current + 1}/${doc.frames.length} · ${doc.cols}x${doc.rows} · ` +
    `${doc.frame.letters.size} hand letter(s) · tool: ${ui.tool}` +
    ` · keys: B E L R O T, [ ] size, Ctrl+Z / Ctrl+Y, , . frames, Space play, Shift = square/circle`
}

// ---------------- frame thumbnails ----------------
let thumbCount = -1
function drawThumbs() {
  const box = $('thumbs')
  const tw = 64, th = Math.max(8, Math.round((tw * doc.rows * lineH) / (doc.cols * cellW)))
  if (thumbCount !== doc.frames.length || box.children.length !== doc.frames.length) {
    thumbCount = doc.frames.length
    box.innerHTML = ''
    doc.frames.forEach((_, i) => {
      const b = document.createElement('button')
      const cv = document.createElement('canvas')
      cv.width = tw
      cv.height = th
      b.append(cv, String(i + 1))
      b.onclick = () => doc.select(i)
      box.appendChild(b)
    })
  }
  doc.frames.forEach((f, i) => {
    const b = box.children[i] as HTMLButtonElement
    b.classList.toggle('on', i === doc.current)
    const cv = b.querySelector('canvas')!
    if (cv.height !== th) cv.height = th
    const c = cv.getContext('2d')!
    c.drawImage(f.paint, 0, 0, tw, th)
  })
}

// ---------------- drawing on the paint layer ----------------
/** paint context with a transform so we can draw in board (CSS px) coordinates */
function paintCtx() {
  const c = doc.ctx()
  c.setTransform(SX / cellW, 0, 0, SY / lineH, 0, 0)
  return c
}

function brushTo(x0: number, y0: number, x1: number, y1: number, erase: boolean) {
  const c = paintCtx()
  c.strokeStyle = c.fillStyle = inkColor(erase)
  c.lineWidth = ui.size * cellW * 2
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(x0, y0)
  c.lineTo(x1 + 0.01, y1)
  c.stroke()
  c.setTransform(1, 0, 0, 1, 0, 0)
}

function commitShape(d: NonNullable<typeof drag>) {
  const c = paintCtx()
  shapePath(c, d)
  if (ui.filled && d.tool !== 'line') {
    c.fillStyle = inkColor(d.erase)
    c.fill()
  } else {
    c.strokeStyle = inkColor(d.erase)
    c.lineWidth = ui.size * cellW * 2
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.stroke()
  }
  c.setTransform(1, 0, 0, 1, 0, 0)
}

function placeLetter(x: number, y: number, remove: boolean) {
  const cx = Math.floor(x / cellW), cy = Math.floor(y / lineH)
  if (cx < 0 || cy < 0 || cx >= doc.cols || cy >= doc.rows) return
  const i = cy * doc.cols + cx
  if (remove) doc.frame.letters.delete(i)
  else doc.frame.letters.set(i, $<HTMLInputElement>('letter').value || ' ')
}

/** pointer position on the board in CSS px (offsetX is not reliable everywhere) */
function boardPos(cv: HTMLCanvasElement, e: PointerEvent) {
  const r = cv.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

for (const cv of [paintCv, asciiCv]) {
  cv.addEventListener('contextmenu', (e) => e.preventDefault())
  cv.addEventListener('pointerdown', (e) => {
    if (ui.playing) stopPlay()
    try {
      cv.setPointerCapture(e.pointerId) // keep drawing when the pointer leaves the board
    } catch {
      // not a real active pointer (e.g. synthetic event): draw without capture
    }
    const { x, y } = boardPos(cv, e)
    const erase = e.button === 2 || ui.tool === 'eraser' // right button = erase with any tool
    doc.checkpoint()
    drag = { tool: ui.tool, x0: x, y0: y, x, y, shift: e.shiftKey, erase }
    if (ui.tool === 'brush' || ui.tool === 'eraser') brushTo(x, y, x, y, erase)
    else if (ui.tool === 'letter') placeLetter(x, y, erase)
    changed()
  })
  cv.addEventListener('pointermove', (e) => {
    const { x, y } = boardPos(cv, e)
    hover = { x, y }
    if (drag) {
      if (drag.tool === 'brush' || drag.tool === 'eraser') brushTo(drag.x, drag.y, x, y, drag.erase)
      else if (drag.tool === 'letter') placeLetter(x, y, drag.erase)
      drag.x = x
      drag.y = y
      drag.shift = e.shiftKey
      if (drag.tool === 'brush' || drag.tool === 'eraser' || drag.tool === 'letter') changed()
    }
    requestRender()
  })
  const end = () => {
    if (drag && (drag.tool === 'line' || drag.tool === 'rect' || drag.tool === 'ellipse')) {
      commitShape(drag)
      drag = null
      changed()
    }
    drag = null
  }
  cv.addEventListener('pointerup', end)
  cv.addEventListener('pointercancel', end)
  cv.addEventListener('pointerleave', () => {
    hover = null
    requestRender()
  })
}

// ---------------- changes, autosave ----------------
let saveTimer = 0
function changed() {
  requestRender()
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(doc.toProject()))
    } catch {
      // storage full or blocked: the "save project" button still works
    }
  }, 800)
}
doc.onChange = () => {
  syncInputs()
  layout()
  changed()
}

// ---------------- inputs ----------------
function setTool(t: Tool) {
  ui.tool = t
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t))
  requestRender()
}
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool as Tool)))

const num = (id: string) => +$<HTMLInputElement>(id).value
const setVal = (id: string, v: string | number) => {
  const el = $<HTMLInputElement>(id)
  if (document.activeElement !== el) el.value = String(v)
}

function syncInputs() {
  setVal('name', doc.name)
  setVal('cols', doc.cols)
  setVal('rows', doc.rows)
  setVal('fps', doc.fps)
  setVal('set', doc.look.set)
  setVal('custom', doc.look.custom)
  setVal('contrast', doc.look.contrast)
  setVal('minInk', doc.look.minInk)
  $('custom').hidden = doc.look.set !== 'custom'
  $('contrastV').textContent = doc.look.contrast.toFixed(1)
  $('minInkV').textContent = doc.look.minInk.toFixed(2)
  $('sizeV').textContent = ui.size.toFixed(1)
  $('inkV').textContent = `${Math.round(ui.ink * 100)}%`
}

$('name').oninput = () => { doc.name = $<HTMLInputElement>('name').value || 'untitled'; changed() }
$('cols').onchange = $('rows').onchange = () => doc.resize(num('cols'), num('rows'))
$('fps').onchange = () => { doc.fps = Math.max(1, Math.min(60, num('fps'))); if (ui.playing) { stopPlay(); play() } changed() }
$('zoom').onchange = () => { ui.zoom = num('zoom'); layout() }
$('viewMode').onchange = () => { ui.view = $<HTMLSelectElement>('viewMode').value as typeof ui.view; layout() }
$('set').onchange = () => { doc.look.set = $<HTMLSelectElement>('set').value as Look['set']; syncInputs(); changed() }
$('custom').oninput = () => { doc.look.custom = $<HTMLInputElement>('custom').value; changed() }
$('contrast').oninput = () => { doc.look.contrast = num('contrast'); syncInputs(); changed() }
$('minInk').oninput = () => { doc.look.minInk = num('minInk'); syncInputs(); changed() }
$('size').oninput = () => { ui.size = num('size'); syncInputs(); requestRender() }
$('ink').oninput = () => { ui.ink = num('ink') / 100; syncInputs() }
$('filled').onchange = () => { ui.filled = $<HTMLInputElement>('filled').checked }
$('grid').onchange = () => { ui.grid = $<HTMLInputElement>('grid').checked; requestRender() }
$('onion').onchange = () => { ui.onion = $<HTMLInputElement>('onion').checked; requestRender() }
$('handMarks').onchange = () => { ui.handMarks = $<HTMLInputElement>('handMarks').checked; requestRender() }
$('invert').onchange = () => { ui.invert = $<HTMLInputElement>('invert').checked }

// ---------------- frames + play ----------------
$('addFrame').onclick = () => doc.addFrame(false)
$('dupFrame').onclick = () => doc.addFrame(true)
$('delFrame').onclick = () => doc.deleteFrame()
$('left').onclick = () => doc.moveFrame(-1)
$('right').onclick = () => doc.moveFrame(1)
function play() {
  if (doc.frames.length < 2) return
  ui.playing = window.setInterval(() => doc.select((doc.current + 1) % doc.frames.length), 1000 / doc.fps)
  $('play').textContent = 'stop'
  $('play').classList.add('on')
}
function stopPlay() {
  clearInterval(ui.playing)
  ui.playing = 0
  $('play').textContent = 'play'
  $('play').classList.remove('on')
  requestRender()
}
$('play').onclick = () => (ui.playing ? stopPlay() : play())

// ---------------- image import, clear ----------------
$('import').onclick = () => $('importFile').click()
$<HTMLInputElement>('importFile').onchange = async () => {
  const file = $<HTMLInputElement>('importFile').files?.[0]
  if (!file) return
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  doc.checkpoint()
  const c = doc.ctx()
  const W = doc.frame.paint.width, H = doc.frame.paint.height
  // fit inside the grid, keep the picture's shape (a paint pixel is not square on screen)
  const pxW = cellW / SX, pxH = lineH / SY
  const k = Math.min(W * pxW / img.width, H * pxH / img.height)
  const w = (img.width * k) / pxW, h = (img.height * k) / pxH
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#000'
  c.fillRect(0, 0, W, H)
  c.filter = ui.invert ? 'grayscale(1) invert(1)' : 'grayscale(1)'
  c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
  c.filter = 'none'
  URL.revokeObjectURL(img.src)
  $<HTMLInputElement>('importFile').value = ''
  changed()
}
$('clear').onclick = () => {
  doc.checkpoint()
  const c = doc.ctx()
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#000'
  c.fillRect(0, 0, doc.frame.paint.width, doc.frame.paint.height)
  doc.frame.letters.clear()
  changed()
}

// ---------------- export / save / open ----------------
function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const fileBase = () => doc.name.trim().replace(/[^a-zA-Z0-9-_]+/g, '-') || 'ascii'
const allLines = () => doc.frames.map(toLines)

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(toLines(doc.frame).join('\n'))
    $('copy').textContent = 'copied'
  } catch {
    $('copy').textContent = 'copy failed'
  }
  setTimeout(() => ($('copy').textContent = 'copy text'), 1200)
}
$('exportTxt').onclick = () => download(`${fileBase()}.txt`, exportTxt(doc.name, allLines()), 'text/plain')
$('exportTs').onclick = () => download(`${fileBase()}.ts`, exportTs(doc.name, doc.cols, doc.rows, doc.fps, allLines()), 'text/plain')
$('save').onclick = () => download(`${fileBase()}.ascii.json`, JSON.stringify(doc.toProject()), 'application/json')
$('open').onclick = () => $('openFile').click()
$<HTMLInputElement>('openFile').onchange = async () => {
  const file = $<HTMLInputElement>('openFile').files?.[0]
  if (!file) return
  try {
    await doc.loadProject(JSON.parse(await file.text()) as Project)
  } catch {
    alert('This file is not an ASCII editor project.')
  }
  $<HTMLInputElement>('openFile').value = ''
}
$('new').onclick = () => {
  if (!confirm('Start a new drawing? (Save the project first if you want to keep this one.)')) return
  void doc.loadProject({ version: 1, name: 'untitled', cols: 60, rows: 30, fps: 8, look: doc.look, frames: [] })
}

// ---------------- keyboard ----------------
addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') {
    if (e.key === 'Escape') t.blur()
    return
  }
  const k = e.key.toLowerCase()
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doc.undo() }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doc.redo() }
    return
  }
  const tools: Record<string, Tool> = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', t: 'letter' }
  if (tools[k]) setTool(tools[k])
  else if (k === '[' || k === ']') {
    ui.size = Math.max(0.2, Math.min(12, ui.size * (k === ']' ? 1.25 : 0.8)))
    $<HTMLInputElement>('size').value = String(ui.size)
    syncInputs()
    requestRender()
  } else if (k === ',') doc.select(doc.current - 1)
  else if (k === '.') doc.select(doc.current + 1)
  else if (k === ' ') {
    e.preventDefault()
    if (ui.playing) stopPlay()
    else play()
  } else return
})

// for testing from the console / automation
;(window as unknown as { __editor: object }).__editor = { doc, ui, toLines, setTool }

// ---------------- start ----------------
document.fonts.load(`${BASE}px 'JetBrains Mono'`).finally(async () => {
  try {
    const saved = localStorage.getItem(SAVE_KEY)
    if (saved) await doc.loadProject(JSON.parse(saved) as Project)
  } catch {
    // no saved drawing (or blocked storage): start empty
  }
  setTool('brush')
  syncInputs()
  layout()
})
