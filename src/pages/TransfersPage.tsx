import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { normalizeApiError } from '@/api/errors'
import { useCreateTransfer, useDeleteTransfer, useTransfers } from '@/api/hooks/transfers'
import type { Transfer } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate, tokyoToday } from '@/utils/reporting'

const directions = { bank: 'Bank to Cash (withdrawal)', cash: 'Cash to Bank (deposit)' }
const schema = z.object({
  from_account: z.enum(['bank', 'cash']),
  amount: z.coerce.number().int('Amount must be a whole number.').positive('Amount must be greater than zero.').max(Number.MAX_SAFE_INTEGER, 'Amount is too large.'),
  transfer_date: z.string().min(1, 'Date is required.').refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Enter a valid date.'),
  description: z.string().trim(),
})
type FormValues = z.infer<typeof schema>

function TransferForm({ onDone, onPending }: { onDone: () => void; onPending: (pending: boolean) => void }) {
  const create = useCreateTransfer()
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { from_account: 'bank', amount: 0, transfer_date: tokyoToday(), description: '' } })
  const submit = async (values: FormValues) => {
    if (submitting.current) return
    submitting.current = true
    onPending(true)
    setError('')
    try {
      await create.mutateAsync({ ...values, to_account: values.from_account === 'bank' ? 'cash' : 'bank', description: values.description || null })
      onDone()
    } catch (cause) { setError(normalizeApiError(cause).message) }
    finally { submitting.current = false; onPending(false) }
  }
  return <form noValidate onSubmit={handleSubmit(submit)} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <Select id="transfer-direction" label="Direction" {...register('from_account')}><option value="bank">{directions.bank}</option><option value="cash">{directions.cash}</option></Select>
    <Input id="transfer-amount" label="Amount (JPY)" type="number" min="1" step="1" inputMode="numeric" {...register('amount')} error={errors.amount?.message}/>
    <Input id="transfer-date" label="Date" type="date" {...register('transfer_date')} error={errors.transfer_date?.message}/>
    <Input id="transfer-description" label="Description (optional)" {...register('description')}/>
    <div className="flex justify-end"><Button type="submit" loading={create.isPending}>Create transfer</Button></div>
  </form>
}

export function TransfersPage() {
  const [params, setParams] = useSearchParams()
  const parsedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const rangeError = (from && !isValidISODate(from)) || (to && !isValidISODate(to)) ? 'Enter valid filter dates.' : from && to && from > to ? 'From date must be on or before To date.' : ''
  const query = useTransfers({ ...(params.get('from') ? { from: params.get('from')! } : {}), ...(params.get('to') ? { to: params.get('to')! } : {}), page, page_size: 20 }, !rangeError)
  const remove = useDeleteTransfer()
  const deletePending = useRef(false)
  const [creating, setCreating] = useState(false)
  const [creatingPending, setCreatingPending] = useState(false)
  const [deleting, setDeleting] = useState<Transfer | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [feedback, setFeedback] = useState('')
  const updateFilter = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); next.delete('page'); return next }, { replace: true })
  const changePage = (nextPage: number) => setParams((current) => { const next = new URLSearchParams(current); if (nextPage > 1) next.set('page', String(nextPage)); else next.delete('page'); return next })
  const confirmDelete = async () => {
    if (!deleting || deletePending.current) return
    deletePending.current = true
    setDeleteError('')
    try { await remove.mutateAsync(deleting.id); setDeleting(null); setFeedback('Transfer deleted.'); if (query.data?.items.length === 1 && page > 1) changePage(page - 1) }
    catch (cause) { setDeleteError(normalizeApiError(cause).message) }
    finally { deletePending.current = false }
  }
  const filtered = params.has('from') || params.has('to')
  const response = query.data
  return <section aria-labelledby="transfers-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="transfers-heading" className="text-2xl font-bold tracking-tight">Transfers</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Move money between your Bank and Cash accounts. Transfers do not affect income, expenses, net cash flow, or total balance.</p></div><Button onClick={() => setCreating(true)}>New transfer</Button></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <Input id="transfer-from" label="From" type="date" value={params.get('from') ?? ''} onChange={(event) => updateFilter('from', event.target.value)}/>
      <Input id="transfer-to" label="To" type="date" value={params.get('to') ?? ''} onChange={(event) => updateFilter('to', event.target.value)}/>
      {filtered && <Button variant="ghost" onClick={() => setParams({})}>Clear filters</Button>}
    </div>
    {rangeError ? <Alert>{rangeError}</Alert> : query.isLoading ? <div aria-label="Loading transfers"><Skeleton className="h-72 w-full"/></div> : query.isError ? <div className="space-y-4"><Alert>Could not load transfers. {normalizeApiError(query.error).message}</Alert><Button variant="secondary" onClick={() => query.refetch()}>Try again</Button></div> : !response?.items.length ? <EmptyState title={filtered ? 'No matching transfers' : 'No transfers yet'} description={filtered ? 'Try changing or clearing your filters.' : 'Record a withdrawal or deposit between your accounts.'}/> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200"><caption className="sr-only">Transfer history</caption><thead className="bg-slate-50"><tr>{['Date', 'Direction', 'Description', 'Amount', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{response.items.map((transfer) => <tr key={transfer.id}>
      <td className="whitespace-nowrap px-4 py-3 text-sm">{formatDate(transfer.transfer_date)}</td><td className="px-4 py-3 text-sm">{directions[transfer.from_account]}</td><td className="max-w-xs break-words px-4 py-3 text-sm">{transfer.description || '—'}</td><td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold">{formatJPY(transfer.amount)}</td><td className="px-4 py-3"><Button variant="ghost" onClick={() => { setDeleteError(''); setDeleting(transfer) }}>Delete</Button></td>
    </tr>)}</tbody></table></div>}
    {((response?.total_pages ?? 0) > 1 || page > 1) && <nav aria-label="Transfer pages" className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-600">Page {page} of {Math.max(response?.total_pages ?? 1, page)} · {response?.total ?? 0} transfers</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= (response?.total_pages ?? 1) || query.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div></nav>}
    <Dialog open={creating} title="Create transfer" onClose={() => { if (!creatingPending) setCreating(false) }}>{creating && <TransferForm onPending={setCreatingPending} onDone={() => { setCreating(false); setFeedback('Transfer created.') }}/>}</Dialog>
    <Dialog open={!!deleting} title="Delete transfer?" onClose={() => { if (!deletePending.current) setDeleting(null) }}><div className="space-y-4">{deleteError && <Alert>{deleteError}</Alert>}<p className="text-sm text-slate-600">Delete {deleting ? directions[deleting.from_account] : 'this transfer'} for {deleting ? formatJPY(deleting.amount) : ''}? This cannot be undone.</p><div className="flex justify-end gap-3"><Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={remove.isPending} onClick={confirmDelete}>Delete transfer</Button></div></div></Dialog>
  </section>
}
