import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { nextNumber, uid, useStore } from './store'
import type { DB } from './types'

type DocKey = 'depRuns' | 'transfers' | 'disposals' | 'revaluations' | 'maintenance'

/** Local editable copy of a document plus a persist() that writes it (and any side effects) to the store. */
export function useDoc<K extends DocKey>(key: K, prefix: string, route: string, blank: () => Omit<DB[K][number], 'id' | 'number'>) {
  type Item = DB[K][number]
  const { id } = useParams()
  const nav = useNavigate()
  const { db, update } = useStore()
  const list = db[key] as Item[]
  const existing = list.find((d) => d.id === id)
  const [doc, setDoc] = useState<Item>(() =>
    existing ? structuredClone(existing) : ({ ...blank(), id: '', number: nextNumber(prefix, list) } as Item),
  )

  const persist = (next: Item, effect?: (db: DB, saved: Item) => void) => {
    const saved = (next.id ? next : { ...next, id: uid() }) as Item
    update((d) => {
      const arr = d[key] as Item[]
      const i = arr.findIndex((x) => x.id === saved.id)
      if (i >= 0) arr[i] = saved
      else arr.push(saved)
      effect?.(d, saved)
    })
    setDoc(saved)
    if (!next.id) nav(`${route}/${saved.id}`, { replace: true })
    return saved
  }

  const remove = () => update((d) => { (d[key] as Item[]).splice((d[key] as Item[]).findIndex((x) => x.id === doc.id), 1) })

  return { db, doc, setDoc, persist, remove, isNew: !existing }
}
