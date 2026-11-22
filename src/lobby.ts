import { useCallback, useEffect, useRef, useState } from 'react'
import { joinRoom, type UserState } from 'trystero'
import { APP_ID } from './config'

// What every user shares with everyone else.
export type Presence = {
  name: string
  voiceRoom: string | null
  muted: boolean
  deafened: boolean
  speaking: boolean
}

const initialPresence = (name: string): Presence => ({
  name,
  voiceRoom: null,
  muted: false,
  deafened: false,
  speaking: false,
})

export type OnlineUser = Presence & { id: string; self: boolean }

export type LobbyStatus = 'connecting' | 'online'

/**
 * Joins the shared "lobby" room. Everyone who has the same password
 * ends up here and can see each other's presence.
 */
export function useLobby(name: string, password: string) {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [status, setStatus] = useState<LobbyStatus>('connecting')
  const [warning, setWarning] = useState<string | null>(null)
  const presenceRef = useRef<UserState<Presence> | null>(null)
  const refreshRef = useRef<() => void>(() => {})

  useEffect(() => {
    // identity: 'none' → a fresh identity per tab, so two tabs = two users.
    const room = joinRoom({ appId: APP_ID, password, identity: 'none' }, 'lobby')
    const presence = room.makeUserState<Presence>('presence', initialPresence(name))
    presenceRef.current = presence

    let selfId = ''

    const refresh = () => {
      const online = new Set(Object.keys(room.getUsers()))
      const all = presence.getAll()
      const list: OnlineUser[] = []

      for (const [id, p] of Object.entries(all)) {
        if (id === selfId || !online.has(id) || !p?.name) continue
        list.push({ ...p, id, self: false })
      }
      if (selfId) list.push({ ...presence.get(), id: selfId, self: true })

      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      setUsers(list)
    }
    refreshRef.current = refresh

    const offs = [
      presence.onChange(refresh),
      room.onUserJoin(refresh),
      room.onUserLeave(refresh),
      room.onError((e) => {
        if (e.code === 'decrypt-failed') {
          setWarning('Farklı şifreli biri bağlanmaya çalıştı. Herkes aynı şifreyi mi kullanıyor?')
        } else if (e.code === 'relay-failed') {
          setWarning('Sinyal ağına bağlanılamadı. İnternet bağlantını kontrol et.')
        }
      }),
    ]

    room.getSelf().then((self) => {
      selfId = self.userId
      refresh()
    })

    room.ready.then(() => {
      setStatus('online')
      // Announce myself, keeping any changes made while connecting.
      presence.set((prev) => ({ ...initialPresence(name), ...prev, name })).then(refresh)
    })

    return () => {
      offs.forEach((off) => off())
      presenceRef.current = null
      room.leave()
    }
  }, [name, password])

  // Change part of my own presence (e.g. which voice room I'm in).
  const updatePresence = useCallback(async (patch: Partial<Presence>) => {
    const presence = presenceRef.current
    if (!presence) return
    await presence.set((prev) => ({ ...prev, ...patch }))
    refreshRef.current()
  }, [])

  return { users, status, warning, updatePresence }
}
