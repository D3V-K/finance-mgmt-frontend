import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { normalizeApiError } from '@/api/errors'
import { useCategories } from '@/api/hooks/categories'
import { useCreateTransaction, useDeleteTransaction, useTransactions, useUpdateTransaction } from '@/api/hooks/transactions'
import type { Category, CategoryType, Transaction, TransactionCreateDto, TransactionFilter } from '@/api/types'
import { CategoryBadge } from '@/components/categories/CategoryBadge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { formatDate, formatJPY } from '@/utils/format'

const PAGE_SIZE = 20
const formSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: 'Enter a valid amount.' }).int('Amount must be a whole number.').positive('Amount must be greater than zero.').max(999_999_999_999, 'Amount is too large.'),
  transaction_date: z.string().min(1, 'Date is required.').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date.'),
  category_id: z.string().min(1, 'Category is required.'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer.'),
})
type FormValues = z.infer<typeof formSchema>

function TransactionForm({ transaction, categories, onDone }: { transaction: Transaction | null; categories: Category[]; onDone: (message?: string) => void }) {
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const mutation = transaction ? update : create
  const [submitError, setSubmitError] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: transaction?.amount ?? 0, transaction_date: transaction?.transaction_date ?? new Date().toISOString().slice(0, 10), category_id: transaction?.category_id ?? '', description: transaction?.description ?? '' },
  })
  const submit = async (values: FormValues) => {
    setSubmitError('')
    const payload: TransactionCreateDto = { amount: values.amount, transaction_date: values.transaction_date, category_id: values.category_id, description: values.description.trim() || null }
    try {
      if (transaction) await update.mutateAsync({ id: transaction.id, payload })
      else await create.mutateAsync(payload)
      onDone(transaction ? 'Transaction updated.' : 'Transaction created.')
    } catch (error) { setSubmitError(normalizeApiError(error).message) }
  }
  return <form onSubmit={handleSubmit(submit)} className="space-y-4">
    {submitError && <Alert>{submitError}</Alert>}
    <Input id="transaction-amount" label="Amount (JPY)" type="number" min="1" step="1" inputMode="numeric" autoFocus {...register('amount')} error={errors.amount?.message} />
    <Input id="transaction-date" label="Date" type="date" {...register('transaction_date')} error={errors.transaction_date?.message} />
    <Select id="transaction-category" label="Category" {...register('category_id')} error={errors.category_id?.message}><option value="">Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.type === 'income' ? 'Income' : 'Expense'})</option>)}</Select>
    <Input id="transaction-description" label="Description (optional)" maxLength={500} {...register('description')} error={errors.description?.message} />
    <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={mutation.isPending}>{transaction ? 'Save changes' : 'Create transaction'}</Button></div>
  </form>
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const filters: TransactionFilter = useMemo(() => ({
    ...(params.get('from') ? { from: params.get('from')! } : {}), ...(params.get('to') ? { to: params.get('to')! } : {}),
    ...(params.get('category_id') ? { category_id: params.get('category_id')! } : {}), ...(params.get('type') === 'income' || params.get('type') === 'expense' ? { type: params.get('type') as CategoryType } : {}),
    ...(params.get('search') ? { search: params.get('search')!.trim() } : {}), page, page_size: PAGE_SIZE,
  }), [params, page])
  const transactionsQuery = useTransactions(filters)
  const categoriesQuery = useCategories()
  const remove = useDeleteTransaction()
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [feedback, setFeedback] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const updateFilter = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); next.delete('page'); return next }, { replace: true })
  const clearFilters = () => setParams({}, { replace: true })
  const confirmDelete = async () => {
    if (!deleting || remove.isPending) return
    setDeleteError('')
    try { await remove.mutateAsync(deleting.id); setDeleting(null); setFeedback('Transaction deleted.') }
    catch (error) { setDeleteError(normalizeApiError(error).message) }
  }
  const closeForm = (message?: string) => { setEditing(undefined); if (message) setFeedback(message) }
  if (transactionsQuery.isLoading || categoriesQuery.isLoading) return <div aria-label="Loading transactions" className="space-y-4"><Skeleton className="h-10 w-64"/><Skeleton className="h-28 w-full"/><Skeleton className="h-72 w-full"/></div>
  if (transactionsQuery.isError || categoriesQuery.isError) { const error = transactionsQuery.error ?? categoriesQuery.error; return <div className="space-y-4"><Alert>Could not load transactions. {normalizeApiError(error).message}</Alert><Button variant="secondary" onClick={() => { transactionsQuery.refetch(); categoriesQuery.refetch() }}>Try again</Button></div> }
  const response = transactionsQuery.data
  const transactions = response?.items ?? []
  const hasFilters = ['from', 'to', 'category_id', 'type', 'search'].some((key) => params.has(key))
  return <section aria-labelledby="transactions-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="transactions-heading" className="text-2xl font-bold tracking-tight">Transactions</h2><p className="mt-1 text-sm text-slate-600">Review and manage money moving in and out.</p></div><Button onClick={() => setEditing(null)} disabled={!categories.length}>New transaction</Button></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {!categories.length && <Alert tone="info">Create a category before adding a transaction.</Alert>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Input id="filter-from" label="From" type="date" value={params.get('from') ?? ''} onChange={(event) => updateFilter('from', event.target.value)} />
      <Input id="filter-to" label="To" type="date" value={params.get('to') ?? ''} onChange={(event) => updateFilter('to', event.target.value)} />
      <Select id="filter-type" label="Type" value={params.get('type') ?? ''} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></Select>
      <Select id="filter-category" label="Category" value={params.get('category_id') ?? ''} onChange={(event) => updateFilter('category_id', event.target.value)}><option value="">All categories</option>{categories.filter((category) => !params.get('type') || category.type === params.get('type')).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
      <Input id="filter-search" label="Description" type="search" placeholder="Search transactions" value={params.get('search') ?? ''} onChange={(event) => updateFilter('search', event.target.value)} />
    </div>{hasFilters && <div className="mt-3 flex justify-end"><Button variant="ghost" onClick={clearFilters}>Clear filters</Button></div>}</div>
    {!transactions.length ? <EmptyState title={hasFilters ? 'No matching transactions' : 'No transactions yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Add your first income or expense transaction.'} action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : (categories.length ? <Button onClick={() => setEditing(null)}>Add transaction</Button> : undefined)} /> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr>{['Date', 'Type', 'Category', 'Description', 'Amount', 'Actions'].map((heading) => <th key={heading} scope="col" className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${heading === 'Amount' ? 'text-right' : ''}`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{transactions.map((transaction) => { const category = categoryMap.get(transaction.category_id); return <tr key={transaction.id}><td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{formatDate(transaction.transaction_date)}</td><td className="px-4 py-3 text-sm">{category?.type === 'income' ? 'Income' : 'Expense'}</td><td className="px-4 py-3">{category ? <CategoryBadge category={category}/> : <span className="text-sm text-slate-500">Unknown</span>}</td><td className="max-w-xs truncate px-4 py-3 text-sm text-slate-700">{transaction.description || <span className="text-slate-400">—</span>}</td><td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${category?.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{category?.type === 'income' ? '+' : '−'}{formatJPY(transaction.amount)}</td><td className="whitespace-nowrap px-4 py-3"><div className="flex gap-1"><Button variant="ghost" className="px-3" onClick={() => setEditing(transaction)}>Edit</Button><Button variant="ghost" className="px-3 text-red-700 hover:bg-red-50" onClick={() => setDeleting(transaction)}>Delete</Button></div></td></tr> })}</tbody></table></div></div>}
    {(response?.total_pages ?? 0) > 1 && <nav aria-label="Transaction pages" className="flex items-center justify-between gap-4"><p className="text-sm text-slate-600">Page {response?.page} of {response?.total_pages} · {response?.total} transactions</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page - 1)); return next })}>Previous</Button><Button variant="secondary" disabled={page >= (response?.total_pages ?? 1)} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(page + 1)); return next })}>Next</Button></div></nav>}
    <Dialog open={editing !== undefined} title={editing ? 'Edit transaction' : 'Create transaction'} onClose={() => closeForm()}>{editing !== undefined && <TransactionForm key={editing?.id ?? 'new'} transaction={editing} categories={categories} onDone={closeForm}/>}</Dialog>
    <Dialog open={!!deleting} title="Delete transaction?" onClose={() => { if (!remove.isPending) { setDeleting(null); setDeleteError('') } }}><div className="space-y-4">{deleteError && <Alert>{deleteError}</Alert>}<p className="text-sm text-slate-600">Delete <strong>{deleting?.description || 'this transaction'}</strong> for {deleting ? formatJPY(deleting.amount) : ''}? This cannot be undone.</p><div className="flex justify-end gap-3"><Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} onClick={confirmDelete}>Delete transaction</Button></div></div></Dialog>
  </section>
}
