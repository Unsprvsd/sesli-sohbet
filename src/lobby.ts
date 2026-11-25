import { useCallback, useEffect, useRef, useState } from 'react'
import { joinRoom, type MessageAction, type UserState } from 'trystero'
import { APP_ID } from './config'
import {
  loadCachedConfigFor,
  savePasswordTag,
  saveCachedConfig,
  verifyConfig,
  type ServerConfig,
  type SignedConfig,
} from './server'

// What every user shares with everyone else.
export type Presence = {
  name: string
  voiceRoom: string | null
  muted: boolean
  deafened: boolean
  speaking: boolean
  sharing: boolean
  /** Admin proof: signature of my lobby user id ('' if not admin). */
  adminSig: string
  /** Seagulls caught on this server (self-reported, like `speaking`). */
  score?: number
}

/**
 * Seagull game messages (lobby action 'gull'):
 * spawn  - the leader sends a new gull (everyone simulates it from the seed)
 * hit    - someone clicked the gull (sent to everyone; the leader decides)
 * caught - the leader's decision: who caught it, and where
 */
export type GullMsg =
  | { t: 'spawn'; id: string; seed: number }
  | { t: 'hit'; id: string; x: number; y: number }
  | { t: 'caught'; id: string; uid: string; x: number; y: number }

export type GullListener = (msg: GullMsg, fromUserId: string) => void

function isGullMsg(m: unknown): m is GullMsg {
  if (!m || typeof m !== 'object') return false
  const x = m as Record<string, unknown>
  if (typeof x.id !== 'string' || x.id.length > 16) return false
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  if (x.t === 'spawn') return num(x.seed)
  if (x.t === 'hit') return num(x.x) && num(x.y)
  if (x.t === 'caught') return typeof x.uid === 'string' && x.uid.length <= 128 && num(x.x) && num(x.y)
  return false
}

export type OnlineUser = Presence & { id: string; self: boolean; admin?: boolean }

export type LobbyStatus = 'connecting' | 'online'

export type ChatMessage = {
  id: string
  room: string
  from: string
  name: string
  text: string
  ts: number
}

export const MAX_MESSAGE_LENGTH = 500
const MAX_PER_ROOM = 200
const HISTORY_SENT_TO_NEWCOMERS = 100

const initialPresence = (name: string): Presence => ({
  name,
  voiceRoom: null,
  muted: false,
  deafened: false,
  speaking: false,
  sharing: false,
  adminSig: '',
  score: 0,
})

function isValidMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false
  const x = m as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    x.id.length <= 64 &&
    typeof x.room === 'string' &&
    typeof x.from === 'string' &&
    typeof x.name === 'string' &&
    x.name.length <= 24 &&
    typeof x.text === 'string' &&
    x.text.length > 0 &&
    x.text.length <= MAX_MESSAGE_LENGTH &&
    typeof x.ts === 'number'
  )
}

/** Keeps only the newest MAX_PER_ROOM messages of each room. */
function capPerRoom(sorted: ChatMessage[]): ChatMessage[] {
  const counts = new Map<string, number>()
  const kept: ChatMessage[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]
    const c = counts.get(m.room) ?? 0
    if (c < MAX_PER_ROOM) {
      kept.push(m)
      counts.set(m.room, c + 1)
    }
  }
  return kept.reverse()
}

/**
 * Joins the shared "lobby" room. Everyone who has the same password
 * ends up here and can see each other's presence and chat messages.
 * Changing `epoch` leaves and joins again (used for reconnecting).
 * `srv` is the server key: each server has its own lobby room.
 */
