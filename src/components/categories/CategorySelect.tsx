import { forwardRef, type SelectHTMLAttributes } from 'react'
import type { Category, CategoryType } from '@/api/types'
import { Select } from '@/components/ui/FormControls'

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  categories: Category[]
  label: string
  error?: string
  type?: CategoryType
  placeholder?: string
}

// Keep parents before children even when the API list is unordered. Full paths
// remain readable in the closed native picker and distinguish duplicate names.
function categoryOptions(categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const children = new Map<string, Category[]>()
  for (const category of categories) {
    if (!category.parent_id || !byId.has(category.parent_id)) continue
    const siblings = children.get(category.parent_id) ?? []
    siblings.push(category)
    children.set(category.parent_id, siblings)
  }
  const result: Array<{ category: Category; label: string }> = []
  const visited = new Set<string>()
  const visit = (category: Category, ancestors: string[]) => {
    if (visited.has(category.id)) return
    visited.add(category.id)
    const path = [...ancestors, category.name]
    result.push({ category, label: path.join(' › ') })
    for (const child of children.get(category.id) ?? []) visit(child, path)
  }
  for (const category of categories) {
    if (!category.parent_id || !byId.has(category.parent_id)) visit(category, [])
  }
  // Preserve selectable values even if a stale response contains a cycle.
  for (const category of categories) visit(category, [])
  return result
}

export const CategorySelect = forwardRef<HTMLSelectElement, Props>(function CategorySelect({ categories, label, error, type, placeholder = 'Select a category', id = 'category', ...props }, ref) {
  return <Select ref={ref} id={id} label={label} error={error} {...props}>
    <option value="">{placeholder}</option>
    {(['income', 'expense'] as const).filter((group) => !type || type === group).map((group) => {
      const options = categoryOptions(categories.filter((category) => category.type === group))
      return options.length > 0 && <optgroup key={group} label={group === 'income' ? 'Income' : 'Expenses'}>
        {options.map(({ category, label: path }) => <option key={category.id} value={category.id}>{path}</option>)}
      </optgroup>
    })}
  </Select>
})
