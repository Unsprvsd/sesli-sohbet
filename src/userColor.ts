// Every user gets a soft colour tint (red, blue, green or pink).
// It is picked from the username, so everyone sees the same colour for the
// same person without sending anything. The colours are in style.css
// (.tint-red etc.); they are almost white, to keep the clean design.

const TINTS = ['red', 'blue', 'green', 'pink'] as const

/** CSS class with the colour of this username, e.g. "tint-blue". */
export function tintClass(name: string): string {
  const key = name.trim().toLocaleLowerCase('tr')
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return `tint-${TINTS[Math.abs(h) % TINTS.length]}`
}
