import { useEffect, useRef, useState } from 'react'
import type { OnlineUser } from '../lobby'
import UserName from './UserName'

type Props = {
  members: OnlineUser[]
  /** Am I in this room? (screen share "Watch" only works then) */
  inside: boolean
  volumes: Record<string, number> // by user name, 0..100
  onVolume: (name: string, value: number) => void
  watchUid: string | null
  onWatch: (uid: string | null) => void
}

/**
 * People in a voice room, in the sidebar under the room name.
 * Click a person -> volume popup right below them.
 */
export default function RoomMembers(p: Props) {
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
    <ul className="room-members" ref={listRef}>
      {p.members.map((u) => {
        const open = openId === u.id
        const volume = p.volumes[u.name] ?? 100
        return (
          <li key={u.id} data-open={open}>
            <div className="rm-row">
              {u.self ? (
                <span className="rm-name">
                  <UserName user={u} meter />
                </span>
              ) : (
                <button
                  className={`rm-name clickable ${open ? 'open' : ''}`}
                  onClick={() => setOpenId(open ? null : u.id)}
                  aria-expanded={open}
                  title="Set volume"
                >
                  <UserName user={u} meter />
                  {volume !== 100 && <span className="rm-vol">{volume}%</span>}
                </button>
              )}
              {p.inside && u.sharing && !u.self && (
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
                  <span>{u.name}</span>
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
  )
}
