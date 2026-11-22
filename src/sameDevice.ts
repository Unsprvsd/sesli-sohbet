import { useEffect, useRef, useState } from 'react'

type TabMsg =
  | { type: 'hello'; tab: string }
  | { type: 'room'; tab: string; room: string | null }
  | { type: 'bye'; tab: string }

/**
 * Detects other tabs of this app in the same browser that are in the same
 * voice room. Two tabs + speakers on one PC = feedback ringing, so we warn.
 * Uses BroadcastChannel: tab-to-tab only, nothing goes over the network.
 */
export function useSameDeviceTabs(myRoom: string | null): boolean {
  const [otherRooms, setOtherRooms] = useState<Record<string, string | null>>({})
  const tabId = useRef(crypto.randomUUID()).current
  const myRoomRef = useRef(myRoom)
  const channelRef = useRef<BroadcastChannel | null>(null)
  myRoomRef.current = myRoom

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel('sesli-sohbet-tabs')
    channelRef.current = ch

    ch.onmessage = (e: MessageEvent<TabMsg>) => {
      const m = e.data
      if (!m || m.tab === tabId) return
      if (m.type === 'hello') {
        ch.postMessage({ type: 'room', tab: tabId, room: myRoomRef.current } satisfies TabMsg)
      } else if (m.type === 'room') {
        setOtherRooms((prev) => ({ ...prev, [m.tab]: m.room }))
      } else if (m.type === 'bye') {
        setOtherRooms(({ [m.tab]: _gone, ...rest }) => rest)
      }
    }

    const bye = () => ch.postMessage({ type: 'bye', tab: tabId } satisfies TabMsg)
    window.addEventListener('pagehide', bye)
    ch.postMessage({ type: 'hello', tab: tabId } satisfies TabMsg)

    return () => {
      window.removeEventListener('pagehide', bye)
      bye()
      ch.close()
      channelRef.current = null
    }
  }, [tabId])

  // Tell other tabs when my room changes.
  useEffect(() => {
    channelRef.current?.postMessage({ type: 'room', tab: tabId, room: myRoom } satisfies TabMsg)
  }, [myRoom, tabId])

  return !!myRoom && Object.values(otherRooms).some((r) => r === myRoom)
}
