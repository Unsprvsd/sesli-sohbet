import { useEffect, useRef, useState } from 'react'
import { joinRoom } from 'trystero'
import { APP_ID } from './config'

type Options = {
  roomId: string | null
  password: string
  micMuted: boolean
  deafened: boolean
  onSpeaking: (speaking: boolean) => void
}

/**
 * While roomId is set: takes the microphone, joins the voice room and plays
 * everyone else's audio. Leaves and releases the mic when roomId becomes null.
 */
export function useVoice({ roomId, password, micMuted, deafened, onSpeaking }: Options) {
  const [error, setError] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [ready, setReady] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const audiosRef = useRef(new Map<string, HTMLAudioElement>())
  const micMutedRef = useRef(micMuted)
  const deafenedRef = useRef(deafened)
  const onSpeakingRef = useRef(onSpeaking)
  micMutedRef.current = micMuted
  deafenedRef.current = deafened
  onSpeakingRef.current = onSpeaking

  useEffect(() => {
    if (!roomId) return

    let cancelled = false
    let cleanup = () => {}
    setError(null)
    setReady(false)

    const start = async () => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
      } catch (e) {
        if (!cancelled) setError(micErrorText(e))
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      setTrackEnabled(stream, !micMutedRef.current)

      const room = joinRoom({ appId: APP_ID, password, identity: 'none' }, `voice-${roomId}`)
      const audios = audiosRef.current
      const updateCount = () => setPeerCount(Object.keys(room.getPeers()).length)

      const removeAudio = (peerId: string) => {
        const audio = audios.get(peerId)
        if (audio) {
          audio.pause()
          audio.srcObject = null
          audios.delete(peerId)
        }
      }

      const offs = [
        // Send my mic to anyone who joins after me.
        room.onPeerJoin(({ peerId }) => {
          room.addStream(stream, { target: peerId }).catch(() => {})
          updateCount()
        }),
        room.onPeerLeave(({ peerId }) => {
          removeAudio(peerId)
          updateCount()
        }),
        // Play other people's voices.
        room.onPeerStream((remote, { peerId }) => {
          const audio = audios.get(peerId) ?? new Audio()
          audio.autoplay = true
          audio.srcObject = remote
          audio.muted = deafenedRef.current
          audio.play().catch(() => {})
          audios.set(peerId, audio)
        }),
      ]

      // Send my mic to everyone already in the room.
      room.addStream(stream).catch(() => {})
      room.ready.then(() => !cancelled && setReady(true))

      const stopDetection = startSpeakingDetection(stream, (s) => onSpeakingRef.current(s))

      cleanup = () => {
        offs.forEach((off) => off())
        stopDetection()
        onSpeakingRef.current(false)
        for (const peerId of [...audios.keys()]) removeAudio(peerId)
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
  }, [roomId, password])

  // Mute / unmute my microphone.
  useEffect(() => {
    if (streamRef.current) setTrackEnabled(streamRef.current, !micMuted)
  }, [micMuted])

  // Deafen: silence everyone else.
  useEffect(() => {
    for (const audio of audiosRef.current.values()) audio.muted = deafened
  }, [deafened])

  return { error, peerCount, ready }
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
