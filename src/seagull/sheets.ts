// SEAGULL ANIMATION SHEETS — how the gull moves.
// Change numbers here; the server screen and the lab page (seagull-lab.html) use this object.
//
// Each action has a pose(t) with t = 0..1 through one cycle (one wing beat / one turn).

export type Pose = {
  a1: number // inner wing angle (up +)
  a2: number // extra bend at the wrist (hand up + / down -)
  fold: number // hand length 0..1 (folds on the upstroke / in a dive)
  pitch: number // nose up + / down -
  roll: number // bank
  lift: number // body up/down
  turn?: number // 0..1 progress of a turn
}

export type ActionKey = 'level' | 'climb' | 'glide' | 'down' | 'dive' | 'turn'

export type Sheet = {
  name: string
  note: string
  flaps: boolean // true = wing beats (speed follows SETTINGS.flight.flapHz)
  hz: number // cycles per second (x flapHz when flapping)
  pose: (t: number) => Pose
}

const TAU = Math.PI * 2
const smooth = (t: number) => t * t * (3 - 2 * t)

export const SHEETS: Record<ActionKey, Sheet> = {
  level: {
    name: 'Level flap',
    note: 'Normal wing beat, flying straight. The hand follows the inner wing (whip) and folds on the upstroke.',
    flaps: true,
    hz: 1,
    pose: (t) => {
      const ph = t * TAU
      return {
        a1: 0.15 + 0.8 * Math.sin(ph),
        a2: 0.45 * Math.sin(ph - 1),
        fold: 0.84 - 0.15 * Math.cos(ph),
        pitch: 0.03 * Math.sin(ph),
        roll: 0,
        lift: -0.9 * Math.cos(ph),
      }
    },
  },
  climb: {
    name: 'Climb',
    note: 'Nose up, a bit faster and bigger strokes, slight wobble - working to go up.',
    flaps: true,
    hz: 1.3,
    pose: (t) => {
      const ph = t * TAU
      return {
        a1: 0.22 + 0.9 * Math.sin(ph),
        a2: 0.52 * Math.sin(ph - 1.05),
        fold: 0.78 - 0.2 * Math.cos(ph),
        pitch: 0.35 + 0.05 * Math.sin(ph),
        roll: 0.03 * Math.sin(ph * 0.5 + 0.4),
        lift: -1.2 * Math.cos(ph),
      }
    },
  },
  glide: {
    name: 'Glide',
    note: 'Wings still in the gull shape (inner wing up, hand down), gentle sway.',
    flaps: false,
    hz: 0.35,
    pose: (t) => ({
      a1: 0.18,
      a2: -0.22,
      fold: 1,
      pitch: -0.05 + 0.02 * Math.sin(t * TAU),
      roll: 0.05 * Math.sin(t * TAU),
      lift: 0.15 * Math.sin(t * TAU),
    }),
  },
  down: {
    name: 'Glide down',
    note: 'Nose down, wings still and slightly swept back. On a swoop it mixes into Dive where the curve is steep.',
    flaps: false,
    hz: 0.35,
    pose: (t) => ({
      a1: 0.1,
      a2: -0.32,
      fold: 0.9,
      pitch: -0.3 + 0.02 * Math.sin(t * TAU),
      roll: 0.04 * Math.sin(t * TAU),
      lift: 0,
    }),
  },
  dive: {
    name: 'Dive',
    note: 'Wings half folded and swept back, steep and fast.',
    flaps: false,
    hz: 0.5,
    pose: (t) => ({
      a1: 0.3 + 0.04 * Math.sin(t * TAU),
      a2: -0.65,
      fold: 0.55,
      pitch: -0.7,
      roll: 0.03 * Math.sin(t * TAU),
      lift: 0,
    }),
  },
  turn: {
    name: 'Turn',
    note: 'Banks into the turn and swings around (right <-> left). Not used on the server screen (gulls only cross).',
    flaps: false,
    hz: 0.7,
    pose: (t) => ({
      a1: 0.2,
      a2: -0.25,
      fold: 0.95,
      pitch: 0.05,
      roll: -0.65 * Math.sin(Math.PI * t),
      lift: 0,
      turn: smooth(t),
    }),
  },
}
