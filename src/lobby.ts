import { useCallback, useEffect, useRef, useState } from 'react'
import { joinRoom, type MessageAction, type UserState } from 'trystero'
import { APP_ID } from './config'

// What every user shares with everyone else.
export type Presence = {
  name: string
  voiceRoom: string | null
  muted: boolean
  deafened: boolean
  speaking: boolean
  sharing: boolean
}

export type OnlineUser = Presence & { id: string; self: boolean }

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
 */
export function useLobby(name: string, password: string, epoch: number) {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [status, setStatus] = useState<LobbyStatus>('connecting')
  const [warning, setWarning] = useState<string | null>(null)
  const [selfId, setSelfId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const presenceRef = useRef<UserState<Presence> | null>(null)
  const chatRef = useRef<MessageAction<ChatMessage[]> | null>(null)
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

  useEffect(() => {
    setStatus('connecting')
    setWarning(null)

    // identity: 'none' → a fresh identity per tab, so two tabs = two users.
    const room = joinRoom({ appId: APP_ID, password, identity: 'none' }, 'lobby')
    const presence = room.makeUserState<Presence>('presence', {
      ...lastPresenceRef.current,
      name,
    })
    const chat = room.makeAction<ChatMessage[]>('chat')
    presenceRef.current = presence
    chatRef.current = chat

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
        const history = messagesRef.current.slice(-HISTORY_SENT_TO_NEWCOMERS)
        if (history.length) chat.send(history, { target: peerId }).catch(() => {})
      }),
      chat.onMessage((data) => {
        if (Array.isArray(data)) addMessages(data)
      }),
      room.onError((e) => {
        if (e.code === 'decrypt-failed') {
          setWarning('Farklı şifreli biri bağlanmaya çalıştı. Herkes aynı şifreyi mi kullanıyor?')
        } else if (e.code === 'relay-failed') {
          setWarning('Sinyal ağına bağlanılamadı. İnternet bağlantını kontrol et.')
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
      room.leave()
    }
  }, [name, password, epoch, addMessages])

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

  return { users, status, warning, selfId, messages, updatePresence, sendChat }
}
