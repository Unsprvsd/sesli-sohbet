import { useEffect, useRef } from 'react'

type Props = {
  /** Text in the head, e.g. "Ali is sharing their screen". */
  title: string
  stream: MediaStream | null // null = still connecting
  muted: boolean
  volume: number // 0..1
  /** Small window docked bottom-right (true) or big in the middle (false). */
  mini: boolean
  onToggleMini: () => void
  /** Stop watching. Not given for my own preview (stop sharing is in the sharing bar). */
  onClose?: () => void
}

/** A shared screen: big in the middle, or as a small window bottom-right. */
export default function ScreenView({ title, stream, muted, volume, mini, onToggleMini, onClose }: Props) {
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
    <section className={`screen-view ${mini ? 'mini' : ''}`} ref={boxRef}>
      <div className="screen-head">
        <span className="screen-title">
          <span className="tag live">LIVE</span> {title}
        </span>
        <div className="screen-actions">
          <button onClick={onToggleMini} title={mini ? 'Make it big' : 'Small window bottom-right'}>
            {mini ? 'Expand' : 'Minimize'}
          </button>
          {!mini && (
            <button onClick={fullscreen} title="Full screen">
              Full screen
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Stop watching">
              Close
            </button>
          )}
        </div>
      </div>
      <div className="screen-body">
        <video ref={videoRef} autoPlay playsInline muted={muted} onDoubleClick={mini ? onToggleMini : fullscreen} />
        {!stream && <div className="screen-wait">Connecting…</div>}
      </div>
    </section>
  )
}
