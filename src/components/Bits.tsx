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
