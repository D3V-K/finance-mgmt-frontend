import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { normalizeApiError } from '@/api/errors'
import { useCategories, useCategoryTree, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/api/hooks/categories'
import type { Category, CategoryCreateDto, CategoryTree, CategoryType } from '@/api/types'
import { CategoryBadge } from '@/components/categories/CategoryBadge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be 100 characters or fewer.'),
  type: z.enum(['income', 'expense']),
  parent_id: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid color.'),
})
type FormValues = z.infer<typeof schema>

function flattenTree(nodes: CategoryTree[]) {
  const result: Category[] = []
  const visit = (node: CategoryTree) => { result.push(node); node.children.forEach(visit) }
  nodes.forEach(visit)
  return result
}

function descendantIds(nodes: CategoryTree[], id: string): Set<string> {
  const result = new Set<string>()
  const find = (node: CategoryTree): boolean => {
    if (node.id === id) { const add = (child: CategoryTree) => { result.add(child.id); child.children.forEach(add) }; node.children.forEach(add); return true }
    return node.children.some(find)
  }
  nodes.some(find)
  return result
}

function CategoryForm({ category, categories, tree, onDone }: { category: Category | null; categories: Category[]; tree: CategoryTree[]; onDone: () => void }) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const mutation = category ? update : create
  const [submitError, setSubmitError] = useState('')
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: category?.name ?? '', type: category?.type ?? 'expense', parent_id: category?.parent_id ?? '', color: category?.color ?? (category?.type === 'income' ? '#059669' : '#e11d48') },
  })
  const selectedType = watch('type')
  const excluded = category ? new Set([category.id, ...descendantIds(tree, category.id)]) : new Set<string>()
  const parents = categories.filter((item) => item.type === selectedType && !excluded.has(item.id))
  const submit = async (values: FormValues) => {
    setSubmitError('')
    const payload: CategoryCreateDto = { name: values.name.trim(), type: values.type, parent_id: values.parent_id || null, color: values.color }
    try {
      if (category) await update.mutateAsync({ id: category.id, payload })
      else await create.mutateAsync(payload)
      onDone()
    } catch (error) { setSubmitError(normalizeApiError(error).message) }
  }
  return <form onSubmit={handleSubmit(submit)} className="space-y-4">
    {submitError && <Alert>{submitError}</Alert>}
    <Input id="category-name" label="Name" autoFocus {...register('name')} error={errors.name?.message} />
    <Select id="category-type" label="Type" {...register('type')} error={errors.type?.message}>
      <option value="expense">Expense</option><option value="income">Income</option>
    </Select>
    <Select id="category-parent" label="Parent (optional)" {...register('parent_id')} error={errors.parent_id?.message}>
      <option value="">No parent</option>
      {parents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select>
    <div><label htmlFor="category-color" className="block text-sm font-medium text-slate-700">Color</label><input id="category-color" type="color" className="mt-1.5 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1" {...register('color')} /><p className="mt-1 text-xs text-slate-500">Used to identify this category in lists and reports.</p>{errors.color && <p className="mt-1 text-sm text-red-700">{errors.color.message}</p>}</div>
    <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button><Button type="submit" loading={mutation.isPending}>{category ? 'Save changes' : 'Create category'}</Button></div>
  </form>
}

function TreeRow({ node, depth, onEdit, onDelete }: { node: CategoryTree; depth: number; onEdit: (category: Category) => void; onDelete: (category: Category) => void }) {
  return <li>
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
      {depth > 0 && <span className="text-slate-300" aria-hidden="true">↳</span>}<CategoryBadge category={node} />
      <span className="ml-auto flex gap-1"><Button variant="ghost" className="px-3" onClick={() => onEdit(node)}>Edit</Button><Button variant="ghost" className="px-3 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onDelete(node)}>Delete</Button></span>
    </div>
    {node.children.length > 0 && <ul>{node.children.map((child) => <TreeRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />)}</ul>}
  </li>
}

export function CategoriesPage() {
  const treeQuery = useCategoryTree()
  const listQuery = useCategories()
  const remove = useDeleteCategory()
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const tree = useMemo(() => treeQuery.data ?? [], [treeQuery.data])
  const categories = useMemo(() => listQuery.data ?? flattenTree(tree), [listQuery.data, tree])
  const groups = (['expense', 'income'] as CategoryType[]).map((type) => ({ type, nodes: tree.filter((node) => node.type === type) }))
  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteError('')
    try { await remove.mutateAsync(deleting.id); setDeleting(null) }
    catch (error) {
      const apiError = normalizeApiError(error)
      setDeleteError(apiError.status === 409 || apiError.kind === 'validation' ? 'This category is in use or has child categories. Move those transactions or child categories first, then try again.' : apiError.message)
    }
  }
  if (treeQuery.isLoading) return <div aria-label="Loading categories" className="space-y-4"><Skeleton className="h-10 w-64"/><Skeleton className="h-48 w-full"/><Skeleton className="h-48 w-full"/></div>
  if (treeQuery.isError) return <div className="space-y-4"><Alert>Could not load categories. {normalizeApiError(treeQuery.error).message}</Alert><Button variant="secondary" onClick={() => treeQuery.refetch()}>Try again</Button></div>
  return <section aria-labelledby="categories-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="categories-heading" className="text-2xl font-bold tracking-tight">Category management</h2><p className="mt-1 text-sm text-slate-600">Organize income and expenses into groups for clearer reports.</p></div><Button onClick={() => setEditing(null)}>New category</Button></div>
    {tree.length === 0 ? <EmptyState title="No categories yet" description="Create an income or expense category to start organizing transactions." action={<Button onClick={() => setEditing(null)}>Create category</Button>} /> : <div className="grid gap-6 lg:grid-cols-2">{groups.map(({ type, nodes }) => <section key={type} aria-labelledby={`${type}-heading`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-4"><h3 id={`${type}-heading`} className="font-semibold">{type === 'expense' ? 'Expense categories' : 'Income categories'}</h3><p className="text-xs text-slate-500">{nodes.length} top-level {nodes.length === 1 ? 'category' : 'categories'}</p></div>{nodes.length ? <ul>{nodes.map((node) => <TreeRow key={node.id} node={node} depth={0} onEdit={setEditing} onDelete={setDeleting} />)}</ul> : <p className="px-4 py-8 text-center text-sm text-slate-500">No {type} categories.</p>}</section>)}</div>}
    <Dialog open={editing !== undefined} title={editing ? 'Edit category' : 'Create category'} onClose={() => setEditing(undefined)}>{editing !== undefined && <CategoryForm key={editing?.id ?? 'new'} category={editing} categories={categories} tree={tree} onDone={() => setEditing(undefined)} />}</Dialog>
    <Dialog open={!!deleting} title="Delete category?" onClose={() => { if (!remove.isPending) { setDeleting(null); setDeleteError('') } }}><div className="space-y-4">{deleteError && <Alert>{deleteError}</Alert>}<p className="text-sm text-slate-600">Delete <strong>{deleting?.name}</strong>? This cannot be undone. Categories with transactions or children cannot be deleted.</p><div className="flex justify-end gap-3"><Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} onClick={confirmDelete}>Delete category</Button></div></div></Dialog>
  </section>
}
