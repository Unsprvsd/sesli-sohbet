import { useState } from 'react'
import Login, { type LoginInfo } from './components/Login'
import Lobby from './components/Lobby'

export default function App() {
  const [session, setSession] = useState<LoginInfo | null>(null)

  if (!session) {
    return <Login onLogin={setSession} />
  }

  return (
    <Lobby
      name={session.name}
      serverName={session.serverName}
      srv={session.srv}
      password={session.password}
      onLogout={() => setSession(null)}
    />
  )
}
