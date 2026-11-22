import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TEXT_CHANNELS, VOICE_ROOMS } from '../config'
import { useLobby } from '../lobby'
import { useSameDeviceTabs } from '../sameDevice'
import { keyLabel, useSetting } from '../settings'
import { canShareScreen, startScreenShare, useVoice } from '../voice'
import Chat from './Chat'
import ScreenView from './ScreenView'
import Settings from './Settings'
import UserName from './UserName'
import VoicePanel from './VoicePanel'

type Props = {
  name: string
  password: string
  onLogout: () => void
}

// Voice watchdog: wait this long before rejoining, doubling each try.
const RETRY_BASE_MS = 15_000
const MAX_RETRIES = 3

export default function Lobby({ name, password, onLogout }: Props) {
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

  const { users, status, warning, selfId, messages, updatePresence, sendChat } = useLobby(
    name,
    password,
    lobbyEpoch,
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

  // Deafened also means mic off (like Discord).
  const micMuted = muted || deafened
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
      const s = await startScreenShare()
      const video = s.getVideoTracks()[0]
      if (video) {
        video.contentHint = 'detail' // keep text sharp
        // The browser's own "Stop sharing" bar ends the track.
        video.addEventListener('ended', stopShare)
      }
      setScreen(s)
    } catch (e) {
      // NotAllowedError = user pressed Cancel; that's not an error to show.
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) {
        setShareError('Ekran paylaşımı başlatılamadı.')
      }
    }
  }

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
    roomId: myRoom,
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
  const roomName = VOICE_ROOMS.find((r) => r.id === myRoom)?.name ?? ''
  const roomMembers = users.filter((u) => u.voiceRoom === myRoom)

  // --- text channels ----------------------------------------------------
  const [savedChannel, setChannel] = useSetting<string>('textChannel', TEXT_CHANNELS[0].id)
  const channel = TEXT_CHANNELS.find((c) => c.id === savedChannel) ?? TEXT_CHANNELS[0]
  const channelMessages = useMemo(
    () => messages.filter((m) => m.room === channel.id),
    [messages, channel.id],
  )

  // Unread counter: messages newer than when I last looked at the channel.
  // Starts at login time, so history received on joining is not "unread".
  const [lastSeen, setLastSeen] = useState<Record<string, number>>(() => {
    const now = Date.now()
    return Object.fromEntries(TEXT_CHANNELS.map((c) => [c.id, now]))
  })
  // The channel I'm looking at is always "seen".
  useEffect(() => {
    setLastSeen((prev) => ({ ...prev, [channel.id]: Date.now() }))
  }, [channel.id, channelMessages.length])
  const unread = useMemo(() => {
    const out: Record<string, number> = {}
    for (const m of messages) {
      if (m.name !== name && m.ts > (lastSeen[m.room] ?? 0)) {
        out[m.room] = (out[m.room] ?? 0) + 1
      }
    }
    return out
  }, [messages, lastSeen, name])
  const someoneMissing = !!myRoom && voice.ready && voice.peerCount < expectedPeers
  const sameDeviceTab = useSameDeviceTabs(myRoom)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className={`dot ${online ? status : 'offline'}`} />
          {!online ? 'İnternet yok' : status === 'online' ? 'Bağlı' : 'Bağlanıyor…'}
        </div>

        <h2>Ses odaları</h2>
        {VOICE_ROOMS.map((room) => {
          const members = users.filter((u) => u.voiceRoom === room.id)
          const inside = myRoom === room.id
          return (
            <div key={room.id} className={`room ${inside ? 'active' : ''}`}>
              <button
                className="room-name"
                onClick={() => setMyRoom(room.id)}
                disabled={inside}
                title="Odaya katıl"
              >
                🔊 {room.name}
              </button>
              <ul>
                {members.map((u) => (
                  <li key={u.id}>
                    <UserName user={u} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <h2>Yazı kanalları</h2>
        {TEXT_CHANNELS.map((c) => {
          const active = c.id === channel.id
          const count = active ? 0 : (unread[c.id] ?? 0)
          return (
            <button
              key={c.id}
              className={`channel ${active ? 'active' : ''} ${count ? 'unread' : ''}`}
              onClick={() => setChannel(c.id)}
            >
              <span># {c.name}</span>
              {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
            </button>
          )
        })}

        <div className="sidebar-foot">
          {myRoom && (
            <div className="voice-status">
              <div className={voice.ready ? 'ok' : 'wait'}>
                {voice.ready ? 'Ses bağlı' : 'Ses bağlanıyor…'}
              </div>
              <small>
                {roomName} · {voice.peerCount} kişiyle bağlantı
              </small>
            </div>
          )}
          <div className="controls">
            <span className="me">{name}</span>
            <button
              className={`icon ${micMuted ? 'off' : ''}`}
              onClick={() => setMuted((m) => !m)}
              disabled={deafened}
              title={micMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
            >
              {micMuted ? '🔇' : '🎤'}
            </button>
            <button
              className={`icon ${deafened ? 'off' : ''}`}
              onClick={() => setDeafened((d) => !d)}
              title={deafened ? 'Sesi aç' : 'Sağırlaştır (kimseyi duyma)'}
            >
              {deafened ? '🔕' : '🎧'}
            </button>
            {myRoom && canShareScreen() && (
              <button
                className={`icon ${screen ? 'sharing' : ''}`}
                onClick={toggleShare}
                title={screen ? 'Paylaşımı durdur' : 'Ekranını paylaş'}
              >
                🖥️
              </button>
            )}
            <button className="icon" onClick={() => setShowSettings(true)} title="Ayarlar">
              ⚙️
            </button>
            {myRoom && (
              <button
                className="icon leave"
                onClick={() => setMyRoom(null)}
                title="Odadan ayrıl"
              >
                📞
              </button>
            )}
          </div>
          {pttEnabled && myRoom && (
            <small className={`ptt-state ${transmit ? 'on' : ''}`}>
              {micMuted
                ? 'Bas-konuş: mikrofon kapalı'
                : transmit
                  ? 'Konuşuyorsun…'
                  : `Konuşmak için ${keyLabel(pttKey)} tuşuna basılı tut`}
            </small>
          )}
          <button className="link" onClick={onLogout}>
            Çıkış yap
          </button>
        </div>
      </aside>

      <main className="content">
        {!online && (
          <div className="warning">
            İnternet bağlantısı koptu. Geri gelince otomatik yeniden bağlanılacak.
          </div>
        )}
        {warning && <div className="warning">{warning}</div>}
        {voice.error && <div className="warning">{voice.error}</div>}
        {sameDeviceTab && !deafened && (
          <div className="warning">
            Bu bilgisayarda başka bir sekme de aynı odada. Hoparlör kullanıyorsan çınlama
            (geri besleme) olur: kulaklık tak ya da bir sekmede 🎧 ile sesi kapat.
          </div>
        )}
        {someoneMissing && (
          <div className="warning">
            Odadaki herkesle ses bağlantısı kurulamadı. Otomatik tekrar deneniyor…
          </div>
        )}

        {myRoom && (
          <VoicePanel
            roomName={roomName}
            members={roomMembers}
            volumes={volumeByName}
            onVolume={(n, v) => setVolumeByName((prev) => ({ ...prev, [n]: v }))}
            pttEnabled={pttEnabled}
            onPttHold={setPttDown}
            watchUid={watchUid}
            onWatch={setWatchUid}
          />
        )}

        {shareError && <div className="warning">{shareError}</div>}

        {screen && (
          <div className="sharing-bar">
            <span>🔴 Ekranını paylaşıyorsun</span>
            <button onClick={stopShare}>Durdur</button>
          </div>
        )}

        {watchUid && watched && (
          <ScreenView
            name={watched.name}
            stream={voice.screens[watchUid] ?? null}
            muted={deafened}
            volume={volumesById[watchUid] ?? 1}
            onClose={() => setWatchUid(null)}
          />
        )}

        <Chat
          roomName={channel.name}
          messages={channelMessages}
          myName={name}
          onSend={(text) => sendChat(channel.id, text)}
        />
      </main>

      <aside className="people">
        <h2>Çevrimiçi — {users.length}</h2>
        <ul className="online">
          {users.map((u) => (
            <li key={u.id}>
              <span className="dot online" /> <UserName user={u} />
              {u.voiceRoom && (
                <small> · 🔊 {VOICE_ROOMS.find((r) => r.id === u.voiceRoom)?.name}</small>
              )}
            </li>
          ))}
        </ul>
      </aside>

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
