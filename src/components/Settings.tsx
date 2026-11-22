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
        <h2>Ayarlar</h2>

        <label>
          Mikrofon
          <select value={p.deviceId} onChange={(e) => p.onDeviceId(e.target.value)}>
            <option value="">Varsayılan</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== 'default')
              .map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Mikrofon ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        {noLabels && (
          <small className="hint-small">
            Mikrofon isimlerini görmek için önce bir odaya katılıp mikrofon izni ver.
          </small>
        )}

        <label className="row">
          <input
            type="checkbox"
            checked={p.pttEnabled}
            onChange={(e) => p.onPttEnabled(e.target.checked)}
          />
          Bas-konuş (sadece tuşa basılıyken mikrofon açık)
        </label>

        {p.pttEnabled && (
          <div className="ptt-key">
            Tuş: <b>{keyLabel(p.pttKey)}</b>
            <button onClick={() => setWaitingForKey(true)}>
              {waitingForKey ? 'Bir tuşa bas… (Esc: iptal)' : 'Değiştir'}
            </button>
            <small className="hint-small">
              Not: Tarayıcı, tuşu sadece bu sekme öndeyken algılar. Oyunun içindeyken çalışmaz.
              Telefonda ekrandaki “Basılı tut” düğmesini kullan.
            </small>
          </div>
        )}

        <button className="primary" onClick={p.onClose}>
          Kapat
        </button>
      </div>
    </div>
  )
}
