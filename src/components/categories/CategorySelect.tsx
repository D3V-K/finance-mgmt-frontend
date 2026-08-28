import type { SelectHTMLAttributes } from 'react'
import type { Category, CategoryType } from '@/api/types'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  categories: Category[]
  label: string
  error?: string
  type?: CategoryType
  placeholder?: string
}

export function CategorySelect({ categories, label, error, type, placeholder = 'Select a category', id = 'category', ...props }: Props) {
  const options = categories.filter((category) => !type || category.type === type)
  return <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <select id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" {...props}>
      <option value="">{placeholder}</option>
      {options.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.type === 'INCOME' ? 'Income' : 'Expense'})</option>)}
    </select>
    {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{error}</p>}
  </div>
}
