import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useEntryOptions } from '@/api/hooks/accounts'
import { useFinancialEvents, useReverseFinancialEvent } from '@/api/hooks/events'
import { useSingleFlight } from '@/api/idempotency'
import type { EntryOptions, EventKind, FinancialEvent, FinancialEventFilter } from '@/api/types'
import { CategoryBadge } from '@/components/categories/CategoryBadge'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { StatusBadge } from '@/components/finance/Amount'
import { PurchaseDate } from '@/components/finance/DateQuality'
import { EventForm } from '@/components/ledger/EventForms'
import { useLedgerLookups } from '@/components/ledger/useLedgerLookups'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { describeAccounts, eventKindLabel, modeForEvent, postedDate, signedEventAmount, type EventFormMode } from '@/utils/events'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

const PAGE_SIZE = 20
const KINDS: EventKind[] = ['EXPENSE', 'INCOME', 'REFUND', 'CARD_REPAYMENT', 'TRANSFER', 'BALANCE_ADJUSTMENT']
const FILTER_KEYS = ['kind', 'account_id', 'category_id', 'from', 'to'] as const

const formTitle: Record<EventFormMode, string> = { purchase: 'Record a purchase', income: 'Record income', refund: 'Record a refund', repayment: 'Record a card repayment', transfer: 'Record a transfer' }

function AmountCell({ event }: { event: FinancialEvent }) {
  const { direction, amount } = signedEventAmount(event)
  if (direction === 0) return <span>{formatJPY(amount)}<span className="sr-only"> moved between accounts</span></span>
  return <span className={direction > 0 ? 'text-emerald-700' : ''}>{direction > 0 ? '+' : '−'}{formatJPY(amount)}<span className="sr-only">{direction > 0 ? ' in' : ' out'}</span></span>
}

function CorrectionDialog({ event, options, onDone }: { event: FinancialEvent; options: EntryOptions; onDone: (message?: string) => void }) {
  const mode = modeForEvent(event)
  const [choice, setChoice] = useState<'replace' | 'reverse'>(mode ? 'replace' : 'reverse')
  const reverse = useReverseFinancialEvent()
  const once = useSingleFlight()
  const [error, setError] = useState('')
  const confirmReverse = () => void once(async () => {
    setError('')
    try { await reverse.mutateAsync(event.id); onDone('Entry reversed. The original and its reversal both stay in your history.') }
    catch (cause) { const apiError = normalizeApiError(cause); setError(apiError.kind === 'conflict' ? `${apiError.message}.` : apiError.message) }
  })
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Recorded entries are never edited or deleted in place. A correction keeps the original visible and adds linked entries that change its effect.</p>
    <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">What do you want to do?</legend>
      {mode && <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="correction" checked={choice === 'replace'} onChange={() => setChoice('replace')} />Fix the details (amount, account, category or date)</label>}
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="correction" checked={choice === 'reverse'} onChange={() => setChoice('reverse')} />Cancel it completely (it should never have been recorded)</label>
    </fieldset>
    {choice === 'replace' && mode ? <EventForm mode={mode} options={options} original={event} replacing onDone={onDone} />
      : <div className="space-y-3">{error && <Alert>{error}</Alert>}<p className="text-sm text-slate-600">A reversal of {formatJPY(event.amount)} will be recorded to cancel this {eventKindLabel[event.kind].toLowerCase()}.</p><div className="flex justify-end gap-3"><Button variant="secondary" disabled={reverse.isPending} onClick={() => onDone()}>Cancel</Button><Button variant="danger" loading={reverse.isPending} onClick={confirmReverse}>Record reversal</Button></div></div>}
  </div>
}

