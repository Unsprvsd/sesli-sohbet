// A "server" = a name + password chosen by its creator (the admin).
// There is no backend: the channel list ("config") lives in every member's
// browser and is passed around between peers. Only the admin can change it,
// because every config is signed with the admin's private key
// (ECDSA, Web Crypto). Members check the signature before accepting it.
//
// Trust on first use: the first config a browser sees for a server decides
// which admin key it trusts from then on.

export type Channel = { id: string; name: string }

export type ServerConfig = {
  name: string
  voice: Channel[]
  text: Channel[]
  /** Admin's public key (JWK as JSON string). */
  adminKey: string
  /** Version: time of the last change. Newer wins. */
  ts: number
}

/** body = JSON of ServerConfig, sig = base64 signature of body. */
export type SignedConfig = { body: string; sig: string }

export const MAX_CHANNELS = 20
export const MAX_CHANNEL_NAME = 24
export const MAX_SERVER_NAME = 32

const PREFIX = 'sesli-sohbet:'
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

// --- small helpers ----------------------------------------------------------

function toB64(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, value)
  } catch {
    /* storage blocked: ignore */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8)
}

export function cleanName(s: string, max: number): string {
  return s.trim().replace(/\s+/g, ' ').slice(0, max)
}

/** Short id for a server name, used in Trystero room ids and storage keys. */
export async function serverKey(serverName: string): Promise<string> {
  const norm = cleanName(serverName, MAX_SERVER_NAME).toLocaleLowerCase('tr')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm))
  return toB64(hash).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
}

// --- validation -------------------------------------------------------------

function isChannelList(x: unknown): x is Channel[] {
  return (
    Array.isArray(x) &&
    x.length >= 1 &&
    x.length <= MAX_CHANNELS &&
    x.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        c.id.length > 0 &&
        c.id.length <= 16 &&
        typeof c.name === 'string' &&
        c.name.length > 0 &&
        c.name.length <= MAX_CHANNEL_NAME,
    )
  )
}

function parseConfig(body: string): ServerConfig | null {
  try {
    const c = JSON.parse(body) as ServerConfig
    if (
      typeof c.name === 'string' &&
      typeof c.adminKey === 'string' &&
      typeof c.ts === 'number' &&
      isChannelList(c.voice) &&
      isChannelList(c.text)
    ) {
      return c
    }
  } catch {
    /* bad JSON */
  }
  return null
}

// --- signing / verifying ----------------------------------------------------

async function importPublic(adminKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', JSON.parse(adminKey), ALGO, false, ['verify'])
}

export async function verifyText(adminKey: string, text: string, sig: string): Promise<boolean> {
  try {
    const key = await importPublic(adminKey)
    return await crypto.subtle.verify(SIGN, key, fromB64(sig), new TextEncoder().encode(text))
  } catch {
    return false
  }
}

export async function signText(key: CryptoKey, text: string): Promise<string> {
  return toB64(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(text)))
}

/**
 * Checks a config received from a peer. Returns it if the signature is valid
 * and (when we already trust an admin key) it was signed by that same key.
 */
export async function verifyConfig(
  signed: unknown,
  trustedAdminKey: string | null,
): Promise<ServerConfig | null> {
  if (!signed || typeof signed !== 'object') return null
  const { body, sig } = signed as SignedConfig
  if (typeof body !== 'string' || typeof sig !== 'string' || body.length > 20_000) return null
  const config = parseConfig(body)
  if (!config) return null
  if (trustedAdminKey && config.adminKey !== trustedAdminKey) return null
  return (await verifyText(config.adminKey, body, sig)) ? config : null
}

export async function signConfig(key: CryptoKey, config: ServerConfig): Promise<SignedConfig> {
  const body = JSON.stringify(config)
  return { body, sig: await signText(key, body) }
}

// --- storage in this browser ------------------------------------------------

export function loadCachedConfig(key: string): SignedConfig | null {
  const raw = read(`server:${key}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SignedConfig
  } catch {
    return null
  }
}

export function saveCachedConfig(key: string, signed: SignedConfig) {
  store(`server:${key}`, JSON.stringify(signed))
}

/** The admin's private key, if this browser created the server. */
export async function loadAdminKey(key: string): Promise<CryptoKey | null> {
  const raw = read(`admin:${key}`)
  if (!raw) return null
  try {
    return await crypto.subtle.importKey('jwk', JSON.parse(raw), ALGO, false, ['sign'])
  } catch {
    return null
  }
}

/**
 * Creates a new server in this browser: makes the admin key pair and the
 * first config (1 voice room + 1 text channel). Returns false if this
 * browser already knows a server with that name (then just join it).
 */
export async function createServer(serverName: string): Promise<'created' | 'exists'> {
  const key = await serverKey(serverName)
  if (loadCachedConfig(key)) return 'exists'

  const pair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify'])
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey)

  const config: ServerConfig = {
    name: cleanName(serverName, MAX_SERVER_NAME),
    voice: [{ id: newId(), name: 'General' }],
    text: [{ id: newId(), name: 'general' }],
    adminKey: JSON.stringify(pub),
    ts: Date.now(),
  }
  store(`admin:${key}`, JSON.stringify(priv))
  saveCachedConfig(key, await signConfig(pair.privateKey, config))
  return 'created'
}
