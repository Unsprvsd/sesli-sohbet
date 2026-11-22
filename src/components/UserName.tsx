import type { OnlineUser } from '../lobby'

export default function UserName({ user }: { user: OnlineUser }) {
  return (
    <span className={`user ${user.speaking && user.voiceRoom ? 'speaking' : ''}`}>
      {user.name}
      {user.self && ' (sen)'}
      {user.deafened ? ' 🔕' : user.muted ? ' 🔇' : ''}
    </span>
  )
}
