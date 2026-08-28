import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'

type FieldProps = { label: string; error?: string; id: string }

export const Input = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function Input({ label, error, id, className = '', ...props }, ref) {
  const errorId = `${id}-error`
  return <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <input ref={ref} id={id} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} className={`mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`} {...props} />
    {error && <p id={errorId} className="mt-1 text-sm text-red-700">{error}</p>}
  </div>
})

export const Select = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement>>(function Select({ label, error, id, children, className = '', ...props }, ref) {
  const errorId = `${id}-error`
  return <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <select ref={ref} id={id} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} className={`mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`} {...props}>{children}</select>
    {error && <p id={errorId} className="mt-1 text-sm text-red-700">{error}</p>}
  </div>
})
