import { useEffect, useRef, useState } from 'react'
import { joinRoom, type MessageAction, type Room } from 'trystero'
import { APP_ID } from './config'

type Options = {
  roomId: string | null
  password: string
  /** My lobby user id; sent with my streams so others know whose they are. */
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
  /** My screen share, or null. Only sent to people who asked to watch it. */
  screen: MediaStream | null
  /** Lobby user id of the person whose screen I want to watch, or null. */
  watchUid: string | null
  onSpeaking: (speaking: boolean) => void
}

type RemoteAudio = { audio: HTMLAudioElement; uid: string }
type WatchMsg = { uid: string; watch: boolean }
type StreamMeta = { uid: string; kind?: 'screen' }

function readMeta(metadata: unknown): StreamMeta {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const m = metadata as Record<string, unknown>
    return {
      uid: typeof m.uid === 'string' ? m.uid : '',
      kind: m.kind === 'screen' ? 'screen' : undefined,
    }
  }
  return { uid: '' }
}

/**
 * While roomId is set: takes the microphone, joins the voice room and plays
 * everyone else's audio. Also handles screen sharing inside the room.
 * Leaves and releases the mic when roomId becomes null.
 */
export function useVoice(opts: Options) {
  const { roomId, password, selfId, transmit, deafened, volumes, deviceId, epoch } = opts
  const { screen, watchUid } = opts
  const [error, setError] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [ready, setReady] = useState(false)
  /** Screens I'm receiving, by lobby user id. */
  const [screens, setScreens] = useState<Record<string, MediaStream>>({})

  const streamRef = useRef<MediaStream | null>(null)
  const remotesRef = useRef(new Map<string, RemoteAudio>())
  const roomRef = useRef<Room | null>(null)
  const watchActRef = useRef<MessageAction<WatchMsg> | null>(null)
  /** Peers (voice-room peer ids) watching my screen. */
  const watchersRef = useRef(new Set<string>())
  const screenRef = useRef(screen)
  const watchUidRef = useRef(watchUid)
  const transmitRef = useRef(transmit)
  const deafenedRef = useRef(deafened)
  const volumesRef = useRef(volumes)
  const onSpeakingRef = useRef(opts.onSpeaking)
  screenRef.current = screen
  watchUidRef.current = watchUid
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
      const watchAct = room.makeAction<WatchMsg>('screen-watch')
      roomRef.current = room
      watchActRef.current = watchAct
      watchersRef.current = new Set()

      const remotes = remotesRef.current
      const screenPeers = new Map<string, string>() // peerId → uid of their screen
      const voiceMeta = { uid: selfId }
      const screenMeta = { uid: selfId, kind: 'screen' as const }
      const updateCount = () => setPeerCount(Object.keys(room.getPeers()).length)

      const removeAudio = (peerId: string) => {
        const r = remotes.get(peerId)
        if (r) {
          r.audio.pause()
          r.audio.srcObject = null
          remotes.delete(peerId)
        }
      }
      const removeScreen = (peerId: string) => {
        const uid = screenPeers.get(peerId)
        if (uid === undefined) return
        screenPeers.delete(peerId)
        setScreens(({ [uid]: _gone, ...rest }) => rest)
      }

      const offs = [
        room.onPeerJoin(({ peerId }) => {
          // Send my mic to anyone who joins after me.
          room.addStream(stream, { target: peerId, metadata: voiceMeta }).catch(() => {})
          // If I'm watching someone, ask again (maybe they just rejoined).
          const w = watchUidRef.current
          if (w) watchAct.send({ uid: w, watch: true }, { target: peerId }).catch(() => {})
          updateCount()
        }),
        room.onPeerLeave(({ peerId }) => {
          removeAudio(peerId)
          removeScreen(peerId)
          watchersRef.current.delete(peerId)
          updateCount()
        }),
        room.onPeerStream((remote, { peerId, metadata }) => {
          const meta = readMeta(metadata)

          if (meta.kind === 'screen') {
            // Someone's screen share (video + maybe tab audio).
            screenPeers.set(peerId, meta.uid)
            setScreens((prev) => ({ ...prev, [meta.uid]: remote }))
            remote.addEventListener('removetrack', () => {
              if (remote.getVideoTracks().length === 0) removeScreen(peerId)
            })
            return
          }

          // Someone's voice.
          const audio = remotes.get(peerId)?.audio ?? new Audio()
          audio.autoplay = true
          audio.srcObject = remote
          audio.muted = deafenedRef.current
          audio.volume = volumesRef.current[meta.uid] ?? 1
          audio.play().catch(() => {})
          remotes.set(peerId, { audio, uid: meta.uid })
          updateCount()
        }),
        // Someone wants to (stop) watch(ing) my screen.
        watchAct.onMessage((data, { peerId }) => {
          if (!data || data.uid !== selfId) return
          const myScreen = screenRef.current
          if (data.watch) {
            watchersRef.current.add(peerId)
            if (myScreen) {
              room.addStream(myScreen, { target: peerId, metadata: screenMeta }).catch(() => {})
            }
          } else {
            watchersRef.current.delete(peerId)
            if (myScreen) room.removeStream(myScreen, { target: peerId })
          }
        }),
      ]

      // Send my mic to everyone already in the room.
      room.addStream(stream, { metadata: voiceMeta }).catch(() => {})
      room.ready.then(() => !cancelled && setReady(true))

      const stopDetection = startSpeakingDetection(stream, (s) => onSpeakingRef.current(s))

      cleanup = () => {
        offs.forEach((off) => off())
        stopDetection()
        onSpeakingRef.current(false)
        for (const peerId of [...remotes.keys()]) removeAudio(peerId)
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        roomRef.current = null
        watchActRef.current = null
        watchersRef.current = new Set()
        setScreens({})
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

  // My screen share started / stopped.
  const prevScreenRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    const room = roomRef.current
    const prev = prevScreenRef.current
    prevScreenRef.current = screen
    if (!room) return
    if (prev && prev !== screen) {
      try {
        room.removeStream(prev)
      } catch {
        /* peer already gone */
      }
      watchersRef.current = new Set()
    }
    if (screen && screen !== prev) {
      for (const peerId of watchersRef.current) {
        room
          .addStream(screen, { target: peerId, metadata: { uid: selfId, kind: 'screen' } })
          .catch(() => {})
      }
    }
  }, [screen, selfId])

  // Ask to watch someone's screen (and stop when I don't want it anymore).
  useEffect(() => {
    const act = watchActRef.current
    if (!act || !ready || !watchUid) return
    act.send({ uid: watchUid, watch: true }).catch(() => {})
    return () => {
      act.send({ uid: watchUid, watch: false }).catch(() => {})
      setScreens(({ [watchUid]: _gone, ...rest }) => rest)
    }
  }, [watchUid, ready])

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

  return { error, peerCount, ready, screens }
}

/** Asks the browser for a screen / window / tab to share. */
export async function startScreenShare(): Promise<MediaStream> {
  const options = {
    video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
    audio: true, // tab audio (e.g. a YouTube tab)
    systemAudio: 'exclude', // whole-screen audio would echo our voice chat back
    selfBrowserSurface: 'exclude', // don't offer this tab (mirror effect)
    surfaceSwitching: 'include',
  }
  return navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions)
}

export const canShareScreen = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

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
  if (name === 'NotAllowedError') return 'Microphone permission denied. Allow it from the browser address bar.'
  if (name === 'NotFoundError') return 'No microphone found.'
  if (name === 'NotReadableError') return 'The microphone is being used by another app.'
  return 'Could not open the microphone.'
}
