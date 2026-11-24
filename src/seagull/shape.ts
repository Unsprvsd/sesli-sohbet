// SEAGULL SHAPE — how the gull looks.
// Change numbers here; the server screen and the lab page (seagull-lab.html) use this object.
//
// 3D "bird units": x = forward (head), y = up, z = to the right wing.

export type P2 = [number, number]
export type P3 = [number, number, number]

export const SHAPE = {
  // Wing outline seen from above: [x, s], s = distance from the body.
  // Leading edge root -> tip, then trailing edge tip -> root.
  // Broad inner wing, sharp bend at the wrist, long narrow pointed hand.
  wing: [
    [3, 0], [3.8, 4], [3.6, 8.5], [1.5, 13], [-1.5, 18], [-5.5, 23],
    [-4.6, 18.5], [-3.3, 14], [-2.7, 9], [-3.7, 4.5], [-4.3, 0],
  ] as P2[],
  wrist: 8.5, // distance where the hand starts (the bend)
  wingBack: -1.5, // wings sit a bit behind the head
  // Body = circles along the body line [x, y, radius]; narrows into the neck.
  body: [
    [-9, 0.3, 1.1], [-6.5, 0.2, 1.9], [-4, 0, 2.4], [-1, 0, 2.7], [2, 0.1, 2.7],
    [4.8, 0.4, 2.2], [6.8, 0.9, 1.5],
  ] as P3[],
  // Head + short beak as one slim wedge (flat crown, tiny hook at the tip).
  head: [
    [6.5, 2.2, 0], [8.5, 2.8, 0], [10.5, 2.9, 0], [12, 2.6, 0],
    [13.8, 2.1, 0], [15.4, 1.6, 0], [16.2, 1.3, 0], [16.1, 0.85, 0],
    [15.5, 1.0, 0], [13.8, 1.3, 0], [12, 1.35, 0],
    [10.5, 1.0, 0], [8.5, 0.3, 0], [6.5, -0.2, 0],
  ] as P3[],
  tail: [[-8, 0.3, -1.7], [-14.5, 0.2, -2.6], [-15, 0.2, 0], [-14.5, 0.2, 2.6], [-8, 0.3, 1.7]] as P3[],
  width: 50, // about the wingspan in bird units (used for sizing)
}
