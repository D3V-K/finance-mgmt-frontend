import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useEntryOptions, useFinanceSettings, useSaveFinanceSettings, useSetPaydayOverride } from '@/api/hooks/accounts'
import { useCategories } from '@/api/hooks/categories'
import { useBudgetCycle, useSaveBudget } from '@/api/hooks/planning'
import { useSingleFlight } from '@/api/idempotency'
import type { BudgetCycleSummary, BudgetLine } from '@/api/types'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/FormControls'
import { formatDate, formatJPY } from '@/utils/format'
import { addDays, isValidISODate } from '@/utils/reporting'

const WHOLE = /^\d+$/

function BudgetBar({ line }: { line: BudgetLine }) {
  const used = line.planned > 0 ? Math.min(100, Math.round((line.net_spending / line.planned) * 100)) : line.net_spending > 0 ? 100 : 0
  const over = line.remaining < 0
  return <div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={`h-full ${over ? 'bg-rose-600' : used >= 85 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${used}%` }} /></div>
    <p className={`mt-1 text-sm font-semibold ${over ? 'text-rose-700' : 'text-slate-900'}`}>{over ? `Over budget by ${formatJPY(-line.remaining)}` : `${formatJPY(line.remaining)} left`}</p>
  </div>
}

function BudgetForm({ summary, line, onDone }: { summary: BudgetCycleSummary; line: BudgetLine | null; onDone: (message?: string) => void }) {
  const categories = useCategories()
  const save = useSaveBudget()
  const once = useSingleFlight()
  const [category, setCategory] = useState(line?.category_id ?? '')
  const [planned, setPlanned] = useState(line ? String(line.planned) : '')
  const [errors, setErrors] = useState<{ category?: string; planned?: string; submit?: string }>({})
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = { category: category ? undefined : 'Choose a spending category.', planned: WHOLE.test(planned) ? undefined : 'Enter zero or a whole number of yen.' }
    setErrors(next)
    if (next.category || next.planned) return
    void once(async () => {
      try { await save.mutateAsync({ category_id: category, cycle_start: summary.start, planned: Number(planned) }); onDone('Budget saved for this payday cycle.') }
      catch (error) { setErrors({ submit: normalizeApiError(error).message }) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {errors.submit && <Alert>{errors.submit}</Alert>}
    <p className="text-sm text-slate-600">For the cycle starting {formatDate(summary.start)}. Amounts are your own limits; nothing is suggested for you.</p>
    {line ? <p className="text-sm">Category: <strong>{line.category_name}</strong></p> : <CategorySelect id="budget-category" label="Category" type="expense" categories={categories.data ?? []} value={category} onChange={(event) => setCategory(event.target.value)} error={errors.category} />}
    <Input id="budget-planned" label="Planned for this cycle (JPY)" inputMode="numeric" value={planned} onChange={(event) => setPlanned(event.target.value)} error={errors.planned} />
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={save.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={save.isPending}>Save budget</Button></div>
  </form>
}

function PaydaySettings() {
  const settings = useFinanceSettings()
  const save = useSaveFinanceSettings()
  const override = useSetPaydayOverride()
  const once = useSingleFlight()
  const [draft, setDraft] = useState<{ timezone: string; payday: string } | null>(null)
  const [overrideDraft, setOverrideDraft] = useState({ month: '', actual: '' })
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  if (settings.isLoading) return <Skeleton className="h-32" />
  if (settings.isError || !settings.data) return <Alert>Could not load payday settings. {normalizeApiError(settings.error).message}</Alert>
  const data = settings.data
  const values = draft ?? { timezone: data.timezone, payday: String(data.payday_day) }
  const saveSettings = (event: FormEvent) => {
    event.preventDefault()
    if (!WHOLE.test(values.payday) || Number(values.payday) < 1 || Number(values.payday) > 31 || !values.timezone.trim()) { setFeedback({ text: 'Enter a time zone and a payday between 1 and 31.', error: true }); return }
    void once(async () => {
      setFeedback(null)
      try { await save.mutateAsync({ timezone: values.timezone.trim(), payday_day: Number(values.payday), default_account_id: data.default_account_id }); setDraft(null); setFeedback({ text: 'Payday settings saved. Cycles are recalculated by the server.', error: false }) }
      catch (error) { setFeedback({ text: normalizeApiError(error).message, error: true }) }
    })
  }
  const saveOverride = (event: FormEvent) => {
    event.preventDefault()
    const month = overrideDraft.month ? `${overrideDraft.month}-01` : ''
    if (!isValidISODate(month) || !isValidISODate(overrideDraft.actual) || overrideDraft.actual.slice(0, 7) !== overrideDraft.month) { setFeedback({ text: 'Choose a month and the actual payday within that month.', error: true }); return }
    void once(async () => {
      setFeedback(null)
      try { await override.mutateAsync({ month, actual_date: overrideDraft.actual }); setOverrideDraft({ month: '', actual: '' }); setFeedback({ text: `Payday for ${overrideDraft.month} set to ${formatDate(overrideDraft.actual)}.`, error: false }) }
      catch (error) { setFeedback({ text: normalizeApiError(error).message, error: true }) }
    })
  }
  return <section aria-labelledby="payday-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 id="payday-heading" className="font-semibold">Payday settings</h3>
    {feedback && <Alert tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Alert>}
    <form onSubmit={saveSettings} noValidate className="grid items-end gap-4 sm:grid-cols-3">
      <Input id="settings-timezone" label="Time zone" value={values.timezone} onChange={(event) => setDraft({ ...values, timezone: event.target.value })} />
      <Input id="settings-payday" label="Usual payday (day of month)" inputMode="numeric" value={values.payday} onChange={(event) => setDraft({ ...values, payday: event.target.value })} />
      <Button type="submit" variant="secondary" loading={save.isPending}>Save payday</Button>
    </form>
    <p className="text-xs text-slate-500">In short months a late payday falls on the last day. If a payday moves (for example before a weekend), set that month’s actual date below.</p>
    <form onSubmit={saveOverride} noValidate className="grid items-end gap-4 sm:grid-cols-3">
      <Input id="override-month" label="Month" type="month" value={overrideDraft.month} onChange={(event) => setOverrideDraft({ ...overrideDraft, month: event.target.value })} />
      <Input id="override-date" label="Actual payday" type="date" value={overrideDraft.actual} onChange={(event) => setOverrideDraft({ ...overrideDraft, actual: event.target.value })} />
      <Button type="submit" variant="secondary" loading={override.isPending}>Set actual payday</Button>
    </form>
  </section>
}

export function BudgetPage() {
  const [params, setParams] = useSearchParams()
  const options = useEntryOptions()
  const requested = params.get('on')
  const on = requested && isValidISODate(requested) ? requested : options.data?.local_today
  const cycle = useBudgetCycle(on)
  const [editing, setEditing] = useState<BudgetLine | null | undefined>(undefined)
  const [feedback, setFeedback] = useState('')
  const summary = cycle.data
  const close = (message?: string) => { setEditing(undefined); if (message) setFeedback(message) }
  const totals = summary?.budgets.reduce((sum, line) => ({ planned: sum.planned + line.planned, net: sum.net + line.net_spending }), { planned: 0, net: 0 })
  return <section aria-labelledby="budget-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="budget-heading" className="text-2xl font-bold tracking-tight">Payday budget</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Spending limits for each payday-to-payday cycle. Purchases count on the day you buy, including on a card. Card repayments and transfers never use your budget.</p></div><Button disabled={!summary} onClick={() => setEditing(null)}>Add budget</Button></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {options.isError && !requested ? <Alert>Your local date is unavailable. {normalizeApiError(options.error).message}</Alert>
      : cycle.isLoading || !on ? <Skeleton className="h-48" />
      : cycle.isError ? <div className="space-y-3"><Alert>Could not load this payday cycle. {normalizeApiError(cycle.error).message}</Alert><Button variant="secondary" onClick={() => cycle.refetch()}>Try again</Button></div>
      : summary && <>
        <nav aria-label="Payday cycles" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Button variant="secondary" onClick={() => setParams({ on: addDays(summary.start, -1) })}>Previous cycle</Button>
          <p className="text-center font-semibold" aria-live="polite">{formatDate(summary.start)} – {formatDate(addDays(summary.end_exclusive, -1))}<span className="block text-xs font-normal text-slate-500">Next payday {formatDate(summary.end_exclusive)}. This is not a calendar month.</span></p>
          <Button variant="secondary" onClick={() => setParams({ on: summary.end_exclusive })}>Next cycle</Button>
        </nav>
        {summary.unknown_purchase_date_count > 0 && <Alert tone="info">{summary.unknown_purchase_date_count} earlier {summary.unknown_purchase_date_count === 1 ? 'purchase has' : 'purchases have'} an unknown purchase date and {summary.unknown_purchase_date_count === 1 ? 'is' : 'are'} not counted in any cycle.</Alert>}
        {!summary.budgets.length ? <EmptyState title="No budgets for this cycle" description="Add a limit for the categories you want to watch. Budgets apply to one payday cycle at a time." action={<Button onClick={() => setEditing(null)}>Add budget</Button>} />
          : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Budgets for this payday cycle</caption>
            <thead className="bg-slate-50"><tr>{['Category', 'Planned', 'Purchased', 'Refunds', 'Net spending', 'Remaining', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{summary.budgets.map((line) => <tr key={line.category_id}>
              <th scope="row" className="px-4 py-3 text-left font-medium">{line.category_name}</th>
              <td className="px-4 py-3">{formatJPY(line.planned)}</td><td className="px-4 py-3">{formatJPY(line.gross_spending)}</td><td className="px-4 py-3">{line.refunds ? `−${formatJPY(line.refunds)}` : formatJPY(0)}</td><td className="px-4 py-3">{formatJPY(line.net_spending)}</td>
              <td className="min-w-40 px-4 py-3"><BudgetBar line={line} /></td>
              <td className="px-4 py-3"><Button variant="ghost" className="px-3" onClick={() => setEditing(line)}>Edit<span className="sr-only"> {line.category_name} budget</span></Button></td>
            </tr>)}</tbody>
            {totals && <tfoot className="bg-slate-50"><tr><th scope="row" className="px-4 py-3 text-left">Total</th><td className="px-4 py-3 font-semibold">{formatJPY(totals.planned)}</td><td colSpan={2} /><td className="px-4 py-3 font-semibold">{formatJPY(totals.net)}</td><td colSpan={2} /></tr></tfoot>}
          </table></div>}
        <p className="text-sm text-slate-600">Money you set aside for savings or card payments is shown on <Link to="/savings" className="font-semibold text-indigo-700 underline">Savings</Link>; it is not spending.</p>
      </>}
    <PaydaySettings />
    <Dialog open={editing !== undefined} title={editing ? `Edit ${editing.category_name} budget` : 'Add budget'} onClose={() => close()}>{editing !== undefined && summary && <BudgetForm summary={summary} line={editing} onDone={close} />}</Dialog>
  </section>
}