export function useLobby(name: string, password: string, srv: string, epoch: number) {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [status, setStatus] = useState<LobbyStatus>('connecting')
  const [warning, setWarning] = useState<string | null>(null)
  // Someone here could not read our messages → probably a different password.
  const [decryptFailed, setDecryptFailed] = useState(false)
  const [selfId, setSelfId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const signedRef = useRef<SignedConfig | null>(null)

  const presenceRef = useRef<UserState<Presence> | null>(null)
  const chatRef = useRef<MessageAction<ChatMessage[]> | null>(null)
  const configActionRef = useRef<MessageAction<SignedConfig> | null>(null)
  const gullActionRef = useRef<MessageAction<GullMsg> | null>(null)
  const gullListenersRef = useRef(new Set<GullListener>())
  const refreshRef = useRef<() => void>(() => {})
  const messagesRef = useRef<ChatMessage[]>([])
  // Survives reconnects, so my state is restored after rejoining.
  const lastPresenceRef = useRef<Presence>(initialPresence(name))

  const addMessages = useCallback((incoming: unknown[]) => {
    const known = new Set(messagesRef.current.map((m) => m.id))
    const fresh: ChatMessage[] = []
    for (const m of incoming) {
      if (isValidMessage(m) && !known.has(m.id)) {
        fresh.push(m)
        known.add(m.id)
      }
    }
    if (!fresh.length) return
    const next = capPerRoom([...messagesRef.current, ...fresh].sort((a, b) => a.ts - b.ts))
    messagesRef.current = next
    setMessages(next)
  }, [])

  /** Accepts a signed config if it is valid and newer than mine. */
  const acceptConfig = useCallback(
    async (signed: unknown): Promise<boolean> => {
      const before = signedRef.current
      const next = await verifyConfig(signed, before ? JSON.parse(before.body).adminKey : null)
      if (!next) return false
      // Check again: another config may have arrived while verifying.
      const current = signedRef.current
      if (current) {
        const cur = JSON.parse(current.body) as ServerConfig
        if (cur.adminKey !== next.adminKey || cur.ts >= next.ts) return false
      }
      signedRef.current = signed as SignedConfig
      saveCachedConfig(srv, signed as SignedConfig)
      // It came through the password-encrypted room (or our own saved copy),
      // so this password is the right one for this server.
      savePasswordTag(srv, password)
      setConfig(next)
      return true
    },
    [srv, password],
  )

  // Load the config this browser already knows for this server,
  // but only with the same password as before.
  useEffect(() => {
    let stop = false
    signedRef.current = null
    setConfig(null)
    loadCachedConfigFor(srv, password).then((cached) => {
      if (cached && !stop) acceptConfig(cached)
    })
    return () => {
      stop = true
    }
  }, [srv, password, acceptConfig])

  useEffect(() => {
    setStatus('connecting')
    setWarning(null)

    // identity: 'none' → a fresh identity per tab, so two tabs = two users.
    const room = joinRoom({ appId: APP_ID, password, identity: 'none' }, `s-${srv}-lobby`)
    const presence = room.makeUserState<Presence>('presence', {
      ...lastPresenceRef.current,
      name,
    })
    const chat = room.makeAction<ChatMessage[]>('chat')
    const configAction = room.makeAction<SignedConfig>('config')
    const gullAction = room.makeAction<GullMsg>('gull')
    presenceRef.current = presence
    chatRef.current = chat
    configActionRef.current = configAction
    gullActionRef.current = gullAction

    let selfUserId = ''

    const refresh = () => {
      const online = new Set(Object.keys(room.getUsers()))
      const all = presence.getAll()
      const list: OnlineUser[] = []

      for (const [id, p] of Object.entries(all)) {
        if (id === selfUserId || !online.has(id) || !p?.name) continue
        list.push({ ...p, id, self: false })
      }
      if (selfUserId) list.push({ ...presence.get(), id: selfUserId, self: true })

      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      setUsers(list)
    }
    refreshRef.current = refresh

    const offs = [
      presence.onChange(refresh),
      room.onUserJoin(refresh),
      room.onUserLeave(refresh),
      // Give newcomers the recent chat history.
      room.onPeerJoin(({ peerId }) => {
        // Give newcomers the newest channel list I know.
        if (signedRef.current) configAction.send(signedRef.current, { target: peerId }).catch(() => {})
        const history = messagesRef.current.slice(-HISTORY_SENT_TO_NEWCOMERS)
        if (history.length) chat.send(history, { target: peerId }).catch(() => {})
      }),
      configAction.onMessage((data) => {
        acceptConfig(data)
      }),
      chat.onMessage((data) => {
        if (Array.isArray(data)) addMessages(data)
      }),
      gullAction.onMessage((data, ctx) => {
        if (!isGullMsg(data)) return
        for (const fn of gullListenersRef.current) fn(data, ctx.userId)
      }),
      room.onError((e) => {
        if (e.code === 'decrypt-failed') {
          setDecryptFailed(true)
          setWarning('Someone on this server uses a different password. Check your password.')
        } else if (e.code === 'relay-failed') {
          setWarning('Could not reach the signaling network. Check your internet connection.')
        }
      }),
    ]

    room.getSelf().then((self) => {
      selfUserId = self.userId
      setSelfId(self.userId)
      refresh()
    })

    room.ready.then(() => {
      setStatus('online')
      // Announce myself, keeping any changes made while connecting.
      presence
        .set((prev) => ({ ...lastPresenceRef.current, ...prev, name }))
        .then(refresh)
    })

    return () => {
      offs.forEach((off) => off())
      presenceRef.current = null
      chatRef.current = null
      configActionRef.current = null
      gullActionRef.current = null
      room.leave()
    }
  }, [name, password, srv, epoch, addMessages, acceptConfig])

  /** Admin only: share a new signed config with everyone. */
  const publishConfig = useCallback(
    async (signed: SignedConfig) => {
      if (await acceptConfig(signed)) configActionRef.current?.send(signed).catch(() => {})
    },
    [acceptConfig],
  )

  // Change part of my own presence (e.g. which voice room I'm in).
  const updatePresence = useCallback(async (patch: Partial<Presence>) => {
    lastPresenceRef.current = { ...lastPresenceRef.current, ...patch }
    const presence = presenceRef.current
    if (!presence) return
    await presence.set((prev) => ({ ...prev, ...patch }))
    refreshRef.current()
  }, [])

  const sendChat = useCallback(
    (room: string, text: string) => {
      const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (!clean || !selfId) return
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        room,
        from: selfId,
        name,
        text: clean,
        ts: Date.now(),
      }
      addMessages([msg])
      chatRef.current?.send([msg]).catch(() => {})
    },
    [selfId, name, addMessages],
  )

  /** Seagull game: send a message to everyone in the lobby. */
  const sendGull = useCallback((msg: GullMsg) => {
    gullActionRef.current?.send(msg).catch(() => {})
  }, [])

  /** Seagull game: listen for messages from others. Returns "stop listening". */
  const onGull = useCallback((fn: GullListener) => {
    gullListenersRef.current.add(fn)
    return () => {
      gullListenersRef.current.delete(fn)
    }
  }, [])

  return {
    users,
    status,
    warning,
    decryptFailed,
    selfId,
    messages,
    config,
    updatePresence,
    sendChat,
    publishConfig,
    sendGull,
    onGull,
  }
}
