import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLobby } from '../lobby'
import {
  MAX_CHANNEL_NAME,
  MAX_CHANNELS,
  cleanName,
  loadAdminKey,
  newId,
  signConfig,
  signText,
  verifyText,
  type Channel,
  type ServerConfig,
} from '../server'
import { useSameDeviceTabs } from '../sameDevice'
import AsciiStream from './AsciiStream'
import AsciiSeagulls from './AsciiSeagulls'
import AsciiSpider from './AsciiSpider'
import AsciiButterfly from './AsciiButterfly'
import { keyLabel, useSetting } from '../settings'
import {
  DEFAULT_SCREEN_QUALITY,
  SCREEN_QUALITIES,
  applyScreenQuality,
  canShareScreen,
  findScreenQuality,
  startScreenShare,
  useVoice,
} from '../voice'
import { Crown, LOGO_SMALL, Speaker, LeaveX } from './Bits'
import Chat from './Chat'
import ScreenView from './ScreenView'
import Settings from './Settings'
import UserName from './UserName'
import RoomMembers from './RoomMembers'
import Shop from './Shop'

type Props = {
  name: string
  serverName: string
  srv: string
  password: string
  onLogout: () => void
  /** Leave with an error shown on the login screen. */
  onFail: (message: string) => void
}

// Voice watchdog: wait this long before rejoining, doubling each try.
const RETRY_BASE_MS = 15_000
const MAX_RETRIES = 3
// Give up looking for an unknown server after this long.
const FIND_TIMEOUT_MS = 45_000
// How long the join log stays visible after the server is found.
const ENTER_DELAY_MS = 900
// Points shop: "shut" closes someone's mic for a minute.
const SHUT_COST = 10
const SHUT_MS = 60_000
// Points shop: a flock of seagulls that only flies over everyone's screen.
const FLOCK_COST = 3

/** 61_000 ms -> "1:01" */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A "shut" notice (bottom right): who is shut, who paid, until when. */
type ShutNotice = { uid: string; name: string; by: string[]; until: number }

// Shown in the middle when I'm not in a voice room.
const IDLE_ART = String.raw`  ___________
 |  _______  |
 | |       | |
 | |_______| |
 |___________|`

