import { useCallback, useState } from 'react'
import Login, { type LoginInfo } from './components/Login'
import Lobby from './components/Lobby'

export default function App() {
  const [session, setSession] = useState<LoginInfo | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  // Stable function, so the lobby's "not found" timer is not restarted.
  const fail = useCallback((msg: string) => {
    setLoginError(msg)
    setSession(null)
  }, [])

  if (!session) {
    return (
      <Login
        error={loginError}
        onLogin={(info) => {
          setLoginError(null)
          setSession(info)
        }}
      />
    )
  }

  return (
    <Lobby
      name={session.name}
      serverName={session.serverName}
      srv={session.srv}
      password={session.password}
      onLogout={() => setSession(null)}
      onFail={fail}
    />
  )
}
