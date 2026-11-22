import { useEffect, useRef } from 'react'

type Props = {
  name: string
  stream: MediaStream | null // null = still connecting
  muted: boolean
  volume: number // 0..1
  onClose: () => void
}

/** Big view of someone's shared screen. */
export default function ScreenView({ name, stream, muted, volume, onClose }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play().catch(() => {})
  }, [stream])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
    v.volume = volume
  }, [muted, volume, stream])

  const fullscreen = () => {
    const box = boxRef.current
    if (!box) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else box.requestFullscreen?.().catch(() => {})
  }

  return (
    <section className="screen-view" ref={boxRef}>
      <div className="screen-head">
        <span>🖥️ {name} ekranını paylaşıyor</span>
        <div className="screen-actions">
          <button onClick={fullscreen} title="Tam ekran">
            ⛶
          </button>
          <button onClick={onClose} title="İzlemeyi bırak">
            ✕
          </button>
        </div>
      </div>
      <div className="screen-body">
        <video ref={videoRef} autoPlay playsInline onDoubleClick={fullscreen} />
        {!stream && <div className="screen-wait">Bağlanıyor…</div>}
      </div>
    </section>
  )
}
