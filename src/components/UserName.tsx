import type { OnlineUser } from '../lobby'

export default function UserName({ user }: { user: OnlineUser }) {
  return (
    <span className={`user ${user.speaking && user.voiceRoom ? 'speaking' : ''}`}>
      {user.admin && <span title="Yönetici">👑 </span>}
      {user.name}
      {user.self && ' (sen)'}
      {user.deafened ? ' 🔕' : user.muted ? ' 🔇' : ''}
      {user.sharing && user.voiceRoom ? ' 🖥️' : ''}
    </span>
  )
}
