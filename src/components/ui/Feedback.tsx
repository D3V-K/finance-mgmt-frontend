import type { ReactNode } from 'react'

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const styles = { error: 'bg-red-50 text-red-800 ring-red-200', info: 'bg-blue-50 text-blue-800 ring-blue-200', success: 'bg-emerald-50 text-emerald-800 ring-emerald-200' }
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg p-3 text-sm ring-1 ${styles[tone]}`}>{children}</div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-3 text-sm text-slate-600" role="status"><span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-r-transparent" aria-hidden="true" /><span>{label}</span></div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-xl" aria-hidden="true">◇</div><h2 className="mt-4 font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>{action && <div className="mt-5">{action}</div>}</div>
}
