import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useAccounts, useEntryOptions } from '@/api/hooks/accounts'
import { useAllocations, useCreateBucket, useCreateGoal, useFundBucket, useSavingsGoals, useUpdateGoal } from '@/api/hooks/planning'
import { useSingleFlight } from '@/api/idempotency'
import type { Account, AllocationSummary, Bucket, ISODate, SavingsGoal } from '@/api/types'
import { Amount, StatusBadge } from '@/components/finance/Amount'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

const WHOLE = /^\d+$/
const positive = (value: string) => WHOLE.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value))

function conflictText(error: unknown) {
  const apiError = normalizeApiError(error)
  if (apiError.kind !== 'conflict') return apiError.message
  return /insufficient/i.test(apiError.message)
    ? 'That account doesn’t have enough unreserved money. Nothing was set aside. Card reserves and other savings already use part of it; the figures below have been refreshed.'
    : `${apiError.message}. Nothing was changed; the figures below have been refreshed.`
}

function GoalForm({ goal, onDone }: { goal: SavingsGoal | null; onDone: (message?: string) => void }) {
  const create = useCreateGoal()
  const update = useUpdateGoal()
  const once = useSingleFlight()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target) : '')
  const [date, setDate] = useState(goal?.target_date ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Give the goal a name.'
    if (!WHOLE.test(target)) next.target = 'Enter a whole number of yen.'
    if (date && !isValidISODate(date)) next.date = 'Enter a valid date or leave it blank.'
    setErrors(next)
    if (Object.keys(next).length) return
    const payload = { name: name.trim(), target: Number(target), target_date: date || null }
    void once(async () => {
      try {
        if (goal) await update.mutateAsync({ id: goal.id, payload })
        else await create.mutateAsync(payload)
        onDone(goal ? 'Goal updated.' : 'Goal added. Set money aside for it with a savings bucket.')
      } catch (error) { setErrors({ submit: normalizeApiError(error).message }) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {errors.submit && <Alert>{errors.submit}</Alert>}
    {!goal && <div className="flex flex-wrap gap-2 text-sm"><span className="text-slate-600">Start from a name:</span>{['Emergency fund', 'Travel', 'Large purchase'].map((label) => <button key={label} type="button" className="rounded-full bg-slate-100 px-3 py-1 font-medium hover:bg-slate-200" onClick={() => setName(label)}>{label}</button>)}</div>}
    <Input id="goal-name" label="Goal name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
    <Input id="goal-target" label="Target (JPY)" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} error={errors.target} />
    <Input id="goal-date" label="Target date (optional)" type="date" value={date} onChange={(event) => setDate(event.target.value)} error={errors.date} />
    <p className="text-xs text-slate-500">A target is what you are aiming for. Only money you actually set aside counts as funded.</p>
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={pending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={pending}>{goal ? 'Save goal' : 'Add goal'}</Button></div>
  </form>
}

function BucketForm({ goals, onDone }: { goals: SavingsGoal[]; onDone: (message?: string) => void }) {
  const create = useCreateBucket()
  const once = useSingleFlight()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [goal, setGoal] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !WHOLE.test(target)) { setError('Enter a name and a whole yen target.'); return }
    void once(async () => {
      setError('')
      try { await create.mutateAsync({ name: name.trim(), target: Number(target), goal_id: goal || null }); onDone('Bucket added.') }
      catch (cause) { setError(normalizeApiError(cause).message) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <Input id="bucket-name" label="Bucket name" value={name} onChange={(event) => setName(event.target.value)} />
    <Input id="bucket-target" label="Amount to set aside (JPY)" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value)} />
    <Select id="bucket-goal" label="Counts toward goal (optional)" value={goal} onChange={(event) => setGoal(event.target.value)}><option value="">No goal</option>{goals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={create.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={create.isPending}>Add bucket</Button></div>
  </form>
}

type Move = 'fund' | 'release' | 'reassign'

function MoveForm({ bucket, move, buckets, accounts, allocations, today, onDone, onConflict }: { bucket: Bucket; move: Move; buckets: Bucket[]; accounts: Account[]; allocations: AllocationSummary; today: ISODate; onDone: (message?: string) => void; onConflict: () => void }) {
  const fund = useFundBucket()
  const once = useSingleFlight()
  const [account, setAccount] = useState('')
  const [amount, setAmount] = useState(move === 'fund' ? String(bucket.shortfall || '') : String(bucket.funded || ''))
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const available = new Map(allocations.accounts.map((row) => [row.account_id, row]))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!account || !positive(amount) || (move === 'reassign' && !target)) { setError(move === 'reassign' ? 'Choose the account, an amount and the bucket to move it to.' : 'Choose an account and a whole yen amount.'); return }
    const value = Number(amount)
    void once(async () => {
      setError('')
      let released = false
      try {
        if (move === 'fund') await fund.mutateAsync({ id: bucket.id, payload: { account_id: account, amount: value, as_of_date: today } })
        else {
          await fund.mutateAsync({ id: bucket.id, payload: { account_id: account, amount: -value, as_of_date: today } })
          released = true
          if (move === 'reassign') await fund.mutateAsync({ id: target, payload: { account_id: account, amount: value, as_of_date: today } })
        }
        onDone(move === 'fund' ? `${formatJPY(value)} set aside for ${bucket.name}.` : move === 'release' ? `${formatJPY(value)} released from ${bucket.name}; it is available again.` : `${formatJPY(value)} moved to ${buckets.find((item) => item.id === target)?.name}.`)
      } catch (cause) {
        if (normalizeApiError(cause).kind === 'conflict') onConflict()
        setError(`${released ? `${formatJPY(value)} was released from ${bucket.name} but could not be set aside for the other bucket; it is now unreserved. ` : ''}${conflictText(cause)}`)
      }
    })
  }
  const verb = { fund: 'Set aside', release: 'Release', reassign: 'Move' }[move]
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">{move === 'fund' ? 'This earmarks money already in the account. Nothing is transferred, and it is not spending.' : move === 'release' ? 'Released money becomes available to spend again. Nothing is transferred.' : 'Moves an earmark from this bucket to another. Nothing is transferred between accounts.'} To move money into a separate savings account, record a transfer instead; that isn’t another allocation.</p>
    <Select id="move-account" label={move === 'fund' ? 'From money in' : 'Held in'} value={account} onChange={(event) => setAccount(event.target.value)}><option value="">Select an account</option>{accounts.map((item) => { const row = available.get(item.id); return <option key={item.id} value={item.id}>{item.name}{row && row.allocatable !== null ? ` · ${formatJPY(row.allocatable)} unreserved` : ' · balance needs review'}</option> })}</Select>
    <Input id="move-amount" label="Amount (JPY)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
    {move === 'reassign' && <Select id="move-target" label="Move to bucket" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Select a bucket</option>{buckets.filter((item) => item.id !== bucket.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={fund.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={fund.isPending}>{verb}</Button></div>
  </form>
}

type SavingsDialog = { type: 'goal'; goal: SavingsGoal | null } | { type: 'bucket' } | { type: 'move'; bucket: Bucket; move: Move }

export function SavingsPage() {
  const options = useEntryOptions()
  const today = options.data?.local_today
  const goals = useSavingsGoals()
  const allocations = useAllocations(today)
  const accounts = useAccounts()
  const [dialog, setDialog] = useState<SavingsDialog | null>(null)
  const [feedback, setFeedback] = useState('')
  const close = (message?: string) => { setDialog(null); if (message) setFeedback(message) }
  const buckets = allocations.data?.buckets ?? []
  const liquid = (accounts.data ?? []).filter((account) => account.kind !== 'CREDIT_CARD')
  const names = new Map((accounts.data ?? []).map((account) => [account.id, account.name]))
  const title = !dialog ? '' : dialog.type === 'goal' ? (dialog.goal ? `Edit ${dialog.goal.name}` : 'Add savings goal') : dialog.type === 'bucket' ? 'Add savings bucket' : `${{ fund: 'Set aside money for', release: 'Release money from', reassign: 'Move money from' }[dialog.move]} ${dialog.bucket.name}`
  return <section aria-labelledby="savings-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="savings-heading" className="text-2xl font-bold tracking-tight">Savings</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Set aside money you already have for goals such as an emergency fund. Setting money aside is not spending, and money in the bank is not savings until you set it aside.</p></div><div className="flex gap-2"><Button onClick={() => setDialog({ type: 'goal', goal: null })}>Add goal</Button><Button variant="secondary" onClick={() => setDialog({ type: 'bucket' })}>Add bucket</Button></div></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}

    <section aria-labelledby="goals-heading" className="space-y-3">
      <h3 id="goals-heading" className="text-lg font-semibold">Goals</h3>
      {goals.isLoading || allocations.isLoading ? <Skeleton className="h-24" /> : goals.isError ? <div className="space-y-2"><Alert>Could not load goals. {normalizeApiError(goals.error).message}</Alert><Button variant="secondary" onClick={() => goals.refetch()}>Try again</Button></div>
        : !goals.data?.length ? <EmptyState title="No savings goals yet" description="Add a goal with your own target. Nothing is pre-filled or recommended." action={<Button onClick={() => setDialog({ type: 'goal', goal: null })}>Add goal</Button>} />
        : <div className="grid gap-4 md:grid-cols-2">{goals.data.map((goal) => {
          const linked = buckets.filter((bucket) => bucket.goal_id === goal.id)
          const funded = linked.reduce((sum, bucket) => sum + bucket.funded, 0)
          const percent = goal.target > 0 ? Math.min(100, Math.round((funded / goal.target) * 100)) : 0
          return <article key={goal.id} aria-labelledby={`goal-${goal.id}`} className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2"><h4 id={`goal-${goal.id}`} className="font-semibold">{goal.name}</h4><Button variant="ghost" className="px-3" onClick={() => setDialog({ type: 'goal', goal })}>Edit<span className="sr-only"> {goal.name}</span></Button></div>
            <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Target</dt><dd className="font-semibold">{formatJPY(goal.target)}</dd></div><div><dt className="text-slate-500">Set aside</dt><dd className="font-semibold">{allocations.isError ? 'Unavailable' : formatJPY(funded)}</dd></div></dl>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full bg-indigo-600" style={{ width: `${percent}%` }} /></div>
            <p className="text-sm">{allocations.isError ? 'Funded amount unavailable.' : `${percent}% funded · ${formatJPY(Math.max(0, goal.target - funded))} still to set aside`}{goal.target_date ? ` · by ${formatDate(goal.target_date)}` : ''}</p>
            {!linked.length && <p className="text-xs text-slate-500">No bucket counts toward this goal yet.</p>}
          </article>
        })}</div>}
    </section>

    <section aria-labelledby="buckets-heading" className="space-y-3">
      <h3 id="buckets-heading" className="text-lg font-semibold">Buckets</h3>
      {allocations.isLoading || !today ? <Skeleton className="h-24" /> : allocations.isError ? <div className="space-y-2"><Alert>Could not load buckets. {normalizeApiError(allocations.error).message}</Alert><Button variant="secondary" onClick={() => allocations.refetch()}>Try again</Button></div>
        : !buckets.length ? <EmptyState title="No buckets yet" description="A bucket holds money you set aside from an account, such as an emergency fund." action={<Button variant="secondary" onClick={() => setDialog({ type: 'bucket' })}>Add bucket</Button>} />
        : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Savings buckets</caption>
          <thead className="bg-slate-50"><tr>{['Bucket', 'Target', 'Set aside', 'Still to set aside', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{buckets.map((bucket) => <tr key={bucket.id}>
            <th scope="row" className="px-4 py-3 text-left font-medium">{bucket.name}{bucket.goal_id && <span className="block text-xs font-normal text-slate-500">for {goals.data?.find((goal) => goal.id === bucket.goal_id)?.name ?? 'a goal'}</span>}</th>
            <td className="px-4 py-3">{formatJPY(bucket.target)}</td><td className="px-4 py-3 font-semibold">{formatJPY(bucket.funded)}</td>
            <td className="px-4 py-3">{bucket.shortfall > 0 ? <StatusBadge tone="warn">{formatJPY(bucket.shortfall)} short</StatusBadge> : <StatusBadge tone="ok">Fully funded</StatusBadge>}</td>
            <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'move', bucket, move: 'fund' })}>Set aside<span className="sr-only"> for {bucket.name}</span></Button>{bucket.funded > 0 && <><Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'move', bucket, move: 'release' })}>Release<span className="sr-only"> from {bucket.name}</span></Button>{buckets.length > 1 && <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'move', bucket, move: 'reassign' })}>Move<span className="sr-only"> from {bucket.name}</span></Button>}</>}</div></td>
          </tr>)}</tbody></table></div>}
    </section>

    {allocations.data && <section aria-labelledby="cash-heading" className="space-y-3">
      <h3 id="cash-heading" className="text-lg font-semibold">Money not yet set aside</h3>
      <p className="text-sm text-slate-600">Card reserves and savings buckets draw on the same cash. What remains is shown here; nothing is taken from a bucket automatically.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Reserved and unreserved money by account</caption>
        <thead className="bg-slate-50"><tr>{['Account', 'Balance', 'Set aside (savings and card reserves)', 'Not set aside'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{allocations.data.accounts.map((row) => <tr key={row.account_id}>
          <th scope="row" className="px-4 py-3 text-left font-medium">{names.get(row.account_id) ?? 'Account'}</th>
          <td className="px-4 py-3"><Amount value={row.balance} unknown="Opening balance needed" /></td>
          <td className="px-4 py-3">{formatJPY(row.funded)}</td>
          <td className="px-4 py-3"><Amount value={row.allocatable} unknown="Needs review" />{row.underfunded && <p className="text-xs font-semibold text-rose-700">More is set aside than the account holds</p>}</td>
        </tr>)}</tbody></table></div>
      <p className="text-sm text-slate-600">Moving money to a separate savings account? <Link to="/transfers" className="font-semibold text-indigo-700 underline">Record a transfer</Link>.</p>
    </section>}

    <Dialog open={dialog !== null} title={title} onClose={() => close()}>
      {dialog?.type === 'goal' && <GoalForm goal={dialog.goal} onDone={close} />}
      {dialog?.type === 'bucket' && <BucketForm goals={goals.data ?? []} onDone={close} />}
      {dialog?.type === 'move' && allocations.data && today && <MoveForm bucket={dialog.bucket} move={dialog.move} buckets={buckets} accounts={liquid} allocations={allocations.data} today={today} onDone={close} onConflict={() => allocations.refetch()} />}
    </Dialog>
  </section>
}
