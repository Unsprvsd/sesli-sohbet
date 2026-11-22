import { useState, type FormEvent } from 'react'

type Props = {
  onLogin: (name: string, password: string) => void
}

const NAME_KEY = 'sesli-sohbet:name'

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Login({ onLogin }: Props) {
  const [name, setName] = useState(loadName)
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !password) return
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      /* storage blocked: ignore */
    }
    onLogin(n, password)
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Sesli Sohbet</h1>
        <label>
          Kullanıcı adı
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
            required
          />
        </label>
        <label>
          Davet şifresi
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit">Giriş yap</button>
      </form>
    </div>
  )
}
