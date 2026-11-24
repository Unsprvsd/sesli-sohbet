import type { OnlineUser } from '../lobby'
import { Meter } from './Bits'

type Props = {
  user: OnlineUser
  /** Show volume bars in front of the name (people in a voice room). */
  meter?: boolean
}

export default function UserName({ user, meter }: Props) {
  const speaking = user.speaking && !!user.voiceRoom
  return (
    <span className={`user ${speaking ? 'speaking' : ''}`}>
      {meter && <Meter on={speaking} />}
      <span className="user-name">
        {user.name}
        {user.self && <span className="you"> (you)</span>}
      </span>
      {user.deafened ? (
        <span className="tag">deaf</span>
      ) : user.muted ? (
        <span className="tag">muted</span>
      ) : null}
      {user.sharing && user.voiceRoom && <span className="tag live">LIVE</span>}
    </span>
  )
}
