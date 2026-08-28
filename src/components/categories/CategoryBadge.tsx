import type { Category, CategoryType } from '@/api/types'

const typeStyles: Record<CategoryType, string> = {
  INCOME: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  EXPENSE: 'bg-rose-50 text-rose-800 ring-rose-200',
}

export function CategoryBadge({ category, showType = false }: { category: Pick<Category, 'name' | 'type' | 'color'>; showType?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${typeStyles[category.type]}`}>
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color ?? (category.type === 'INCOME' ? '#059669' : '#e11d48') }} aria-hidden="true" />
    {category.name}{showType && <span className="font-normal opacity-75">· {category.type === 'INCOME' ? 'Income' : 'Expense'}</span>}
  </span>
}