export function EventTable({ events, caption, onCorrect, onRefund }: { events: FinancialEvent[]; caption: string; onCorrect?: (event: FinancialEvent) => void; onRefund?: (event: FinancialEvent) => void }) {
  const { accountMap, categoryMap } = useLedgerLookups()
  // Status is only claimed for links visible on this page; the server stays the source of truth.
  const reversedHere = new Set(events.map((event) => event.reverses_event_id).filter(Boolean))
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">{caption}</caption>
    <thead className="bg-slate-50"><tr>{['Purchase date', 'Entry', 'Account', 'Category', 'Description', 'Amount', 'Actions'].map((heading) => <th key={heading} scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${heading === 'Amount' ? 'text-right' : 'text-left'}`}>{heading}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{events.map((event) => {
      const category = event.category_id ? categoryMap.get(event.category_id) : undefined
      const posted = postedDate(event)
      const linked = event.reverses_event_id ? 'Reversal' : event.replaces_event_id ? 'Correction' : reversedHere.has(event.id) ? 'Reversed' : null
      return <tr key={event.id} className="align-top">
        <td className="whitespace-nowrap px-4 py-3"><PurchaseDate occurredOn={event.occurred_on} basis={event.date_basis} />{posted && posted !== event.occurred_on && <p className="mt-1 text-xs text-slate-500">Posted {formatDate(posted)}</p>}</td>
        <td className="px-4 py-3"><span className="font-medium">{eventKindLabel[event.kind]}</span>{linked && <div className="mt-1"><StatusBadge tone="muted">{linked}</StatusBadge></div>}</td>
        <td className="px-4 py-3">{describeAccounts(event, accountMap)}</td>
        <td className="px-4 py-3">{category ? <span className="inline-flex flex-wrap items-center gap-1"><CategoryBadge category={category} />{category.archived_at && <span className="text-xs text-slate-500">(archived)</span>}</span> : event.category_id ? <span className="text-slate-500">Unknown category</span> : <span className="text-slate-400">—</span>}</td>
        <td className="max-w-xs break-words px-4 py-3 text-slate-700">{event.description || <span className="text-slate-400">—</span>}</td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold"><AmountCell event={event} /></td>
        <td className="whitespace-nowrap px-4 py-3">{!event.is_reversal && <div className="flex gap-1">
          {onCorrect && <Button variant="ghost" className="px-3" onClick={() => onCorrect(event)}>Correct<span className="sr-only"> {eventKindLabel[event.kind].toLowerCase()} {event.description ?? ''}</span></Button>}
          {onRefund && event.kind === 'EXPENSE' && <Button variant="ghost" className="px-3" onClick={() => onRefund(event)}>Refund<span className="sr-only"> {event.description ?? 'purchase'}</span></Button>}
        </div>}</td>
      </tr>
    })}</tbody></table></div>
}

type DialogState = { type: 'create'; mode: EventFormMode } | { type: 'refund'; event: FinancialEvent } | { type: 'correct'; event: FinancialEvent }

export function ActivityPage() {
  const [params, setParams] = useSearchParams()
  const parsedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const options = useEntryOptions()
  const { accounts, categories } = useLedgerLookups()
  const rangeError = (['from', 'to'] as const).some((key) => params.get(key) && !isValidISODate(params.get(key)!)) ? 'Enter valid filter dates.' : params.get('from') && params.get('to') && params.get('from')! > params.get('to')! ? 'From date must be on or before To date.' : ''
  const filters: FinancialEventFilter = useMemo(() => {
    const kind = params.get('kind')
    return {
      ...(kind && KINDS.includes(kind as EventKind) ? { kind: kind as EventKind } : {}),
      ...(params.get('account_id') ? { account_id: params.get('account_id')! } : {}),
      ...(params.get('category_id') ? { category_id: params.get('category_id')! } : {}),
      ...(params.get('from') ? { from: params.get('from')! } : {}),
      ...(params.get('to') ? { to: params.get('to')! } : {}),
      page, page_size: PAGE_SIZE,
    }
  }, [page, params])
  const events = useFinancialEvents(filters, !rangeError)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [feedback, setFeedback] = useState('')
  const hasFilters = FILTER_KEYS.some((key) => params.has(key))
  const updateFilter = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); next.delete('page'); return next }, { replace: true })
  const changePage = (nextPage: number) => setParams((current) => { const next = new URLSearchParams(current); if (nextPage > 1) next.set('page', String(nextPage)); else next.delete('page'); return next })
  const close = (message?: string) => { setDialog(null); if (message) setFeedback(message) }
  const totalPages = events.data ? Math.max(1, Math.ceil(events.data.total / events.data.page_size)) : 1
  const ready = Boolean(options.data)
  const title = !dialog ? '' : dialog.type === 'create' ? formTitle[dialog.mode] : dialog.type === 'refund' ? 'Record a refund' : `Correct ${eventKindLabel[dialog.event.kind].toLowerCase()}`

  return <section aria-labelledby="activity-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="activity-heading" className="text-2xl font-bold tracking-tight">Transactions</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Record purchases when you make them, including on a card. Repayments, transfers and refunds are recorded separately so nothing is counted twice.</p></div>
      <div className="flex flex-wrap gap-2"><Button disabled={!ready} onClick={() => setDialog({ type: 'create', mode: 'purchase' })}>Record purchase</Button><Button variant="secondary" disabled={!ready} onClick={() => setDialog({ type: 'create', mode: 'income' })}>Income</Button><Button variant="secondary" disabled={!ready} onClick={() => setDialog({ type: 'create', mode: 'repayment' })}>Card repayment</Button><Button variant="secondary" disabled={!ready} onClick={() => setDialog({ type: 'create', mode: 'transfer' })}>Transfer</Button></div></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {options.isError && <div className="space-y-2"><Alert>Entry options could not be loaded, so new entries are unavailable. {normalizeApiError(options.error).message}</Alert><Button variant="secondary" onClick={() => options.refetch()}>Retry</Button></div>}
    {options.data && !options.data.accounts.length && <Alert tone="info">Add an account before recording entries. <Link to="/accounts" className="font-semibold underline">Go to Accounts</Link></Alert>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Select id="filter-kind" label="Entry type" value={params.get('kind') ?? ''} onChange={(event) => updateFilter('kind', event.target.value)}><option value="">All entries</option>{KINDS.map((kind) => <option key={kind} value={kind}>{eventKindLabel[kind]}</option>)}</Select>
      <Select id="filter-account" label="Account" value={params.get('account_id') ?? ''} onChange={(event) => updateFilter('account_id', event.target.value)}><option value="">All accounts</option>{(accounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}{account.archived_at ? ' (archived)' : ''}</option>)}</Select>
      <CategorySelect id="filter-category" label="Category" categories={categories.data ?? []} placeholder="All categories" value={params.get('category_id') ?? ''} onChange={(event) => updateFilter('category_id', event.target.value)} />
      <Input id="filter-from" label="Purchase date from" type="date" value={params.get('from') ?? ''} onChange={(event) => updateFilter('from', event.target.value)} />
      <Input id="filter-to" label="Purchase date to" type="date" value={params.get('to') ?? ''} onChange={(event) => updateFilter('to', event.target.value)} />
    </div>{hasFilters && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{params.has('from') || params.has('to') ? 'Date filters use the purchase date, so entries with an unknown purchase date are not included.' : ''}</p><Button variant="ghost" onClick={() => setParams({}, { replace: true })}>Clear filters</Button></div>}</div>

    {rangeError ? <Alert>{rangeError}</Alert> : events.isLoading ? <div aria-label="Loading entries"><Skeleton className="h-72 w-full" /></div>
      : events.isError ? <div className="space-y-3"><Alert>Could not load entries. {normalizeApiError(events.error).message}</Alert><Button variant="secondary" onClick={() => events.refetch()}>Try again</Button></div>
      : !events.data?.items.length ? <EmptyState title={hasFilters ? 'No matching entries' : 'No entries yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Record a purchase on the day you make it.'} />
      : <EventTable events={events.data.items} caption="Recorded entries" onCorrect={ready ? (event) => setDialog({ type: 'correct', event }) : undefined} onRefund={ready ? (event) => setDialog({ type: 'refund', event }) : undefined} />}
    {events.data && (totalPages > 1 || page > 1) && <nav aria-label="Entry pages" className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-600">Page {page} of {Math.max(totalPages, page)} · {events.data.total} entries</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1 || events.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= totalPages || events.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div></nav>}
    <p className="text-sm text-slate-600">Looking for records from before purchase-date tracking? <Link to="/transactions?view=earlier" className="font-semibold text-indigo-700 underline">View earlier records</Link></p>

    <Dialog open={dialog !== null} title={title} onClose={() => close()}>
      {dialog && options.data && (dialog.type === 'create' ? <EventForm key={dialog.mode} mode={dialog.mode} options={options.data} onDone={close} />
        : dialog.type === 'refund' ? <EventForm mode="refund" options={options.data} original={dialog.event} onDone={close} />
        : <CorrectionDialog event={dialog.event} options={options.data} onDone={close} />)}
    </Dialog>
  </section>
}
