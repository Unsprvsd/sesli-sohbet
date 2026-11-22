// Unique name for our app on the public signaling network.
// Everyone must use the same value to find each other.
export const APP_ID = 'sesli-sohbet-p2p-7f3k9q2x'

// Fixed list of voice rooms.
export const VOICE_ROOMS = [
  { id: 'genel', name: 'Genel' },
  { id: 'oyun', name: 'Oyun' },
  { id: 'muzik', name: 'Müzik' },
] as const

// Fixed list of text channels (separate from voice rooms).
export const TEXT_CHANNELS = [
  { id: 'txt-genel', name: 'genel' },
  { id: 'txt-oyun', name: 'oyun' },
  { id: 'txt-linkler', name: 'linkler' },
] as const
