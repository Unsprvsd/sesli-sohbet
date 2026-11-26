import { useEffect, useRef } from 'react'
import { startGlow } from '../ascii/scenes/glow'

/**
 * Faint ASCII glow lines behind the server screen.
 * The animation and its settings live in src/ascii/scenes/glow.ts
 * (tune it in the studio: ascii-studio.html).
 */
export default function AsciiStream() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    // Reduced motion: nothing to show (the lines are invisible without a glow).
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    return startGlow(canvas)
  }, [])

  return <canvas ref={ref} className="ascii-stream" aria-hidden="true" />
}
