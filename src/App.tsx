import { useState } from 'react'
import Login from './components/Login'
import Lobby from './components/Lobby'

type Session = { name: string; password: string }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return <Login onLogin={(name, password) => setSession({ name, password })} />
  }

  return (
    <Lobby
      name={session.name}
      password={session.password}
      onLogout={() => setSession(null)}
    />
  )
}
