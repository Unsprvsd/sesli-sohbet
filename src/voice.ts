import { useEffect, useRef, useState } from 'react'
import { joinRoom } from 'trystero'
import { APP_ID } from './config'

type Options = {
  roomId: string | null
  password: string
  /** My lobby user id; sent with my audio so others know whose voice it is. */
  selfId: string
  /** true = my mic is sending sound (not muted, push-to-talk held, ...). */
  transmit: boolean
  deafened: boolean
  /** Volume per lobby user id, 0..1. Missing = 1. */
  volumes: Record<string, number>
  /** Microphone deviceId, '' = system default. */
  deviceId: string
  /** Changing this leaves and joins the voice room again. */
  epoch: number
  onSpeaking: (speaking: boolean) => void
}

type RemoteAudio = { audio: HTMLAudioElement; uid: string }

/**
 * While roomId is set: takes the microphone, joins the voice room and plays
 * everyone else's audio. Leaves and releases the mic when roomId becomes null.
 */
export function useVoice(opts: Options) {
  const { roomId, password, selfId, transmit, deafened, volumes, deviceId, epoch } = opts
  const [error, setError] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [ready, setReady] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const remotesRef = useRef(new Map<string, RemoteAudio>())
  const transmitRef = useRef(transmit)
  const deafenedRef = useRef(deafened)
  const volumesRef = useRef(volumes)
  const onSpeakingRef = useRef(opts.onSpeaking)
  transmitRef.current = transmit
  deafenedRef.current = deafened
  volumesRef.current = volumes
  onSpeakingRef.current = opts.onSpeaking

  useEffect(() => {
    if (!roomId || !selfId) return

    let cancelled = false
    let cleanup = () => {}
    setError(null)
    setReady(false)

    const start = async () => {
      let stream: MediaStream
      try {
        stream = await getMic(deviceId)
      } catch (e) {
        if (!cancelled) setError(micErrorText(e))
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      setTrackEnabled(stream, transmitRef.current)

      const room = joinRoom({ appId: APP_ID, password, identity: 'none' }, `voice-${roomId}`)
      const remotes = remotesRef.current
      const meta = { uid: selfId }
      const updateCount = () => setPeerCount(Object.keys(room.getPeers()).length)

      const removeAudio = (peerId: string) => {
        const r = remotes.get(peerId)
        if (r) {
          r.audio.pause()
          r.audio.srcObject = null
          remotes.delete(peerId)
        }
      }

      const offs = [
        // Send my mic to anyone who joins after me.
        room.onPeerJoin(({ peerId }) => {
          room.addStream(stream, { target: peerId, metadata: meta }).catch(() => {})
          updateCount()
        }),
        room.onPeerLeave(({ peerId }) => {
          removeAudio(peerId)
          updateCount()
        }),
        // Play other people's voices.
        room.onPeerStream((remote, { peerId, metadata }) => {
          const uid =
            metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
            typeof metadata.uid === 'string'
              ? metadata.uid
              : ''
          const audio = remotes.get(peerId)?.audio ?? new Audio()
          audio.autoplay = true
          audio.srcObject = remote
          audio.muted = deafenedRef.current
          audio.volume = volumesRef.current[uid] ?? 1
          audio.play().catch(() => {})
          remotes.set(peerId, { audio, uid })
          updateCount()
        }),
      ]

      // Send my mic to everyone already in the room.
      room.addStream(stream, { metadata: meta }).catch(() => {})
      room.ready.then(() => !cancelled && setReady(true))

      const stopDetection = startSpeakingDetection(stream, (s) => onSpeakingRef.current(s))

      cleanup = () => {
        offs.forEach((off) => off())
        stopDetection()
        onSpeakingRef.current(false)
        for (const peerId of [...remotes.keys()]) removeAudio(peerId)
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setPeerCount(0)
        setReady(false)
        room.leave()
      }
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [roomId, password, selfId, deviceId, epoch])

  // Mic on/off (mute, deafen, push-to-talk).
  useEffect(() => {
    if (streamRef.current) setTrackEnabled(streamRef.current, transmit)
  }, [transmit])

  // Deafen: silence everyone else.
  useEffect(() => {
    for (const r of remotesRef.current.values()) r.audio.muted = deafened
  }, [deafened])

  // Per-person volume.
  useEffect(() => {
    for (const r of remotesRef.current.values()) r.audio.volume = volumes[r.uid] ?? 1
  }, [volumes])

  return { error, peerCount, ready }
}

async function getMic(deviceId: string): Promise<MediaStream> {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
      video: false,
    })
  } catch (e) {
    // Chosen mic was unplugged → fall back to the default one.
    if (deviceId && e instanceof DOMException && e.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: base, video: false })
    }
    throw e
  }
}

function setTrackEnabled(stream: MediaStream, enabled: boolean) {
  stream.getAudioTracks().forEach((t) => (t.enabled = enabled))
}

/** Checks mic loudness 10 times a second and reports speaking on/off. */
function startSpeakingDetection(stream: MediaStream, report: (speaking: boolean) => void) {
  const ctx = new AudioContext()
  ctx.resume().catch(() => {})
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)

  const samples = new Float32Array(analyser.fftSize)
  const THRESHOLD = 0.02 // loudness needed to count as speaking
  const HOLD_MS = 300 // stay "speaking" a bit after the last loud moment
  let speaking = false
  let lastLoud = 0

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const v of samples) sum += v * v
    const loudness = Math.sqrt(sum / samples.length)

    const now = performance.now()
    const micOn = stream.getAudioTracks().some((t) => t.enabled)
    if (micOn && loudness > THRESHOLD) lastLoud = now

    const next = micOn && now - lastLoud < HOLD_MS
    if (next !== speaking) {
      speaking = next
      report(next)
    }
  }, 100)

  return () => {
    clearInterval(timer)
    source.disconnect()
    ctx.close().catch(() => {})
  }
}

function micErrorText(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return 'Mikrofon izni verilmedi. Tarayıcının adres çubuğundan izin ver.'
  if (name === 'NotFoundError') return 'Mikrofon bulunamadı.'
  if (name === 'NotReadableError') return 'Mikrofon başka bir uygulama tarafından kullanılıyor.'
  return 'Mikrofon açılamadı.'
}
