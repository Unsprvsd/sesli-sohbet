import { useEffect, useState } from 'react'
import { keyLabel } from '../settings'

type Props = {
  deviceId: string
  onDeviceId: (id: string) => void
  pttEnabled: boolean
  onPttEnabled: (on: boolean) => void
  pttKey: string
  onPttKey: (code: string) => void
  onClose: () => void
}

export default function Settings(p: Props) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [waitingForKey, setWaitingForKey] = useState(false)

  // List microphones (and refresh when one is plugged in / out).
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.enumerateDevices) return
    const load = () =>
      md
        .enumerateDevices()
        .then((d) => setMics(d.filter((x) => x.kind === 'audioinput')))
        .catch(() => {})
    load()
    md.addEventListener('devicechange', load)
    return () => md.removeEventListener('devicechange', load)
  }, [])

  // "Press a key" mode for choosing the push-to-talk key.
  const { onPttKey } = p
  useEffect(() => {
    if (!waitingForKey) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code !== 'Escape') onPttKey(e.code)
      setWaitingForKey(false)
    }
    window.addEventListener('keydown', onKey, { once: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [waitingForKey, onPttKey])

  const noLabels = mics.length > 0 && mics.every((m) => !m.label)

  return (
    <div className="backdrop" onClick={p.onClose}>
      <div className="card settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label>
          Microphone
          <select value={p.deviceId} onChange={(e) => p.onDeviceId(e.target.value)}>
            <option value="">Default</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== 'default')
              .map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Microphone ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        {noLabels && (
          <small className="hint-small">
            To see microphone names, join a room first and allow microphone access.
          </small>
        )}

        <label className="row">
          <input
            type="checkbox"
            checked={p.pttEnabled}
            onChange={(e) => p.onPttEnabled(e.target.checked)}
          />
          Push-to-talk (mic is on only while the key is held)
        </label>

        {p.pttEnabled && (
          <div className="ptt-key">
            Key: <b>{keyLabel(p.pttKey)}</b>
            <button onClick={() => setWaitingForKey(true)}>
              {waitingForKey ? 'Press a key… (Esc: cancel)' : 'Change'}
            </button>
            <small className="hint-small">
              Note: the browser only detects the key while this tab is in front. It does not
              work inside a game. On a phone, use the “Hold to talk” button on the screen.
            </small>
          </div>
        )}

        <button className="btn" onClick={p.onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
