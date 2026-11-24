import { useEffect, useState } from 'react'

// Small per-browser settings (mic choice, push-to-talk, volumes).
// localStorage can be blocked (private mode etc.), so every access is guarded.

const PREFIX = 'sesli-sohbet:'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/** useState that is remembered in this browser. */
export function useSetting<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  useEffect(() => save(key, value), [key, value])
  return [value, setValue] as const
}

/** Human readable name for a KeyboardEvent.code, e.g. "KeyV" → "V". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const names: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    Backquote: '"',
    CapsLock: 'Caps Lock',
  }
  return names[code] ?? code
}
