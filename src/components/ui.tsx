import { ChevronDown, Save, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Tone } from '../data/format'

export function Card({ title, actions, children, className = '', pad = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

export function Field({ label, required, children, span = 1, hint }: {
  label: string; required?: boolean; children: ReactNode; span?: number; hint?: string
}) {
  const spans: Record<number, string> = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-3', 5: 'md:col-span-5' }
  return (
    <label className={`flex flex-col gap-1 ${spans[span] ?? ''}`}>
      <span className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="ms-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}

export const FormGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-5">{children}</div>
)

export function Select<T extends string>({ value, onChange, options, disabled, placeholder }: {
  value: T | ''; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean; placeholder?: string
}) {
  return (
    <div className="relative">
      <select
        className="inp appearance-none pe-7"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2 top-2 h-4 w-4 text-gray-400" />
    </div>
  )
}

export const ReadOnly = ({ children, ltr }: { children: ReactNode; ltr?: boolean }) => (
  <div className={`inp-ro ${ltr ? 'justify-end tabular-nums' : ''}`} dir={ltr ? 'ltr' : undefined}>{children}</div>
)

export function NumInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <input
      className="inp text-end tabular-nums"
      dir="ltr"
      inputMode="numeric"
      disabled={disabled}
      value={Number.isFinite(value) ? value.toLocaleString('en-US') : ''}
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.-]/g, '')) || 0)}
    />
  )
}

const toneCls: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
}
export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneCls[tone]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {children}
  </span>
)

export function Tabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; icon?: LucideIcon; count?: number }[]; active: T; onChange: (t: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-x-1 border-b border-line px-2">
      {tabs.map((t) => {
        const on = t.id === active
        const Icon = t.icon
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
              on ? 'border-navy font-semibold text-navy' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-500">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Dropdown({ label, icon: Icon, items, primary }: {
  label: string; icon?: LucideIcon; primary?: boolean
  items: { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`btn ${primary ? 'btn-primary' : ''}`} onClick={() => setOpen((o) => !o)}>
        {Icon && <Icon className="h-4 w-4" />}
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute end-0 top-9 z-30 min-w-[190px] rounded-md border border-line bg-white py-1 shadow-lg">
          {items.map((it) => {
            const I = it.icon
            return (
              <button
                key={it.label}
                type="button"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick() }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-gray-50 disabled:opacity-40 ${it.danger ? 'text-red-600' : 'text-gray-700'}`}
              >
                {I && <I className="h-4 w-4" />}
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-20" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export const Empty = ({ text }: { text: string }) => (
  <div className="py-10 text-center text-sm text-gray-400">{text}</div>
)

export function Confirm({ title, text, onYes, onClose, danger }: {
  title: string; text: string; onYes: () => void; onClose: () => void; danger?: boolean
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>تراجع</button>
          <button type="button" className={`btn ${danger ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`} onClick={() => { onYes(); onClose() }}>
            تأكيد
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{text}</p>
    </Modal>
  )
}

export function SaveSplit({ onSave, items, disabled }: {
  onSave: () => void; disabled?: boolean
  items: { label: string; onClick: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative flex" ref={ref}>
      <button type="button" disabled={disabled} onClick={onSave} className="btn btn-primary rounded-e-none">
        <Save className="h-4 w-4" />حفظ
      </button>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="btn btn-primary rounded-s-none border-s border-s-white/20 px-1.5">
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute end-0 top-9 z-30 min-w-[170px] rounded-md border border-line bg-white py-1 shadow-lg">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick() }} className="block w-full px-3 py-1.5 text-start text-sm text-gray-700 hover:bg-gray-50">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