export default function Lobby({ name, serverName, srv, password, onLogout, onFail }: Props) {
  // --- connection / reconnect -------------------------------------------
  const [online, setOnline] = useState(() => navigator.onLine)
  const [lobbyEpoch, setLobbyEpoch] = useState(0)
  const [voiceEpoch, setVoiceEpoch] = useState(0)

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      setLobbyEpoch((e) => e + 1) // rejoin lobby (voice follows, new selfId)
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const {
    users: rawUsers,
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
  } = useLobby(name, password, srv, lobbyEpoch)

  // --- seagull game -------------------------------------------------------
  // My score is kept in this browser (per server) and shared via presence.
  const scoreKey = `sesli-sohbet:gulls:${srv}`
  const [gullScore, setGullScore] = useState(() => {
    try {
      return Math.max(0, Math.floor(Number(localStorage.getItem(scoreKey)) || 0))
    } catch {
      return 0
    }
  })
  useEffect(() => {
    updatePresence({ score: gullScore })
  }, [gullScore, updatePresence])
  // The "leader" (smallest user id online) spawns gulls and decides catches.
  const gullLeader = useMemo(() => rawUsers.map((u) => u.id).sort()[0] ?? '', [rawUsers])
  const nameOf = useCallback((uid: string) => rawUsers.find((u) => u.id === uid)?.name ?? '', [rawUsers])
  const addScore = useCallback(
    (delta: number) =>
      setGullScore((s) => {
        const next = Math.max(0, s + delta)
        try {
          localStorage.setItem(scoreKey, String(next))
        } catch {
          /* storage blocked: score lives only in this tab */
        }
        return next
      }),
    [scoreKey],
  )
  const onGullCaught = useCallback(
    (uid: string) => {
      if (uid === selfId) addScore(1)
    },
    [selfId, addScore],
  )

  // --- points shop: shut ------------------------------------------------
  // Someone pays SHUT_COST points -> lobby message 'shut' -> the target's own app
  // turns their mic off for SHUT_MS (a second shut adds another minute). Everyone
  // sees a notice with a countdown. Kept in localStorage, so reloading doesn't help.
  const shutKey = `sesli-sohbet:shut:${srv}`
  const [shutUntil, setShutUntil] = useState(() => {
    try {
      const v = Number(localStorage.getItem(shutKey)) || 0
      return v > Date.now() ? v : 0
    } catch {
      return 0
    }
  })
  const [notices, setNotices] = useState<ShutNotice[]>([])
  const [now, setNow] = useState(() => Date.now())
  const shutActive = shutUntil > now
  const ticking = shutActive || notices.length > 0
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [ticking])
  // drop finished notices
  useEffect(() => {
    if (notices.some((n) => n.until <= now)) setNotices((list) => list.filter((n) => n.until > now))
  }, [now, notices])

  const seenShuts = useRef(new Set<string>())
  const applyShut = useCallback(
    (id: string, uid: string, byUid: string) => {
      if (seenShuts.current.has(id)) return
      const target = nameOf(uid)
      if (!target) return // not on this server (or already gone)
      seenShuts.current.add(id)
      const by = byUid === selfId ? 'you' : nameOf(byUid) || '?'
      const t = Date.now()
      setNow(t)
      setNotices((list) => {
        const old = list.find((n) => n.uid === uid)
        const until = Math.max(old?.until ?? 0, t) + SHUT_MS
        const names = old?.by ?? []
        const next: ShutNotice = { uid, name: target, by: names.includes(by) ? names : [...names, by], until }
        return [...list.filter((n) => n.uid !== uid), next]
      })
      if (uid === selfId) {
        setShutUntil((prev) => {
          const until = Math.max(prev, t) + SHUT_MS
          try {
            localStorage.setItem(shutKey, String(until))
          } catch {
            /* storage blocked */
          }
          return until
        })
      }
    },
    [nameOf, selfId, shutKey],
  )
  useEffect(
    () =>
      onGull((msg, from) => {
        if (msg.t === 'shut') applyShut(msg.id, msg.uid, from)
      }),
    [onGull, applyShut],
  )
  // --- points shop: seagull flock ----------------------------------------
  // I pay FLOCK_COST -> 'flock' message (id + seed) to everyone + play it here too.
  const releaseFlockRef = useRef<((id: string, seed: number) => void) | null>(null)
  const buyFlock = () => {
    if (gullScore < FLOCK_COST) return
    const id = 'f' + Math.random().toString(36).slice(2, 10)
    const seed = Math.floor(Math.random() * 4294967296)
    addScore(-FLOCK_COST)
    sendGull({ t: 'flock', id, seed })
    releaseFlockRef.current?.(id, seed)
  }

  const shutSomeone = (uid: string) => {
    if (gullScore < SHUT_COST || !uid || uid === selfId) return
    const id = 'x' + Math.random().toString(36).slice(2, 10)
    addScore(-SHUT_COST)
    sendGull({ t: 'shut', id, uid })
    applyShut(id, uid, selfId)
  }

  const voiceRooms = config?.voice ?? []
  const textChannels = config?.text ?? []

  // --- admin --------------------------------------------------------------
  // The private key exists only in the browser that created the server.
  const [adminKey, setAdminKey] = useState<CryptoKey | null>(null)
  useEffect(() => {
    let alive = true
    loadAdminKey(srv).then((k) => alive && setAdminKey(k))
    return () => {
      alive = false
    }
  }, [srv])
  const isAdmin = !!adminKey && !!config

  // Prove to others that I'm the admin: sign my lobby user id.
  useEffect(() => {
    if (!adminKey || !selfId) return
    signText(adminKey, selfId).then((adminSig) => updatePresence({ adminSig }))
  }, [adminKey, selfId, updatePresence])

  // Check other people's admin proofs (results cached).
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set())
  const checkedRef = useRef(new Map<string, boolean>())
  useEffect(() => {
    if (!config) return
    let alive = true
    const check = async () => {
      const ids = new Set<string>()
      for (const u of rawUsers) {
        if (!u.adminSig) continue
        const k = `${config.adminKey}|${u.id}|${u.adminSig}`
        let ok = checkedRef.current.get(k)
        if (ok === undefined) {
          ok = await verifyText(config.adminKey, u.id, u.adminSig)
          checkedRef.current.set(k, ok)
        }
        if (ok) ids.add(u.id)
      }
      if (alive) {
        setAdminIds((prev) =>
          prev.size === ids.size && [...ids].every((id) => prev.has(id)) ? prev : ids,
        )
      }
    }
    check()
    return () => {
      alive = false
    }
  }, [rawUsers, config])

  const users = useMemo(
    () => rawUsers.map((u) => (adminIds.has(u.id) ? { ...u, admin: true } : u)),
    [rawUsers, adminIds],
  )

  const editConfig = async (change: (c: ServerConfig) => ServerConfig) => {
    if (!adminKey || !config) return
    const next = { ...change(config), ts: Math.max(Date.now(), config.ts + 1) }
    await publishConfig(await signConfig(adminKey, next))
  }

  const askName = (title: string, current = '') => {
    const v = window.prompt(title, current)
    return v === null ? '' : cleanName(v, MAX_CHANNEL_NAME)
  }

  const addChannel = (kind: 'voice' | 'text') => {
    const list = kind === 'voice' ? voiceRooms : textChannels
    if (list.length >= MAX_CHANNELS) return alert(`You can have at most ${MAX_CHANNELS}.`)
    const n = askName(kind === 'voice' ? 'New voice room name:' : 'New text channel name:')
    if (!n) return
    editConfig((c) => ({ ...c, [kind]: [...c[kind], { id: newId(), name: n }] }))
  }

  const renameChannel = (kind: 'voice' | 'text', ch: Channel) => {
    const n = askName('New name:', ch.name)
    if (!n || n === ch.name) return
    editConfig((c) => ({
      ...c,
      [kind]: c[kind].map((x) => (x.id === ch.id ? { ...x, name: n } : x)),
    }))
  }

  const deleteChannel = (kind: 'voice' | 'text', ch: Channel) => {
    const list = kind === 'voice' ? voiceRooms : textChannels
    if (list.length <= 1) return alert('At least one must stay.')
    const what = kind === 'voice' ? 'voice room' : 'text channel'
    if (!window.confirm(`Delete ${what} "${ch.name}"?`)) return
    editConfig((c) => ({ ...c, [kind]: c[kind].filter((x) => x.id !== ch.id) }))
  }

  const adminButtons = (kind: 'voice' | 'text', ch: Channel) =>
    isAdmin && (
      <span className="admin-actions">
        <button onClick={() => renameChannel(kind, ch)} title="Rename">
          edit
        </button>
        <button onClick={() => deleteChannel(kind, ch)} title="Delete">
          del
        </button>
      </span>
    )

  // --- my state ---------------------------------------------------------
  const [myRoom, setMyRoom] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // --- settings remembered in this browser ------------------------------
  const [deviceId, setDeviceId] = useSetting('micDeviceId', '')
  const [pttEnabled, setPttEnabled] = useSetting('pttEnabled', false)
  const [pttKey, setPttKey] = useSetting('pttKey', 'KeyV')
  // Text chat is a drawer at the bottom; open or closed is remembered.
  const [chatOpen, setChatOpen] = useSetting('chatOpen', false)
  const [volumeByName, setVolumeByName] = useSetting<Record<string, number>>('volumes', {})

  // --- push-to-talk -----------------------------------------------------
  const [pttDown, setPttDown] = useState(false)

  useEffect(() => {
    if (!pttEnabled) {
      setPttDown(false)
      return
    }
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === pttKey && !e.repeat && !typing(e)) setPttDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === pttKey) setPttDown(false)
    }
    const release = () => setPttDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
  }, [pttEnabled, pttKey])

  // Deafened also means mic off (like Discord). Shut (points shop) too.
  const micMuted = muted || deafened || shutActive
  const transmit = !micMuted && (!pttEnabled || pttDown)

  // --- voice ------------------------------------------------------------
  const volumesById = useMemo(() => {
    const out: Record<string, number> = {}
    for (const u of users) {
      const v = volumeByName[u.name]
      if (v !== undefined) out[u.id] = v / 100
    }
    return out
  }, [users, volumeByName])

  const onSpeaking = useCallback(
    (speaking: boolean) => updatePresence({ speaking }),
    [updatePresence],
  )

  // --- screen sharing ---------------------------------------------------
  const [screen, setScreen] = useState<MediaStream | null>(null)
  // Shared screens: small window bottom-right (true) or big in the middle.
  const [previewMini, setPreviewMini] = useState(true) // my own screen, while I share
  const [watchMini, setWatchMini] = useState(false) // a screen I watch
  const [qualityId, setQualityId] = useSetting('screenQuality', DEFAULT_SCREEN_QUALITY)
  const quality = findScreenQuality(qualityId)
  /** What the browser really sends, e.g. "1280×720 · 30 fps". */
  const [sending, setSending] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [watchUid, setWatchUid] = useState<string | null>(null)

  const stopShare = useCallback(() => {
    setScreen((s) => {
      s?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  const toggleShare = async () => {
    if (screen) return stopShare()
    setShareError(null)
    try {
      const s = await startScreenShare(quality)
      const video = s.getVideoTracks()[0]
      if (video) {
        // The browser's own "Stop sharing" bar ends the track.
        video.addEventListener('ended', stopShare)
      }
      setScreen(s)
    } catch (e) {
      // NotAllowedError = user pressed Cancel; that's not an error to show.
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) {
        setShareError('Could not start screen sharing.')
      }
    }
  }

  // Apply the chosen quality when sharing starts and whenever it changes.
  useEffect(() => {
    if (!screen) {
      setSending('')
      return
    }
    let alive = true
    applyScreenQuality(screen, quality).then((r) => {
      if (alive && r) setSending(`${r.width}×${r.height} · ${r.fps} fps`)
    })
    return () => {
      alive = false
    }
  }, [screen, quality])

  // Leaving the voice room ends my share and my watching.
  useEffect(() => {
    if (!myRoom) {
      stopShare()
      setWatchUid(null)
    }
  }, [myRoom, stopShare])

  // Stop sharing when this screen closes (logout).
  const screenRef = useRef(screen)
  screenRef.current = screen
  useEffect(() => () => screenRef.current?.getTracks().forEach((t) => t.stop()), [])

  // Stop watching if that person stopped sharing or left my room.
  const watched = users.find((u) => u.id === watchUid)
  useEffect(() => {
    if (watchUid && (!watched || !watched.sharing || watched.voiceRoom !== myRoom)) {
      setWatchUid(null)
    }
  }, [watchUid, watched, myRoom])

  const voice = useVoice({
    screen,
    watchUid,
    roomId: myRoom ? `${srv}-${myRoom}` : null,
    password,
    selfId,
    transmit,
    deafened,
    volumes: volumesById,
    deviceId,
    epoch: voiceEpoch,
    onSpeaking,
  })

  // Share my room / mute / deafen state with everyone.
  useEffect(() => {
    updatePresence({ voiceRoom: myRoom, muted: micMuted, deafened, sharing: !!screen })
  }, [myRoom, micMuted, deafened, screen, updatePresence])

  // The admin deleted my voice room → leave it.
  useEffect(() => {
    if (myRoom && config && !config.voice.some((r) => r.id === myRoom)) setMyRoom(null)
  }, [myRoom, config])

  // If the mic fails, leave the room again.
  useEffect(() => {
    if (voice.error) setMyRoom(null)
  }, [voice.error])

  // Watchdog: someone is in my room but we have no voice link → rejoin.
  const expectedPeers = myRoom
    ? users.filter((u) => !u.self && u.voiceRoom === myRoom).length
    : 0
  const retriesRef = useRef(0)
  useEffect(() => {
    retriesRef.current = 0
  }, [myRoom])
  useEffect(() => {
    if (!myRoom || !voice.ready) return
    if (voice.peerCount >= expectedPeers) {
      retriesRef.current = 0
      return
    }
    if (retriesRef.current >= MAX_RETRIES) return
    const delay = RETRY_BASE_MS * 2 ** retriesRef.current
    const timer = setTimeout(() => {
      retriesRef.current += 1
      setVoiceEpoch((e) => e + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [myRoom, voice.ready, voice.peerCount, expectedPeers])

  // --- render -----------------------------------------------------------
  const roomName = voiceRooms.find((r) => r.id === myRoom)?.name ?? ''
  const roomMembers = users.filter((u) => u.voiceRoom === myRoom)

  // --- text channels ----------------------------------------------------
  const [savedChannel, setChannel] = useSetting<string>(`textChannel:${srv}`, '')
  const channel: Channel | null =
    textChannels.find((c) => c.id === savedChannel) ?? textChannels[0] ?? null
  const channelId = channel?.id ?? ''
  const channelMessages = useMemo(
    () => messages.filter((m) => m.room === channelId),
    [messages, channelId],
  )

  // Unread counter: messages newer than when I last looked at the channel.
  // Starts at login time, so history received on joining is not "unread".
  const [loginTime] = useState(() => Date.now())
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  // The channel I'm looking at is always "seen".
  useEffect(() => {
    if (channelId && chatOpen) setLastSeen((prev) => ({ ...prev, [channelId]: Date.now() }))
  }, [channelId, chatOpen, channelMessages.length])
  const unread = useMemo(() => {
    const out: Record<string, number> = {}
    for (const m of messages) {
      if (m.name !== name && m.ts > (lastSeen[m.room] ?? loginTime)) {
        out[m.room] = (out[m.room] ?? 0) + 1
      }
    }
    return out
  }, [messages, lastSeen, name, loginTime])
  const someoneMissing = !!myRoom && voice.ready && voice.peerCount < expectedPeers
  const sameDeviceTab = useSameDeviceTabs(myRoom ? `${srv}-${myRoom}` : null)

  // --- server not found -------------------------------------------------
  // Without our own server, a server "exists" only if this browser already
  // knows it or someone online sends us its channel list.
  useEffect(() => {
    if (config) return
    if (decryptFailed) {
      onFail('Wrong password for this server.')
      return
    }
    const timer = setTimeout(
      () =>
        onFail(
          'Server not found. Check the name and password. Someone from the server must be online.',
        ),
      FIND_TIMEOUT_MS,
    )
    return () => clearTimeout(timer)
  }, [config, decryptFailed, onFail])

  // Keep the join log on screen a moment after the server is found.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!config || entered) return
    const timer = setTimeout(() => setEntered(true), ENTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [config, entered])

  if (!entered) {
    const peers = users.filter((u) => !u.self).length
    const lines: [string, string | null][] = [
      ['connecting to relays', status === 'online' ? 'ok' : null],
      ['room key', `${srv.slice(0, 4)}·${srv.slice(4, 8)}`],
      ['encrypting handshake', 'ok'],
      ['looking for peers', config || peers ? `${peers} found` : null],
    ]
    if (config) {
      lines.push(['admin signature', 'valid'])
      lines.push(['channels', `${config.voice.length} voice · ${config.text.length} text`])
    }
    return (
      <div className="center">
        <div className="joinlog">
          <pre className="logo small" aria-label="Voice Chat">
            {LOGO_SMALL}
          </pre>
          <div className="joinlog-server">{config?.name ?? serverName}</div>
          <div className="log">
            {lines.map(([label, result], i) => (
              <div key={label} style={{ animationDelay: `${i * 90}ms` }}>
                {result === null ? (
                  <>
                    {label} <span className="spin" />
                  </>
                ) : (
                  <>
                    <span className="ok">{label}</span> · <span className="k">{result}</span>
                  </>
                )}
              </div>
            ))}
            {config && (
              <div className="welcome" style={{ animationDelay: `${lines.length * 90}ms` }}>
                welcome, {name}.
              </div>
            )}
          </div>
          {!config && (
            <button className="btn ghost" onClick={onLogout}>
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }
  if (!config) return null

  const roomOf = (id: string | null) => voiceRooms.find((r) => r.id === id)?.name

  // My own screen while I share (always muted: no echo). Starts as a small window.
  const previewView = screen && (
    <ScreenView
      key="preview"
      title="Your screen"
      stream={screen}
      muted
      volume={0}
      mini={previewMini}
      onToggleMini={() => setPreviewMini((m) => !m)}
    />
  )
  // Someone else's screen that I watch. Starts big; can be made small.
  const watchView = watchUid && watched && (
    <ScreenView
      key="watch"
      title={`${watched.name} is sharing their screen`}
      stream={voice.screens[watchUid] ?? null}
      muted={deafened}
      volume={volumesById[watchUid] ?? 1}
      mini={watchMini}
      onToggleMini={() => setWatchMini((m) => !m)}
      onClose={() => setWatchUid(null)}
    />
  )

  return (
    <div className="layout">
      <AsciiStream />
      <AsciiSeagulls
        selfId={selfId}
        isLeader={!!selfId && gullLeader === selfId}
        sendGull={sendGull}
        onGull={onGull}
        nameOf={nameOf}
        onCaught={onGullCaught}
        releaseRef={releaseFlockRef}
      />
      <AsciiSpider
        selfId={selfId}
        isLeader={!!selfId && gullLeader === selfId}
        sendGull={sendGull}
        onGull={onGull}
        nameOf={nameOf}
        onCaught={onGullCaught}
      />
      <AsciiButterfly
        selfId={selfId}
        isLeader={!!selfId && gullLeader === selfId}
        sendGull={sendGull}
        onGull={onGull}
        nameOf={nameOf}
        onCaught={onGullCaught}
      />
      <aside className="sidebar">
        <div className="server-name">
          <span>{config.name}</span>
          {isAdmin && <small title="You are the admin of this server">admin</small>}
        </div>
        <div className="status-line">
          <span className={`dot ${online ? status : 'offline'}`} />
          {!online ? 'no internet' : status === 'online' ? 'connected' : 'connecting…'}
        </div>

        <h2 className="section">
          Voice
          {isAdmin && (
            <button className="add" onClick={() => addChannel('voice')} title="Add voice room">
              +
            </button>
          )}
        </h2>
        {voiceRooms.map((room) => {
          const members = users.filter((u) => u.voiceRoom === room.id)
          const inside = myRoom === room.id
          return (
            <div key={room.id} className={`room ${inside ? 'active' : ''}`}>
              <div className="row">
                {inside ? (
                  // I'm in this room: the speaker icon is a leave button (red X on hover).
                  <div className="room-name">
                    <span className="label">
                      <button
                        className="room-leave"
                        onClick={() => setMyRoom(null)}
                        title="Leave room"
                        aria-label={`Leave ${room.name}`}
                      >
                        <Speaker />
                        <LeaveX />
                      </button>
                      {room.name}
                    </span>
                    {members.length > 0 && <span className="count">{members.length}</span>}
                  </div>
                ) : (
                  <button
                    className="room-name"
                    onClick={() => setMyRoom(room.id)}
                    title="Join room"
                  >
                    <span className="label">
                      <Speaker />
                      {room.name}
                    </span>
                    {members.length > 0 && <span className="count">{members.length}</span>}
                  </button>
                )}
                {adminButtons('voice', room)}
              </div>
              <RoomMembers
                members={members}
                inside={inside}
                volumes={volumeByName}
                onVolume={(n, v) => setVolumeByName((prev) => ({ ...prev, [n]: v }))}
                watchUid={watchUid}
                onWatch={setWatchUid}
                shutCost={SHUT_COST}
                myPoints={gullScore}
                onShut={shutSomeone}
              />
            </div>
          )
        })}

        <h2 className="section">
          Text
          {isAdmin && (
            <button className="add" onClick={() => addChannel('text')} title="Add text channel">
              +
            </button>
          )}
        </h2>
        {textChannels.map((c) => {
          const active = c.id === channelId
          const count = active && chatOpen ? 0 : (unread[c.id] ?? 0)
          return (
            <div key={c.id} className="row">
              <button
                className={`channel ${active ? 'active' : ''} ${count ? 'unread' : ''}`}
                onClick={() => {
                  setChannel(c.id)
                  setChatOpen(true)
                }}
              >
                <span># {c.name}</span>
                {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
              </button>
              {adminButtons('text', c)}
            </div>
          )
        })}

        <div className="sidebar-foot">
          <div className="me-row">
            <span className="me">{name}</span>
            {myRoom && (
              <small className={voice.ready ? '' : 'wait'}>
                {voice.ready ? roomName : 'voice connecting…'}
              </small>
            )}
          </div>
          <div className="controls">
            <button
              className={`ctl ${micMuted ? 'off' : ''}`}
              onClick={() => setMuted((m) => !m)}
              disabled={deafened || shutActive}
              title={
                shutActive ? 'Someone spent points to shut your mic' : micMuted ? 'Unmute' : 'Mute'
              }
            >
              {shutActive ? `Shut ${clock(shutUntil - now)}` : micMuted ? 'Muted' : 'Mic'}
            </button>
            <button
              className={`ctl ${deafened ? 'off' : ''}`}
              onClick={() => setDeafened((d) => !d)}
              title={deafened ? 'Undeafen' : 'Deafen (hear nobody)'}
            >
              {deafened ? 'Deaf' : 'Sound'}
            </button>
            {myRoom && canShareScreen() && (
              <button
                className={`ctl ${screen ? 'off' : ''}`}
                onClick={toggleShare}
                title={screen ? 'Stop sharing' : 'Share your screen'}
              >
                Screen
              </button>
            )}
            <button className="ctl" onClick={() => setShowSettings(true)} title="Settings">
              Settings
            </button>
            {myRoom && (
              <button className="ctl" onClick={() => setMyRoom(null)} title="Leave room">
                Leave
              </button>
            )}
          </div>
          {myRoom && voice.ready && (
            <small className="muted">connected to {voice.peerCount}</small>
          )}
          {pttEnabled && myRoom && (
            <button
              className="ptt-button"
              onPointerDown={() => setPttDown(true)}
              onPointerUp={() => setPttDown(false)}
              onPointerLeave={() => setPttDown(false)}
              onPointerCancel={() => setPttDown(false)}
              onContextMenu={(e) => e.preventDefault()}
            >
              Hold to talk
            </button>
          )}
          {pttEnabled && myRoom && (
            <small className={`ptt-state ${transmit ? 'on' : ''}`}>
              {micMuted
                ? 'push-to-talk: mic is muted'
                : transmit
                  ? 'talking…'
                  : `hold ${keyLabel(pttKey)} to talk`}
            </small>
          )}
          <button className="link danger" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <div className="stage">
          {!online && (
            <div className="warning">
              Internet connection lost. It will reconnect automatically when it is back.
            </div>
          )}
          {warning && <div className="warning">{warning}</div>}
          {voice.error && <div className="warning">{voice.error}</div>}
          {sameDeviceTab && !deafened && (
            <div className="warning">
              Another tab on this PC is in the same room. With speakers this causes ringing
              (feedback): use headphones, or press Sound in one tab to turn its sound off.
            </div>
          )}
          {someoneMissing && (
            <div className="warning">
              Could not connect voice to everyone in the room. Retrying automatically…
            </div>
          )}

          {shareError && <div className="warning">{shareError}</div>}

          {screen && (
            <div className="sharing-bar">
              <span>
                <span className="tag live">LIVE</span> You are sharing your screen
                {sending && <small className="muted"> · {sending}</small>}
              </span>
              <label className="quality">
                <span>Quality</span>
                <select value={quality.id} onChange={(e) => setQualityId(e.target.value)}>
                  {SCREEN_QUALITIES.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn ghost" onClick={stopShare}>
                Stop
              </button>
            </div>
          )}

          {/* big screen views (the small ones are in .mini-dock below) */}
          {previewView && !previewMini && previewView}
          {watchView && !watchMini && watchView}

          {!myRoom && !watchUid && (
            <div className="idle">
              <pre>{IDLE_ART}</pre>
              <p>Join a voice room on the left, or open a text channel.</p>
            </div>
          )}
        </div>

        {channel && (
          <section className={`drawer ${chatOpen ? 'open' : ''}`}>
            <button
              className="drawer-bar"
              onClick={() => setChatOpen((o) => !o)}
              aria-expanded={chatOpen}
              title={chatOpen ? 'Close chat' : 'Open chat'}
            >
              <span className="drawer-title">
                # {channel.name}
                {chatOpen && channelMessages.length > 0 && (
                  <small>
                    {channelMessages.length}{' '}
                    {channelMessages.length === 1 ? 'message' : 'messages'}
                  </small>
                )}
                {!chatOpen && (unread[channel.id] ?? 0) > 0 && (
                  <span className="badge">{unread[channel.id]}</span>
                )}
              </span>
              <span className="arrow" aria-hidden="true">
                {chatOpen ? '▼' : '▲'}
              </span>
            </button>
            {chatOpen && (
              <Chat
                roomName={channel.name}
                messages={channelMessages}
                myName={name}
                prompt={isAdmin ? '#' : '$'}
                onSend={(text) => sendChat(channel.id, text)}
              />
            )}
          </section>
        )}
      </main>

      <aside className="people">
        <h2>Online · {users.length}</h2>
        <ul className="online">
          {users.map((u) => (
            <li key={u.id}>
              {u.admin ? <Crown /> : <span className="dot online" />}
              <UserName user={u} hideYou />
              {typeof u.score === 'number' && Number.isFinite(u.score) && u.score > 0 && (
                <span className="score" title="Points: seagulls, spiders and butterflies caught">
                  ~v~ {Math.min(99999, Math.floor(u.score))}
                </span>
              )}
            </li>
          ))}
        </ul>
        <Shop points={gullScore} flockCost={FLOCK_COST} shutCost={SHUT_COST} onFlock={buyFlock} />
      </aside>

      {/* bottom-right: "shut" notices, then small screen windows (stacked) */}
      {((previewView && previewMini) || (watchView && watchMini) || notices.length > 0) && (
        <div className="mini-dock">
          {notices.map((n) => (
            <div key={n.uid} className="toast" role="status">
              <div className="toast-head">
                <span>
                  <b>{n.uid === selfId ? 'you' : n.name}</b> {n.uid === selfId ? 'are' : 'is'} muted
                </span>
                <span className="toast-timer">{clock(n.until - now)}</span>
              </div>
              <small>
                shut by {n.by.join(', ')} · ~v~ {SHUT_COST}
              </small>
            </div>
          ))}
          {watchView && watchMini && watchView}
          {previewView && previewMini && previewView}
        </div>
      )}

      {showSettings && (
        <Settings
          deviceId={deviceId}
          onDeviceId={setDeviceId}
          pttEnabled={pttEnabled}
          onPttEnabled={setPttEnabled}
          pttKey={pttKey}
          onPttKey={setPttKey}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
