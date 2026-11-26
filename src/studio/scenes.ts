// STUDIO SCENES — every ASCII animation the studio can show and tune.
// To add a new animation: write it in src/ascii/scenes/<name>.ts (settings object
// + applyFinal + start function), then add an entry here with its knobs.

import type { Knob } from '../ascii/tune'
import { LETTER_SETS } from '../ascii/shapeAscii'
import { PLASMA, startPlasma } from '../ascii/scenes/plasma'
import { GLOW, startGlow } from '../ascii/scenes/glow'
import { SPIDER, startSpider } from '../ascii/scenes/spider'
import { SETTINGS as GULL, SeagullFlock, GullScreen } from '../seagull'

export type Mounted = { stop: () => void; actions?: Record<string, () => void> }

export type Scene = {
  id: string // key in src/ascii/final.json
  name: string
  where: string // where the app shows it
  note: string
  settings: object // live settings object (the studio changes it directly)
  knobs: Knob[]
  /** start the animation on `canvas`; `stage` = the virtual screen (for mock elements) */
  mount: (canvas: HTMLCanvasElement, stage: HTMLElement) => Mounted
}

const n = (key: string, label: string, min: number, max: number, step: number, hint?: string): Knob =>
  ({ key, label, kind: 'number', min, max, step, hint })
const pair = (key: string, label: string, min: number, max: number, step: number, hint?: string): Knob =>
  ({ key, label, kind: 'pair', min, max, step, hint })
const color = (key: string, label: string, hint?: string): Knob => ({ key, label, kind: 'color', hint })

