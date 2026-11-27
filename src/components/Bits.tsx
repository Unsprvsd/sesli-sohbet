// Small shared visual pieces of the "clean lines" design.

/** App logo, figlet font "Calvin S". */
export const LOGO_SMALL = String.raw`╦  ╦╔═╗╦╔═╗╔═╗  ╔═╗╦ ╦╔═╗╔╦╗
╚╗╔╝║ ║║║  ║╣   ║  ╠═╣╠═╣ ║
 ╚╝ ╚═╝╩╚═╝╚═╝  ╚═╝╩ ╩╩ ╩ ╩`

/** Small white crown for the server admin. */
export function Crown() {
  return (
    <svg className="crown" viewBox="0 0 10 8" role="img" aria-label="admin">
      <title>Admin</title>
      <path d="M1 7.5V2l2.5 2.5L5 .5l1.5 4L9 2v5.5z" />
    </svg>
  )
}

/** Small speaker icon for voice rooms (white, takes the text colour). */
export function Speaker() {
  return (
    <svg className="speaker" viewBox="0 0 13 11" aria-hidden="true">
      <path d="M1 3.5h2.5L7 .8v9.4L3.5 7.5H1z" stroke="none" />
      <path d="M9 3.3a3 3 0 0 1 0 4.4M10.8 1.6a5.5 5.5 0 0 1 0 7.8" fill="none" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** Small X (same size as the speaker), shown in red to leave a room. */
export function LeaveX() {
  return (
    <svg className="leave-x" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** 4 vertical volume bars; they move (CSS animation) while `on`. */
export function Meter({ on }: { on: boolean }) {
  return (
    <span className={`meter ${on ? 'on' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** One bird silhouette, head on the left, wing up, tail on the right (about 18 x 8.5). */
const BIRD = 'M0 5L2 3.6C3.5 3 5 3.4 6 4L12 0L9.5 5C12 5 15 4.8 18 3.5L16 6.5C12 8 6 8.5 3 7Z'

/** Shop: seagull flock. A circle with three filled birds (from the user's sketch). */
export function Birds() {
  return (
    <svg className="birds" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" className="birds-ring" />
      <path d={BIRD} transform="translate(7 11)" />
      <path d={BIRD} transform="translate(21 21) rotate(-30) scale(0.85)" />
      <path d={BIRD} transform="translate(6 30) rotate(-25) scale(0.8)" />
    </svg>
  )
}
