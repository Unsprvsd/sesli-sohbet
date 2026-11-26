// TUNING — shared by every ASCII scene and the studio page (ascii-studio.html).
//
// Each scene keeps its settings in one object (e.g. PLASMA, GLOW, seagull SETTINGS)
// and reads it every frame, so the studio can change values live.
// When you press "Final" in the studio, the chosen values are written to
// src/ascii/final.json. At start, applyFinal() puts them over the defaults
// in the code -> final.json WINS over the numbers written in the .ts files.

import FINAL from './final.json'

/** One control in the studio. `key` = path in the settings object, e.g. "render.size". */
export type Knob = { key: string; label: string; hint?: string } & (
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'pair'; min: number; max: number; step: number } // [from, to] range
  | { kind: 'color' }
  | { kind: 'text' }
  | { kind: 'bool' }
  | { kind: 'choice'; options: Record<string, string | number> } // label -> value
)

type Obj = Record<string, unknown>

export function getPath(o: Obj, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v as Obj)?.[k], o)
}

export function setPath(o: Obj, path: string, value: unknown) {
  const keys = path.split('.')
  const last = keys.pop()!
  const parent = keys.reduce<Obj>((v, k) => v[k] as Obj, o)
  if (parent && last in parent) parent[last] = value
}

/** Put the saved final values of scene `id` over its settings object. */
export function applyFinal(settings: object, id: string) {
  const saved = (FINAL as Record<string, Record<string, unknown>>)[id]
  if (!saved) return
  for (const [path, v] of Object.entries(saved)) setPath(settings as Obj, path, structuredClone(v))
}

/** The saved final values of a scene (for the studio's "reset"). */
export function finalOf(id: string): Record<string, unknown> {
  return structuredClone((FINAL as Record<string, Record<string, unknown>>)[id] ?? {})
}
