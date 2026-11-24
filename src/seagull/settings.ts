// SEAGULL SETTINGS — flight, spawning, catching and drawing.
// Change numbers here; the server screen and the lab page (seagull-lab.html) use this object.
// Positions are 0..1 of the screen (x = width, y = height, 0 = top).

import type { P2 } from './shape'

export type ScreenSize = { w: number; h: number } // px

export const SETTINGS = {
  flight: {
    flapHz: 1.2, // wing beats per second (level flight)
    move: { // target speed [forward, down] per second
      level: [0.07, 0] as P2,
      climb: [0.06, -0.05] as P2,
      glide: [0.075, 0.008] as P2,
    },
    steer: 1.6, // how fast the speed follows the target (higher = sharper curves)
    swoopDown: 0.17, // top speed along a glide-down curve (screen widths / s) (was 0.26)
    swoopDive: 0.22, // top speed along a dive curve (was 0.36)
    // ROUTE: when a gull appears, its entry point, waypoints and exit point are
    // fixed (from its seed, so everyone gets the same route). It dives / climbs
    // from waypoint to waypoint.
    route: {
      entryY: [0.1, 0.85] as P2, // height where the gull enters
      exitY: [0.1, 0.85] as P2, // height where it leaves on the other side
      waypoints: [2, 4] as P2, // how many points in between
      yRange: [0.12, 0.85] as P2, // waypoints stay in this height band
      step: [0.18, 0.45] as P2, // height change between waypoints (up and down alternate)
      jitterX: 0.05, // waypoints are not exactly evenly spaced
      flatTolerance: 0.06, // height difference that still counts as "level"
      climbRate: [0.03, 0.09] as P2, // climb speed limits (screen heights / s)
      maxSlope: 0.7, // never steeper than this (down / forward): the swoop is stretched sideways instead
      diveSlope: 0.5, // steeper than this -> dive (wings folded) instead of glide down
    },
    flaps: [2, 5] as P2, // wing beats before a glide
    glide: [0.8, 2] as P2, // seconds of gliding
    // Spawning is done by ONE user (the "leader") and sent to everyone,
    // so all users see the same gull at the same time.
    firstSpawn: [10, 10] as P2, // seconds until the first gull (after becoming leader) — TEST value, normal: [60, 180]
    spawnEvery: [180, 420] as P2, // seconds between gulls
    maxGulls: 1,
    step: 1 / 60, // fixed simulation step (same path on every computer)
    virtualScreen: { w: 1600, h: 900 } as ScreenSize, // speeds are computed for this size
  },

  catch: {
    hitRadius: 0.45, // part of the gull width that counts as a hit
    wave: {
      duration: 1.8, // seconds
      rings: 3,
      ringDelay: 0.18, // seconds between rings
      radius: 0.2, // final ring size, part of the screen width
      band: 14, // ring thickness in px
      color: '#8a8a8a',
    },
  },

  render: {
    ramp: ' .,:-=+*#%@', // letters from empty to full
    fontSize: 7,
    lineHeight: 1.15,
    color: '#5c5c5c', // faint, like the other background effects
    size: 0.079, // gull width as part of the screen width (0.14 -> 0.105 -> 0.079, -25% twice)
    viewYaw: [0.2, 0.6] as P2, // seen from the side .. three-quarter
    tilt: [0.15, 0.45] as P2, // camera a bit below
  },
}
