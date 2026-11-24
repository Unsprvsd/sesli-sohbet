// ASCII seagull — everything in one folder:
//   shape.ts    SHAPE     how the gull looks
//   sheets.ts   SHEETS    animation sheets (how it moves)
//   settings.ts SETTINGS  flight, spawning, catching, size, colour
//   engine.ts             moves and draws (normally untouched)
// Lab page (localhost only): http://localhost:5180/seagull-lab.html

export { SHAPE } from './shape'
export { SHEETS, type ActionKey, type Pose, type Sheet } from './sheets'
export { SETTINGS, type ScreenSize } from './settings'
export { SeagullFlock, drawGull, toAscii, mixPose, seededRandom, type Gull, type Wave } from './engine'
