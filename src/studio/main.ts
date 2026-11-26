// ASCII STUDIO (dev only): ascii-studio.html
// Watch every coded ASCII animation, tune it with the knobs, compare two
// versions (A / B) and press "Final" to save the shown version into
// src/ascii/final.json — the app then uses those values.

import { getPath, setPath, type Knob } from '../ascii/tune'
import { SCENES, type Mounted, type Scene } from './scenes'

type Values = Record<string, unknown>
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const SCENE_KEY = 'ascii-studio:scene'
const clone = <T>(v: T): T => structuredClone(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const snapshot = (s: Scene): Values => Object.fromEntries(s.knobs.map((k) => [k.key, clone(getPath(s.settings as Values, k.key))]))
const apply = (s: Scene, v: Values) => {
  for (const [key, val] of Object.entries(v)) setPath(s.settings as Values, key, clone(val))
}

// values at page load = the saved final values (code defaults + final.json)
const saved: Record<string, Values> = Object.fromEntries(SCENES.map((s) => [s.id, snapshot(s)]))
const slots: Record<string, { A: Values; B: Values }> = Object.fromEntries(
  SCENES.map((s) => [s.id, { A: snapshot(s), B: snapshot(s) }]),
)
let slot: 'A' | 'B' = 'A'
let scene = SCENES[0]
let mounted: Mounted | null = null

// ---------------- scene list ----------------
for (const s of SCENES) {
  const b = document.createElement('button')
  b.textContent = s.name
  b.dataset.id = s.id
  b.onclick = () => select(s)
  $('scenes').appendChild(b)
}

function select(s: Scene) {
  mounted?.stop()
  scene = s
  try {
    localStorage.setItem(SCENE_KEY, s.id)
  } catch {
    // storage blocked: fine, we just don't remember the scene
  }
  document.querySelectorAll<HTMLButtonElement>('#scenes button').forEach((b) => b.classList.toggle('on', b.dataset.id === s.id))
  $('sceneName').textContent = s.name
  $('where').textContent = `· ${s.where}`
  $('note').textContent = s.note
  apply(s, slots[s.id][slot])
  // fresh canvas + stage for every scene (no leftovers from the last one)
  const stage = $('stage')
  stage.innerHTML = ''
  const cv = document.createElement('canvas')
  stage.appendChild(cv)
  mounted = s.mount(cv, stage)
  const acts = $('actions')
  acts.innerHTML = ''
  for (const [label, run] of Object.entries(mounted.actions ?? {})) {
    const b = document.createElement('button')
    b.textContent = label
    b.onclick = run
    acts.appendChild(b)
  }
  buildKnobs()
  status('')
}

// ---------------- knobs ----------------
function fmt(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
  if (Array.isArray(v)) return v.map(fmt).join(' – ')
  if (typeof v === 'string') return v.length > 14 ? `${v.slice(0, 14)}…` : v
  return String(v)
}

function onValue(k: Knob, v: unknown, valEl: HTMLElement) {
  setPath(scene.settings as Values, k.key, v)
  slots[scene.id][slot][k.key] = clone(v)
  valEl.textContent = k.kind === 'choice' ? labelOf(k, v) : fmt(v)
  valEl.classList.toggle('changed', !same(v, saved[scene.id][k.key]))
}

function labelOf(k: Knob & { kind: 'choice' }, v: unknown) {
  return Object.entries(k.options).find(([, o]) => o === v)?.[0] ?? 'custom'
}

function range(min: number, max: number, step: number, value: number, onInput: (v: number) => void) {
  const r = document.createElement('input')
  r.type = 'range'
  r.min = String(min)
  r.max = String(max)
  r.step = String(step)
  r.value = String(value)
  r.oninput = () => onInput(+r.value)
  return r
}

function buildKnobs() {
  const box = $('knobs')
  box.innerHTML = ''
  for (const k of scene.knobs) {
    const cur = getPath(scene.settings as Values, k.key)
    const el = document.createElement('div')
    el.className = 'knob'
    const head = document.createElement('div')
    head.className = 'head'
    const name = document.createElement('span')
    name.textContent = k.label
    const val = document.createElement('span')
    val.className = 'val'
    head.append(name, val)
    el.appendChild(head)

    if (k.kind === 'number') {
      el.appendChild(range(k.min, k.max, k.step, cur as number, (v) => onValue(k, v, val)))
    } else if (k.kind === 'pair') {
      const v = [...(cur as [number, number])] as [number, number]
      const p = document.createElement('div')
      p.className = 'pair'
      const a = range(k.min, k.max, k.step, v[0], (x) => {
        v[0] = Math.min(x, v[1])
        a.value = String(v[0])
        onValue(k, [...v], val)
      })
      const b = range(k.min, k.max, k.step, v[1], (x) => {
        v[1] = Math.max(x, v[0])
        b.value = String(v[1])
        onValue(k, [...v], val)
      })
      p.append(a, b)
      el.appendChild(p)
    } else if (k.kind === 'color') {
      const c = document.createElement('input')
      c.type = 'color'
      c.value = String(cur)
      c.oninput = () => onValue(k, c.value, val)
      el.appendChild(c)
    } else if (k.kind === 'text') {
      const t = document.createElement('input')
      t.type = 'text'
      t.value = String(cur)
      t.oninput = () => onValue(k, t.value, val)
      el.appendChild(t)
    } else if (k.kind === 'bool') {
      const c = document.createElement('input')
      c.type = 'checkbox'
      c.checked = !!cur
      c.onchange = () => onValue(k, c.checked, val)
      el.appendChild(c)
    } else if (k.kind === 'choice') {
      const sel = document.createElement('select')
      for (const label of Object.keys(k.options)) sel.add(new Option(label, label))
      if (labelOf(k, cur) === 'custom') sel.add(new Option('custom', 'custom'))
      sel.value = labelOf(k, cur)
      sel.onchange = () => {
        if (sel.value in k.options) onValue(k, k.options[sel.value], val)
      }
      el.appendChild(sel)
    }
    if (k.hint) {
      const h = document.createElement('div')
      h.className = 'hint'
      h.textContent = k.hint
      el.appendChild(h)
    }
    // show the value + changed mark
    val.textContent = k.kind === 'choice' ? labelOf(k, cur) : fmt(cur)
    val.classList.toggle('changed', !same(cur, saved[scene.id][k.key]))
    box.appendChild(el)
  }
}

// ---------------- A / B ----------------
function setSlot(s: 'A' | 'B') {
  slot = s
  $('slotA').classList.toggle('on', s === 'A')
  $('slotB').classList.toggle('on', s === 'B')
  apply(scene, slots[scene.id][s])
  buildKnobs()
  status(`showing ${s}`)
}
$('slotA').onclick = () => setSlot('A')
$('slotB').onclick = () => setSlot('B')
$('copyAB').onclick = () => {
  const other = slot === 'A' ? 'B' : 'A'
  slots[scene.id][other] = clone(slots[scene.id][slot])
  status(`${slot} copied to ${other}`)
}

// ---------------- final / reset / copy ----------------
function status(t: string) {
  $('status').textContent = t
}
// "Are you sure?" popup: lists what changes (final → new). Nothing is saved
// before the user presses "yes" — moving the knobs only changes this preview.
function askConfirm(values: Values): Promise<boolean> {
  const changes = scene.knobs.filter((k) => !same(values[k.key], saved[scene.id][k.key]))
  const show = (k: Knob, v: unknown) => (k.kind === 'choice' ? labelOf(k, v) : fmt(v))
  $('confirmTitle').textContent = `Save "${scene.name}" version ${slot} as Final?`
  $('confirmText').textContent = changes.length
    ? `${changes.length} setting(s) change. The app will use these values.`
    : 'Nothing changed from the current final values.'
  const list = $('confirmList')
  list.innerHTML = ''
  list.hidden = !changes.length
  for (const k of changes) {
    const row = document.createElement('div')
    const name = document.createElement('span')
    name.textContent = k.label
    const val = document.createElement('span')
    const old = document.createElement('span')
    old.className = 'old'
    old.textContent = show(k, saved[scene.id][k.key])
    val.append(old, ` → ${show(k, values[k.key])}`)
    row.append(name, val)
    list.appendChild(row)
  }
  const box = $('confirm')
  box.hidden = false
  $('confirmNo').focus()
  return new Promise((done) => {
    const close = (ok: boolean) => {
      box.hidden = true
      removeEventListener('keydown', onKey)
      done(ok)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    addEventListener('keydown', onKey)
    $('confirmNo').onclick = () => close(false)
    $('confirmYes').onclick = () => close(true)
    box.onclick = (e) => {
      if (e.target === box) close(false) // click outside the box = cancel
    }
  })
}

$('final').onclick = async () => {
  const values = snapshot(scene)
  if (!(await askConfirm(values))) {
    status('not saved')
    return
  }
  try {
    const res = await fetch('/__studio/final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: scene.id, values }),
    })
    if (!res.ok) throw new Error(await res.text())
    saved[scene.id] = clone(values)
    buildKnobs()
    status(`Final saved (${slot}) → src/ascii/final.json · the app uses it now`)
  } catch (e) {
    status(`could not save: ${String(e)}`)
  }
}
$('reset').onclick = () => {
  slots[scene.id][slot] = clone(saved[scene.id])
  apply(scene, saved[scene.id])
  buildKnobs()
  status(`${slot} back to the final values`)
}
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(snapshot(scene), null, 2))
    status('values copied')
  } catch {
    status('copy failed')
  }
}

