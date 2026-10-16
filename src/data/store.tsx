import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { can as canRole, type Perm } from './permissions'
import { seed } from './seed'
import type { DB } from './types'

const KEY = 'enki-assets-mock-v5'

interface Ctx {
  db: DB
  /** Applies a mutation to a copy of the DB. If `fn` returns a string it is treated as an error and nothing is saved. */
  run: (fn: (draft: DB) => string | null | void, ok?: string) => boolean
  reset: () => void
  toast: (msg: string, tone?: 'ok' | 'err') => void
  can: (p: Perm) => boolean
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
  // Latest DB, so consecutive run() calls in one event build on each other.
  const ref = useRef(db)
  const [toastMsg, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }, [db])

  const toast = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone })
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const run = useCallback(
    (fn: (draft: DB) => string | null | void, ok?: string) => {
      const next = structuredClone(ref.current)
      const err = fn(next)
      if (typeof err === 'string') {
        toast(err, 'err')
        return false
      }
      ref.current = next
      setDb(next)
      if (ok) toast(ok)
      return true
    },
    [toast],
  )

  const reset = useCallback(() => {
    ref.current = seed()
    setDb(ref.current)
  }, [])
  const can = useCallback((p: Perm) => canRole(db.role, p), [db.role])

  return (
    <StoreCtx.Provider value={{ db, run, reset, toast, can }}>
      {children}
      {toastMsg && (
        <div className={`fixed bottom-5 left-5 z-50 max-w-md rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${toastMsg.tone === 'ok' ? 'bg-navy' : 'bg-red-600'}`}>
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