export const SCENES: Scene[] = [
  {
    id: 'spider',
    name: 'spider (new)',
    where: 'not in the app yet — only here until you press Final and say where',
    note: 'Long-legged spider walking around. Knees bend up high; feet stay planted and step in two groups. Try "follow mouse".',
    settings: SPIDER,
    knobs: [
      n('legLength', 'leg length', 0.05, 0.5, 0.005, 'part of the screen height'),
      n('thigh', 'thigh / shin', 0.2, 0.8, 0.01, 'part of the leg that is the upper part'),
      n('reach', 'feet distance', 0.3, 0.95, 0.01, 'how far the feet stand from the body'),
      n('bodyHeight', 'body height', 0, 0.8, 0.01, 'body above the floor (part of leg length)'),
      n('tilt', '3D view', 0, 1.2, 0.01, '0 = straight from above'),
      pair('legSpread', 'leg angles (front – back)', 0, 180, 1, 'degrees from forward'),
      n('bodySize', 'body size', 0.004, 0.06, 0.001),
      n('headSize', 'head size', 0, 1, 0.01, 'part of the body size'),
      n('legWidth', 'leg thickness', 0.5, 6, 0.1),
      n('legInk', 'leg ink', 0.1, 1, 0.01, 'low = thin letters - / \\ , high = # @'),
      color('color', 'colour'),
      n('fontSize', 'letter size', 5, 20, 1, 'smaller = finer legs'),
      { key: 'letters', label: 'letter set', kind: 'choice', options: { symbols: LETTER_SETS.symbols, mixed: LETTER_SETS.mixed, all: LETTER_SETS.all } },
      n('contrast', 'edge contrast', 1, 4, 0.1),
      n('minInk', 'min ink', 0, 0.4, 0.01),
      n('speed', 'walk speed', 0, 0.3, 0.005, 'screen widths per second'),
      n('turn', 'turn speed', 0.2, 6, 0.1),
      n('stepAt', 'step distance', 0.05, 0.8, 0.01, 'foot steps when this far from its place'),
      n('stepTime', 'step time (s)', 0.05, 0.6, 0.01),
      n('stepLift', 'step height', 0, 0.5, 0.01),
      n('bob', 'body bob', 0, 0.2, 0.005),
      pair('pause', 'stand still (s)', 0, 10, 0.1),
      n('pauseChance', 'stand still chance', 0, 1, 0.05),
      { key: 'followMouse', label: 'follow mouse', kind: 'bool' },
    ],
    mount(canvas) {
      return { stop: startSpider(canvas) }
    },
  },
  {
    id: 'seagull',
    name: 'seagulls',
    where: 'server screen (behind everything), same gull for everyone, click = catch',
    note: 'Click a gull to test the catch wave. In the app a gull comes every few minutes; here one comes at once.',
    settings: GULL,
    knobs: [
      n('render.size', 'size', 0.02, 0.15, 0.001, 'gull width, part of the screen width'),
      color('render.color', 'colour', 'brighter = more visible'),
      n('render.fontSize', 'letter size', 4, 14, 1, 'smaller = more letters, more detail'),
      { key: 'render.letters', label: 'letters by', kind: 'choice', options: { shape: 'shape', brightness: 'ramp' } },
      { key: 'render.shape.chars', label: 'letter set', kind: 'choice', options: { symbols: LETTER_SETS.symbols, mixed: LETTER_SETS.mixed, all: LETTER_SETS.all } },
      n('render.shape.contrast', 'edge contrast', 1, 4, 0.1, '1 = off, higher = sharper edges'),
      n('render.shape.minInk', 'min ink', 0, 0.4, 0.01, 'less ink than this = empty letter'),
      n('flight.move.level.0', 'speed', 0.02, 0.2, 0.005, 'screen widths per second'),
      n('flight.flapHz', 'wing beats / s', 0.4, 3, 0.1),
      pair('flight.spawnEvery', 'time between gulls (s)', 10, 600, 5, 'app only'),
      pair('flight.firstSpawn', 'first gull after (s)', 5, 300, 5, 'app only'),
      n('catch.hitRadius', 'hit size', 0.2, 1, 0.05, 'part of the gull width that counts as a hit'),
      color('catch.wave.color', 'wave colour'),
      n('catch.wave.duration', 'wave time (s)', 0.5, 4, 0.1),
    ],
    mount(canvas) {
      const flock = new SeagullFlock()
      const screen = new GullScreen(canvas, flock)
      const ro = new ResizeObserver(() => screen.resize())
      ro.observe(canvas)
      let wait = 0.5, raf = 0, last = performance.now()
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop)
        const dt = Math.min(0.25, (now - last) / 1000)
        last = now
        if (!flock.gulls.length) {
          wait -= dt
          if (wait <= 0) {
            flock.spawnNew()
            wait = 1.5
          }
        }
        flock.update(dt)
        screen.draw()
      }
      const onDown = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect()
        const k = r.width / canvas.clientWidth
        const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k
        const g = flock.hitTest(x, y, { w: canvas.clientWidth, h: canvas.clientHeight })
        if (!g) return
        flock.remove(g.id)
        flock.addWave(g.x, g.y, '<you> +1')
      }
      canvas.addEventListener('pointerdown', onDown)
      raf = requestAnimationFrame(loop)
      return {
        stop: () => {
          cancelAnimationFrame(raf)
          ro.disconnect()
          canvas.removeEventListener('pointerdown', onDown)
        },
        actions: {
          'new gull': () => {
            flock.gulls = []
            flock.spawnNew()
          },
        },
      }
    },
  },
  {
    id: 'glow',
    name: 'glow lines',
    where: 'server screen (behind everything)',
    note: 'Invisible lines of letters; a glow runs along them and lights the letters.',
    settings: GLOW,
    knobs: [
      n('peak', 'brightness', 10, 255, 1, '0x48 = 72 now; 0x20 very faint, 0x70 clear'),
      n('curve', 'glow shape', 0.5, 4, 0.1, '1 = soft and wide, 2 = now, higher = sharp point'),
      pair('speed', 'speed (letters / s)', 1, 40, 0.5),
      pair('rise', 'front length', 1, 30, 1, 'letters in front of the brightest one'),
      pair('fade', 'tail length', 1, 80, 1, 'letters behind it'),
      n('maxGlows', 'max at once', 1, 20, 1),
      pair('spawn', 'time between glows (s)', 0.2, 15, 0.1),
      n('doubleChance', 'double rows', 0, 1, 0.05, 'part of the glows with two rows'),
      n('spacing', 'letter spacing', 1, 3, 0.05, '1 = normal text'),
      n('fontSize', 'letter size', 8, 24, 1),
      pair('yRange', 'height range', 0, 1, 0.01, '0 = top, 1 = bottom'),
      n('minGap', 'min distance', 0, 0.3, 0.01, 'between glows, part of the screen height'),
      { key: 'chars', label: 'letters', kind: 'text' },
    ],
    mount(canvas) {
      return { stop: startGlow(canvas) }
    },
  },
  {
    id: 'plasma',
    name: 'login waves',
    where: 'login screen (around the form)',
    note: 'Slow waves of letters. The box in the middle stands for the login form; move the mouse over the screen.',
    settings: PLASMA,
    knobs: [
      color('color', 'colour', 'lower = fainter'),
      n('speed', 'speed', 0, 4, 0.05, '1 = as before'),
      n('scale', 'wave size', 0.3, 4, 0.05, 'bigger = wider, calmer waves'),
      { key: 'ramp', label: 'letters (dark → bright)', kind: 'text' },
      n('fontSize', 'letter size', 8, 24, 1),
      n('lineHeight', 'line height (px)', 8, 32, 1),
      n('fps', 'frames / s', 5, 60, 1),
      n('mouseRadius', 'mouse glow size', 0, 30, 0.2, 'in letters'),
      n('mouseBoost', 'mouse glow strength', 0, 1.5, 0.05),
      n('clearMargin', 'gap around form (px)', 0, 200, 1),
      n('clearFade', 'fade around form (px)', 0, 600, 5),
      n('clearJitter', 'uneven edge', 0, 1, 0.05),
    ],
    mount(canvas, stage) {
      const form = document.createElement('div')
      form.className = 'mock-form'
      form.textContent = 'login form'
      stage.appendChild(form)
      const stop = startPlasma(canvas, { clearRect: () => form.getBoundingClientRect() })
      return { stop: () => { stop(); form.remove() } }
    },
  },
]
