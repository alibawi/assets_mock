import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { seed } from './seed'
import type { DB } from './types'

const KEY = 'enki-assets-mock-v1'

interface Ctx {
  db: DB
  update: (fn: (draft: DB) => void) => void
  reset: () => void
  toast: (msg: string, tone?: 'ok' | 'err') => void
}

const StoreCtx = createContext<Ctx | null>(null)

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {
    /* ignore */
  }
  return seed()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load)
  const [toastMsg, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }, [db])

  const update = useCallback((fn: (draft: DB) => void) => {
    setDb((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const reset = useCallback(() => setDb(seed()), [])

  return (
    <StoreCtx.Provider value={{ db, update, reset, toast }}>
      {children}
      {toastMsg && (
        <div
          className={`fixed bottom-5 left-5 z-50 rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${
            toastMsg.tone === 'ok' ? 'bg-navy' : 'bg-red-600'
          }`}
        >
          {toastMsg.msg}
        </div>
      )}
    </StoreCtx.Provider>
  )
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('StoreProvider missing')
  return c
}

/** Next document number like PREFIX-2026-0003 based on existing docs. */
export function nextNumber(prefix: string, existing: { number: string }[]) {
  const n = existing.reduce((m, d) => Math.max(m, Number(d.number.split('-').pop()) || 0), 0) + 1
  return `${prefix}-2026-${String(n).padStart(4, '0')}`
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export const historyEntry = (action: string, ref: string) => ({ date: '2026-10-16', action, ref, user: 'superadmin' })
