import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VOICE_ROOMS } from '../config'
import { useLobby } from '../lobby'
import { useSameDeviceTabs } from '../sameDevice'
import { keyLabel, useSetting } from '../settings'
import { useVoice } from '../voice'
import RoomPanel from './RoomPanel'
import Settings from './Settings'
import UserName from './UserName'

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

  const voice = useVoice({
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
    updatePresence({ voiceRoom: myRoom, muted: micMuted, deafened })
  }, [myRoom, micMuted, deafened, updatePresence])

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
  const roomMessages = useMemo(
    () => messages.filter((m) => m.room === myRoom),
    [messages, myRoom],
  )
  const roomMembers = users.filter((u) => u.voiceRoom === myRoom)
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

        {myRoom ? (
          <RoomPanel
            roomName={roomName}
            members={roomMembers}
            volumes={volumeByName}
            onVolume={(n, v) => setVolumeByName((prev) => ({ ...prev, [n]: v }))}
            messages={roomMessages}
            myName={name}
            onSend={(text) => sendChat(myRoom, text)}
            pttEnabled={pttEnabled}
            onPttHold={setPttDown}
          />
        ) : (
          <>
            <h2>Çevrimiçi — {users.length}</h2>
            <ul className="online">
              {users.map((u) => (
                <li key={u.id}>
                  <span className="dot online" /> <UserName user={u} />
                  {u.voiceRoom && (
                    <small> · {VOICE_ROOMS.find((r) => r.id === u.voiceRoom)?.name}</small>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint">Katılmak için soldan bir odaya tıkla.</p>
          </>
        )}
      </main>

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
