import { useState, type FormEvent } from 'react'
import { MAX_SERVER_NAME, cleanName, createServer, serverKey } from '../server'

export type LoginInfo = { name: string; serverName: string; srv: string; password: string }

type Props = {
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

export default function Login({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>('join')
  const [name, setName] = useState(() => load(NAME_KEY))
  const [serverName, setServerName] = useState(() => load(SERVER_KEY))
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const s = cleanName(serverName, MAX_SERVER_NAME)
    if (!n || !s || !password) return
    if (mode === 'create' && password.length < 6) {
      setError('Şifre en az 6 karakter olsun.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (mode === 'create' && (await createServer(s)) === 'exists') {
        setError('Bu tarayıcıda bu isimde bir sunucu zaten var. "Katıl" ile gir.')
        return
      }
      save(NAME_KEY, n)
      save(SERVER_KEY, s)
      onLogin({ name: n, serverName: s, srv: await serverKey(s), password })
    } catch {
      setError('Bir hata oldu. Sayfayı yenileyip tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Sesli Sohbet</h1>
        <div className="tabs">
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >
            Sunucuya katıl
          </button>
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => setMode('create')}
          >
            Sunucu kur
          </button>
        </div>
        <label>
          Kullanıcı adı
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required />
        </label>
        <label>
          Sunucu adı
          <input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            maxLength={MAX_SERVER_NAME}
            required
          />
        </label>
        <label>
          Sunucu şifresi
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="warning">{error}</div>}
        <button type="submit" disabled={busy}>
          {mode === 'create' ? 'Sunucuyu kur' : 'Giriş yap'}
        </button>
      </form>
    </div>
  )
}
