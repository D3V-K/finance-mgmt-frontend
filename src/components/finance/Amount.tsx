import type { ReactNode } from 'react'
import type { MaybeYen } from '@/api/types'
import { formatJPY } from '@/utils/format'

/** Unknown money is shown as an explicit review state, never as ¥0. */
export function Amount({ value, unknown = 'Needs review', className = '' }: { value: MaybeYen | undefined; unknown?: string; className?: string }) {
  if (value === null || value === undefined) return <span className={`font-medium text-amber-800 ${className}`}>{unknown}</span>
  return <span className={value < 0 ? `text-rose-700 ${className}` : className}>{value < 0 ? `−${formatJPY(-value)}` : formatJPY(value)}{value < 0 && <span className="sr-only"> (negative)</span>}</span>
}

export function StatusBadge({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'error'; children: ReactNode }) {
  const styles = { ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200', warn: 'bg-amber-50 text-amber-900 ring-amber-200', muted: 'bg-slate-100 text-slate-700 ring-slate-200', error: 'bg-rose-50 text-rose-800 ring-rose-200' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${styles[tone]}`}>{children}</span>
}
