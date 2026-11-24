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
