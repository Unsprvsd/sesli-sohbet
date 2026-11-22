import type { ChatMessage, OnlineUser } from '../lobby'
import Chat from './Chat'
import UserName from './UserName'

type Props = {
  roomName: string
  members: OnlineUser[]
  volumes: Record<string, number> // by user name, 0..100
  onVolume: (name: string, value: number) => void
  messages: ChatMessage[]
  myName: string
  onSend: (text: string) => void
  pttEnabled: boolean
  onPttHold: (down: boolean) => void
}

export default function RoomPanel(p: Props) {
  return (
    <div className="room-panel">
      <h2>🔊 {p.roomName}</h2>

      <ul className="members">
        {p.members.map((u) => (
          <li key={u.id}>
            <UserName user={u} />
            {!u.self && (
              <label className="volume" title="Bu kişinin ses seviyesi">
                🔉
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={p.volumes[u.name] ?? 100}
                  onChange={(e) => p.onVolume(u.name, Number(e.target.value))}
                />
                <span>{p.volumes[u.name] ?? 100}%</span>
              </label>
            )}
          </li>
        ))}
      </ul>

      {p.pttEnabled && (
        <button
          className="ptt-button"
          onPointerDown={() => p.onPttHold(true)}
          onPointerUp={() => p.onPttHold(false)}
          onPointerLeave={() => p.onPttHold(false)}
          onPointerCancel={() => p.onPttHold(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          Konuşmak için basılı tut
        </button>
      )}

      <Chat roomName={p.roomName} messages={p.messages} myName={p.myName} onSend={p.onSend} />
    </div>
  )
}
