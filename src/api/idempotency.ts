import { useCallback, useRef } from 'react'

export function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function fingerprint(input: unknown) {
  return JSON.stringify(input, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : value)
}

/**
 * One key per logical write. Retrying unchanged input reuses the key so the
 * server returns the original result; editing the input issues a new key so
 * the server never sees one key with two payloads. Call reset() after success.
 */
export function useIdempotencyKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null)
  const keyFor = useCallback((input: unknown) => {
    const next = fingerprint(input)
    if (current.current?.fingerprint !== next) current.current = { fingerprint: next, key: newIdempotencyKey() }
    return current.current.key
  }, [])
  const reset = useCallback(() => { current.current = null }, [])
  return { keyFor, reset }
}

/** Drops re-entrant submits (double click, Enter + click) while one write is in flight. */
export function useSingleFlight() {
  const busy = useRef(false)
  return useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined
    busy.current = true
    try { return await work() } finally { busy.current = false }
  }, [])
}
