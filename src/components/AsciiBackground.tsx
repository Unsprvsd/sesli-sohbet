import { useEffect, useRef, type RefObject } from 'react'
import { startPlasma } from '../ascii/scenes/plasma'

/**
 * Full-screen animated ASCII background (used behind the login form).
 * The animation and its settings live in src/ascii/scenes/plasma.ts
 * (tune it in the studio: ascii-studio.html).
 */
type Props = {
  /** Element to keep clear of letters (the login form). */
  clearRef?: RefObject<HTMLElement | null>
}

export default function AsciiBackground({ clearRef }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    return startPlasma(canvas, {
      clearRect: () => clearRef?.current?.getBoundingClientRect(),
      still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
  }, [clearRef])

  return <canvas ref={ref} className="ascii-bg" aria-hidden="true" />
}