// ---------------- virtual screen ----------------
function layout() {
  const holder = $('holder')
  const hw = holder.clientWidth, hh = holder.clientHeight
  const choice = $<HTMLSelectElement>('screen').value
  let SW = hw, SH = hh, k = 1
  if (choice !== 'fit') {
    ;[SW, SH] = choice.split('x').map(Number)
    k = Math.min(hw / SW, hh / SH)
  }
  const frame = $('frame'), stage = $('stage')
  frame.style.width = `${SW * k}px`
  frame.style.height = `${SH * k}px`
  frame.style.left = `${(hw - SW * k) / 2}px`
  frame.style.top = `${(hh - SH * k) / 2}px`
  stage.style.width = `${SW}px`
  stage.style.height = `${SH}px`
  stage.style.transform = `scale(${k})`
}
$('screen').onchange = layout
new ResizeObserver(layout).observe($('holder'))

// ---------------- start ----------------
// for testing from the console / automation
;(window as unknown as { __studio: object }).__studio = { SCENES, saved, slots, select: (id: string) => select(SCENES.find((s) => s.id === id)!) }

document.fonts.load(`14px 'JetBrains Mono'`).finally(() => {
  layout()
  let id: string | null = null
  try {
    id = localStorage.getItem(SCENE_KEY)
  } catch {
    // storage blocked
  }
  select(SCENES.find((s) => s.id === id) ?? SCENES[0])
})
