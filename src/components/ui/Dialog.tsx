import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [onClose, open])
  if (!open) return null
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl outline-none"><div className="flex items-start justify-between gap-4"><h2 id="dialog-title" className="text-lg font-semibold text-slate-900">{title}</h2><Button variant="ghost" className="-mr-2 -mt-2 px-3" onClick={onClose} aria-label="Close dialog">×</Button></div><div className="mt-4">{children}</div></div></div>
}
