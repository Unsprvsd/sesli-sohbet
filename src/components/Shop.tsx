import { useEffect, useRef, useState } from 'react'
import { Birds } from './Bits'

type Props = {
  /** my points (caught gulls / spiders / butterflies) */
  points: number
  flockCost: number
  /** buy a seagull flock (only to watch, flies over everyone's screen) */
  onFlock: () => void
}

/**
 * Points shop: "Purchase" button at the bottom of the online list (bottom right).
 * Click -> a small panel opens above it with what points can buy.
 * ("shut" is not here: it is in the volume popup of a voice room.)
 */
export default function Shop(p: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking outside or pressing Esc.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const poor = p.points < p.flockCost
  return (
    <div className="shop" ref={ref}>
      {open && (
        <div className="shop-popup" role="dialog" aria-label="Shop">
          <div className="shop-head">
            <span>shop</span>
            <b>~v~ {p.points}</b>
          </div>
          <button
            className="shop-item"
            disabled={poor}
            aria-label="seagull flock"
            title={
              poor
                ? `seagull flock: you need ${p.flockCost} points (you have ${p.points})`
                : 'seagull flock: flies over everyone\'s screen'
            }
            onClick={() => {
              p.onFlock()
              setOpen(false)
            }}
          >
            <Birds />
            <span className="cost">~v~ {p.flockCost}</span>
          </button>
        </div>
      )}
      <button
        className={`shop-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>Purchase</span>
        <span className="cost">~v~ {p.points}</span>
      </button>
    </div>
  )
}
