import { useRef, useState, type FormEvent } from 'react'
import { LOGO_SMALL } from './Bits'
import AsciiBackground from './AsciiBackground'
import { MAX_SERVER_NAME, cleanName, createServer, serverKey } from '../server'

export type LoginInfo = { name: string; serverName: string; srv: string; password: string }

type Props = {
  error?: string | null
  onLogin: (info: LoginInfo) => void
}

type Mode = 'join' | 'create'

const NAME_KEY = 'sesli-sohbet:name'
const SERVER_KEY = 'sesli-sohbet:lastServer'

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage blocked: ignore */
  }
}

export default function Login({ onLogin, error: initialError = null }: Props) {
  const [mode, setMode] = useState<Mode>('join')
  const [name, setName] = useState(() => load(NAME_KEY))
  const [serverName, setServerName] = useState(() => load(SERVER_KEY))
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const s = cleanName(serverName, MAX_SERVER_NAME)
    if (!n || !s || !password) return
    if (mode === 'create' && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (mode === 'create' && (await createServer(s, password)) === 'exists') {
        setError('This browser already has a server with this name. Use "Join" instead.')
        return
      }
      save(NAME_KEY, n)
      save(SERVER_KEY, s)
      onLogin({ name: n, serverName: s, srv: await serverKey(s), password })
    } catch {
      setError('Something went wrong. Reload the page and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <AsciiBackground clearRef={formRef} />
      <form className="login" onSubmit={submit} ref={formRef}>
        <pre className="logo small" aria-label="Voice Chat">
          {LOGO_SMALL}
        </pre>
        <div className="seg">
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >
            Join server
          </button>
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => setMode('create')}
          >
            Create server
          </button>
        </div>
        <label>
          Username
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
        </label>
        <label>
          Server name
          <input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            maxLength={MAX_SERVER_NAME}
            required
          />
        </label>
        <label>
          Server password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="warning">{error}</div>}
        <button type="submit" className="btn" disabled={busy}>
          {mode === 'create' ? 'Create server' : 'Join'}
        </button>
      </form>
    </div>
  )
}
