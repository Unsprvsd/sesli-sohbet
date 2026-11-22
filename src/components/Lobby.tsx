import { useCallback, useEffect, useState } from 'react'
import { VOICE_ROOMS } from '../config'
import { useLobby, type OnlineUser } from '../lobby'
import { useVoice } from '../voice'

type Props = {
  name: string
  password: string
  onLogout: () => void
}

export default function Lobby({ name, password, onLogout }: Props) {
  const { users, status, warning, updatePresence } = useLobby(name, password)
  const [myRoom, setMyRoom] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [deafened, setDeafened] = useState(false)

  // Deafened also means mic off (like Discord).
  const micMuted = muted || deafened

  const onSpeaking = useCallback(
    (speaking: boolean) => updatePresence({ speaking }),
    [updatePresence],
  )

  const voice = useVoice({ roomId: myRoom, password, micMuted, deafened, onSpeaking })

  // Share my room / mute / deafen state with everyone.
  useEffect(() => {
    updatePresence({ voiceRoom: myRoom, muted: micMuted, deafened })
  }, [myRoom, micMuted, deafened, updatePresence])

  // If the mic fails, leave the room again.
  useEffect(() => {
    if (voice.error) setMyRoom(null)
  }, [voice.error])

  const roomName = VOICE_ROOMS.find((r) => r.id === myRoom)?.name

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className={`dot ${status}`} />
          {status === 'online' ? 'Bağlı' : 'Bağlanıyor…'}
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
          <button className="link" onClick={onLogout}>
            Çıkış yap
          </button>
        </div>
      </aside>

      <main className="content">
        {warning && <div className="warning">{warning}</div>}
        {voice.error && <div className="warning">{voice.error}</div>}

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

        <p className="hint">
          {myRoom
            ? 'Odadasın. Konuşunca adının etrafında yeşil halka çıkar.'
            : 'Katılmak için soldan bir odaya tıkla.'}
        </p>
      </main>
    </div>
  )
}

function UserName({ user }: { user: OnlineUser }) {
  return (
    <span className={`user ${user.speaking && user.voiceRoom ? 'speaking' : ''}`}>
      {user.name}
      {user.self && ' (sen)'}
      {user.deafened ? ' 🔕' : user.muted ? ' 🔇' : ''}
    </span>
  )
}
