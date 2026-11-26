// ASCII EDITOR — the document: grid size, frames (paint layer + hand-placed
// letters), undo / redo, save / load, export.
//
// A frame has two parts:
//  - paint: a hidden canvas, cols*SX x rows*SY pixels, white ink on black.
//    The shape-matcher (src/ascii/shapeAscii.ts) turns it into letters.
//  - letters: letters you placed by hand. They win over the converted letter
//    of that cell (" " = force an empty cell).

export const SX = 6 // paint pixels per letter (x), must divide by 2
export const SY = 9 // paint pixels per letter (y), must divide by 3

export type Frame = {
  paint: HTMLCanvasElement
  letters: Map<number, string> // cell index (row * cols + col) -> letter
}

export type Look = {
  set: 'symbols' | 'mixed' | 'all' | 'custom'
  custom: string
  contrast: number
  minInk: number
}

export type Project = {
  version: 1
  name: string
  cols: number
  rows: number
  fps: number
  look: Look
  frames: { paint: string; letters: [number, string][] }[] // paint = PNG data URL
}

type Snapshot = { frame: number; paint: ImageData; letters: [number, string][] }

export class Doc {
  name = 'untitled'
  cols = 60
  rows = 30
  fps = 8
  look: Look = { set: 'symbols', custom: '', contrast: 1.8, minInk: 0.08 }
  frames: Frame[] = []
  current = 0
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  /** called after every change (redraw + autosave) */
  onChange: () => void = () => {}

  constructor() {
    this.frames.push(this.newFrame())
  }

  get frame() {
    return this.frames[this.current]
  }

  newFrame(): Frame {
    const paint = document.createElement('canvas')
    paint.width = this.cols * SX
    paint.height = this.rows * SY
    const c = paint.getContext('2d', { willReadFrequently: true })!
    c.fillStyle = '#000'
    c.fillRect(0, 0, paint.width, paint.height)
    return { paint, letters: new Map() }
  }

  ctx(f: Frame = this.frame) {
    return f.paint.getContext('2d', { willReadFrequently: true })!
  }

  // ---------- undo / redo (one snapshot of the current frame per action) ----------
  private snap(i = this.current): Snapshot {
    const f = this.frames[i]
    return { frame: i, paint: this.ctx(f).getImageData(0, 0, f.paint.width, f.paint.height), letters: [...f.letters] }
  }

  /** Call BEFORE changing the current frame. */
  checkpoint() {
    this.undoStack.push(this.snap())
    if (this.undoStack.length > 60) this.undoStack.shift()
    this.redoStack = []
  }

  /** Put snapshot s back; the state before it goes onto `to` (so it can be redone / undone). */
  private restore(s: Snapshot, to: Snapshot[]) {
    if (s.frame >= this.frames.length) return
    to.push(this.snap(s.frame))
    const f = this.frames[s.frame]
    this.ctx(f).putImageData(s.paint, 0, 0)
    f.letters = new Map(s.letters)
    this.current = s.frame
    this.onChange()
  }

  undo() {
    const s = this.undoStack.pop()
    if (s) this.restore(s, this.redoStack)
  }

  redo() {
    const s = this.redoStack.pop()
    if (s) this.restore(s, this.undoStack)
  }

  private clearHistory() {
    this.undoStack = []
    this.redoStack = []
  }

  // ---------- frames ----------
  addFrame(copy: boolean) {
    const f = this.newFrame()
    if (copy) {
      this.ctx(f).drawImage(this.frame.paint, 0, 0)
      f.letters = new Map(this.frame.letters)
    }
    this.frames.splice(this.current + 1, 0, f)
    this.current++
    this.clearHistory()
    this.onChange()
  }

  deleteFrame() {
    if (this.frames.length === 1) {
      this.checkpoint()
      const c = this.ctx()
      c.fillStyle = '#000'
      c.fillRect(0, 0, this.frame.paint.width, this.frame.paint.height)
      this.frame.letters.clear()
    } else {
      this.frames.splice(this.current, 1)
      this.current = Math.min(this.current, this.frames.length - 1)
      this.clearHistory()
    }
    this.onChange()
  }

  moveFrame(dir: -1 | 1) {
    const j = this.current + dir
    if (j < 0 || j >= this.frames.length) return
    ;[this.frames[this.current], this.frames[j]] = [this.frames[j], this.frames[this.current]]
    this.current = j
    this.clearHistory()
    this.onChange()
  }

  select(i: number) {
    this.current = Math.max(0, Math.min(this.frames.length - 1, i))
    this.onChange()
  }

  /** New grid size: paint is scaled, letters outside are dropped. */
  resize(cols: number, rows: number) {
    cols = Math.max(4, Math.min(300, Math.round(cols)))
    rows = Math.max(2, Math.min(200, Math.round(rows)))
    if (cols === this.cols && rows === this.rows) return
    const old = this.frames, oc = this.cols
    this.cols = cols
    this.rows = rows
    this.frames = old.map((f) => {
      const n = this.newFrame()
      this.ctx(n).drawImage(f.paint, 0, 0) // keep the top-left part, same pixel size
      for (const [i, ch] of f.letters) {
        const x = i % oc, y = Math.floor(i / oc)
        if (x < cols && y < rows) n.letters.set(y * cols + x, ch)
      }
      return n
    })
    this.clearHistory()
    this.onChange()
  }

  // ---------- save / load ----------
  toProject(): Project {
    return {
      version: 1, name: this.name, cols: this.cols, rows: this.rows, fps: this.fps, look: { ...this.look },
      frames: this.frames.map((f) => ({ paint: f.paint.toDataURL('image/png'), letters: [...f.letters] })),
    }
  }

  async loadProject(p: Project) {
    this.name = p.name || 'untitled'
    this.cols = p.cols
    this.rows = p.rows
    this.fps = p.fps || 8
    this.look = { ...this.look, ...p.look }
    const frames: Frame[] = []
    for (const pf of p.frames) {
      const f = this.newFrame()
      const img = new Image()
      img.src = pf.paint
      await img.decode()
      this.ctx(f).drawImage(img, 0, 0)
      f.letters = new Map(pf.letters)
      frames.push(f)
    }
    this.frames = frames.length ? frames : [this.newFrame()]
    this.current = 0
    this.clearHistory()
    this.onChange()
  }
}

// ---------- export ----------

/** Plain text: frames separated by a marker line. */
export function exportTxt(name: string, frames: string[][]) {
  if (frames.length === 1) return frames[0].join('\n') + '\n'
  return frames.map((f, i) => `-- ${name} frame ${i + 1}/${frames.length} --\n${f.join('\n')}`).join('\n') + '\n'
}

/** TypeScript data file the app can import (data apart from code). */
export function exportTs(name: string, cols: number, rows: number, fps: number, frames: string[][]) {
  const id = name.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[^a-zA-Z]+/, '') || 'art'
  const esc = (s: string) => JSON.stringify(s)
  const body = frames.map((f) => `    [\n${f.map((l) => `      ${esc(l)},`).join('\n')}\n    ],`).join('\n')
  return `// ASCII art "${name}" — made with the ASCII editor (ascii-editor.html).
// ${frames.length} frame(s), ${cols} x ${rows} letters, ${fps} fps.
export const ${id} = {
  cols: ${cols},
  rows: ${rows},
  fps: ${fps},
  frames: [
${body}
  ] as string[][],
}
`
}
