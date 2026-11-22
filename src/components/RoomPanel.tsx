import { useEffect, useRef, useState } from 'react'
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
  // Which member's volume popup is open (user id), or null.
  const [openId, setOpenId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Close the popup when clicking outside it or pressing Esc.
  useEffect(() => {
    if (!openId) return
    const onPointer = (e: PointerEvent) => {
      const open = listRef.current?.querySelector('[data-open="true"]')
      if (open && !open.contains(e.target as Node)) setOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [openId])

  // If that person leaves the room, close their popup.
  useEffect(() => {
    if (openId && !p.members.some((u) => u.id === openId)) setOpenId(null)
  }, [openId, p.members])

  return (
    <div className="room-panel">
      <h2>🔊 {p.roomName}</h2>

      <ul className="members" ref={listRef}>
        {p.members.map((u) => {
          const open = openId === u.id
          const volume = p.volumes[u.name] ?? 100
          return (
            <li key={u.id} data-open={open}>
              {u.self ? (
                <div className="member">
                  <UserName user={u} />
                </div>
              ) : (
                <button
                  className={`member clickable ${open ? 'open' : ''}`}
                  onClick={() => setOpenId(open ? null : u.id)}
                  aria-expanded={open}
                  title="Ses seviyesini ayarla"
                >
                  <UserName user={u} />
                  <span className="member-vol">
                    {volume !== 100 && `${volume}%`} ▾
                  </span>
                </button>
              )}

              {open && (
                <div className="volume-popup" role="dialog" aria-label={`${u.name} ses seviyesi`}>
                  <div className="volume-popup-head">
                    <span>Kullanıcı ses seviyesi</span>
                    <b>{volume}%</b>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={volume}
                    onChange={(e) => p.onVolume(u.name, Number(e.target.value))}
                    autoFocus
                  />
                  <div className="volume-popup-actions">
                    <button onClick={() => p.onVolume(u.name, volume === 0 ? 100 : 0)}>
                      {volume === 0 ? 'Sesini aç' : 'Sustur'}
                    </button>
                    <button onClick={() => p.onVolume(u.name, 100)} disabled={volume === 100}>
                      Sıfırla
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
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
