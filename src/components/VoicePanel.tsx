import { useEffect, useRef, useState } from 'react'
import type { OnlineUser } from '../lobby'
import UserName from './UserName'

type Props = {
  roomName: string
  members: OnlineUser[]
  volumes: Record<string, number> // by user name, 0..100
  onVolume: (name: string, value: number) => void
  pttEnabled: boolean
  onPttHold: (down: boolean) => void
  watchUid: string | null
  onWatch: (uid: string | null) => void
}

/** Compact bar above the chat while I'm in a voice room. */
export default function VoicePanel(p: Props) {
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
    <section className="voice-panel">
      <h3>🔊 {p.roomName}</h3>

      <ul className="members" ref={listRef}>
        {p.members.map((u) => {
          const open = openId === u.id
          const volume = p.volumes[u.name] ?? 100
          return (
            <li key={u.id} data-open={open}>
              <div className="member-row">
                {u.self ? (
                  <div className="member">
                    <UserName user={u} />
                    {u.sharing && <span className="live">🔴 LIVE</span>}
                  </div>
                ) : (
                  <button
                    className={`member clickable ${open ? 'open' : ''}`}
                    onClick={() => setOpenId(open ? null : u.id)}
                    aria-expanded={open}
                    title="Set volume"
                  >
                    <UserName user={u} />
                    <span className="member-vol">
                      {u.sharing && <span className="live">🔴 LIVE</span>}
                      {volume !== 100 && ` ${volume}%`} ▾
                    </span>
                  </button>
                )}
                {u.sharing && !u.self && (
                  <button
                    className={`watch ${p.watchUid === u.id ? 'on' : ''}`}
                    onClick={() => p.onWatch(p.watchUid === u.id ? null : u.id)}
                  >
                    {p.watchUid === u.id ? 'Stop' : 'Watch'}
                  </button>
                )}
              </div>

              {open && (
                <div className="volume-popup" role="dialog" aria-label={`${u.name} volume`}>
                  <div className="volume-popup-head">
                    <span>User volume</span>
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
                      {volume === 0 ? 'Unmute' : 'Mute'}
                    </button>
                    <button onClick={() => p.onVolume(u.name, 100)} disabled={volume === 100}>
                      Reset
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
          Hold to talk
        </button>
      )}
    </section>
  )
}
