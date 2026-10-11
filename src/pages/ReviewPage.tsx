import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useAccounts, useEntryOptions } from '@/api/hooks/accounts'
import { useCreateFinancialEvent, useFinancialEvents } from '@/api/hooks/events'
import { useConfirmReconciliation, useDraftReconciliation, useIncludePosting, useLedgerExport, useLedgerQuality, useReconciliation, useReopenReconciliation, useStatementBalance } from '@/api/hooks/reconciliation'
import { useIdempotencyKey, useSingleFlight } from '@/api/idempotency'
import type { Account, EntryOptions, FinancialEvent, ISODate, LedgerQuality, Reconciliation } from '@/api/types'
import { Amount, StatusBadge } from '@/components/finance/Amount'
import { EventForm } from '@/components/ledger/EventForms'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { isFeatureEnabled } from '@/config/features'
import { accountKindLabel } from '@/utils/accounts'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

const WHOLE = /^\d+$/

/**
 * Card statements show a positive amount owed while the server stores card
 * balances negative when owed. Every card figure on this page goes through here.
 */
function statementFigure(account: Account | undefined, signed: number | null) {
  if (signed === null) return null
  return account?.kind === 'CREDIT_CARD' ? -signed : signed
}

function StatementAmount({ account, value }: { account: Account | undefined; value: number | null }) {
  const shown = statementFigure(account, value)
  if (shown === null) return <Amount value={null} />
  return <span>{account?.kind === 'CREDIT_CARD' && shown < 0 ? `Credit ${formatJPY(-shown)}` : <Amount value={shown} />}</span>
}

/** Display-only: names a posting when exactly one entry on the account has that amount and date. */
function describePostings(events: FinancialEvent[], accountId: string) {
  const index = new Map<string, FinancialEvent[]>()
  for (const event of events) for (const posting of event.postings) {
    if (posting.account_id !== accountId) continue
    const key = `${posting.delta}:${posting.effective_date}`
    index.set(key, [...(index.get(key) ?? []), event])
  }
  return (delta: number, date: ISODate) => { const found = index.get(`${delta}:${date}`); return found?.length === 1 ? found[0] : undefined }
}

function QualityQueue({ quality, accounts, onReconcile }: { quality: LedgerQuality; accounts: Map<string, Account>; onReconcile: (accountId: string) => void }) {
  const name = (id: string) => accounts.get(id)?.name ?? 'An account'
  const items: Array<{ key: string; text: string; action: ReactNode }> = []
  if (quality.unresolved_legacy_records) items.push({ key: 'legacy', text: `${quality.unresolved_legacy_records} earlier ${quality.unresolved_legacy_records === 1 ? 'record needs' : 'records need'} an account.`, action: isFeatureEnabled('cutover') && <Link to="/setup/migration">Assign records</Link> })
  for (const id of quality.missing_openings) items.push({ key: `opening-${id}`, text: `${name(id)} has no opening balance, so its balance is unknown.`, action: <Link to="/accounts">Set opening balance</Link> })
  if (quality.unknown_purchase_dates) items.push({ key: 'dates', text: `${quality.unknown_purchase_dates} ${quality.unknown_purchase_dates === 1 ? 'purchase has' : 'purchases have'} an unknown purchase date and ${quality.unknown_purchase_dates === 1 ? 'is' : 'are'} left out of payday budgets.`, action: <Link to="/transactions">Review entries</Link> })
  for (const id of quality.stale_or_missing_valuations) items.push({ key: `value-${id}`, text: `${name(id)} needs a current securities value.`, action: isFeatureEnabled('investments') && <Link to="/investments">Update value</Link> })
  for (const row of quality.schedule_debt_mismatch) items.push({ key: `schedule-${row.card_id}`, text: `${name(row.card_id)}: payment dates cover ${formatJPY(row.scheduled_outstanding)} but ${formatJPY(row.amount_owed)} is owed.`, action: isFeatureEnabled('cards') && <Link to={`/cards/${row.card_id}`}>Review payment dates</Link> })
  if (quality.reserve_shortfall > 0) items.push({ key: 'reserve', text: `${formatJPY(quality.reserve_shortfall)} of upcoming card payments isn’t reserved yet.`, action: isFeatureEnabled('cards') && <Link to="/cards">Reserve money</Link> })
  for (const id of quality.unreconciled_sessions) items.push({ key: `session-${id}`, text: 'A statement check is not finished, or a confirmed one changed afterwards.', action: <Link to={`/review?session=${id}`}>Continue check</Link> })
  for (const id of quality.accounts_without_confirmed_statement) items.push({ key: `never-${id}`, text: `${name(id)} has no confirmed statement check yet.`, action: <button type="button" className="underline" onClick={() => onReconcile(id)}>Check a statement<span className="sr-only"> for {name(id)}</span></button> })
  return <section aria-labelledby="queue-heading" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 id="queue-heading" className="font-semibold">Things to review</h3>
    {!items.length ? <p className="text-sm text-emerald-800">Nothing needs attention right now.</p>
      : <ul className="divide-y divide-slate-100 text-sm">{items.map((item) => <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{item.text}</span>{item.action && <span className="font-semibold text-indigo-700 [&_a]:underline">{item.action}</span>}</li>)}</ul>}
    {quality.balance_adjustments > 0 && <p className="text-xs text-slate-500">{quality.balance_adjustments} balance {quality.balance_adjustments === 1 ? 'adjustment has' : 'adjustments have'} been recorded. Adjustments change balances only, never income or spending.</p>}
  </section>
}

function StartForm({ accounts, initialAccount, today, onStarted }: { accounts: Account[]; initialAccount: string; today: ISODate; onStarted: (session: Reconciliation) => void }) {
  const draft = useDraftReconciliation()
  const once = useSingleFlight()
  const [accountId, setAccountId] = useState(initialAccount)
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [opening, setOpening] = useState('')
  const [closing, setClosing] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const account = accounts.find((item) => item.id === accountId)
  const isCard = account?.kind === 'CREDIT_CARD'
  const validRange = isValidISODate(from) && isValidISODate(to) && from <= to
  const statement = useStatementBalance(accountId || undefined, validRange ? from : undefined, validRange ? to : undefined)
  const events = useFinancialEvents({ account_id: accountId, from, to, page_size: 100 }, Boolean(accountId) && validRange)
  const lookup = useMemo(() => describePostings(events.data?.items ?? [], accountId), [accountId, events.data])
  const toSigned = (value: string) => isCard ? -Number(value) : Number(value)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!account || !validRange || !WHOLE.test(opening) || !WHOLE.test(closing)) { setError('Choose an account, a valid period and the statement’s opening and closing amounts in whole yen.'); return }
    void once(async () => {
      setError('')
      try {
        const selected = (statement.data?.postings ?? []).map((posting) => posting.id).filter((id) => !excluded.has(id))
        onStarted(await draft.mutateAsync({ account_id: account.id, period_start: from, period_end: to, statement_opening: toSigned(opening), statement_closing: toSigned(closing), selected_posting_ids: statement.data ? selected : null }))
      } catch (cause) {
        const apiError = normalizeApiError(cause)
        setError(apiError.kind === 'conflict' ? 'This statement period has already been started. Open it from “Things to review”, or reopen it there if it was confirmed.' : apiError.message)
      }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4" aria-labelledby="start-heading">
    <h3 id="start-heading" className="text-lg font-semibold">Check a statement</h3>
    {error && <Alert>{error}</Alert>}
    <div className="grid gap-4 sm:grid-cols-3">
      <Select id="review-account" label="Account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setExcluded(new Set()) }}><option value="">Select an account</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {accountKindLabel[item.kind]}</option>)}</Select>
      <Input id="review-from" label="Statement from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <Input id="review-to" label="Statement to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      <Input id="review-opening" label={isCard ? 'Amount owed at start (JPY)' : 'Statement opening balance (JPY)'} inputMode="numeric" value={opening} onChange={(event) => setOpening(event.target.value)} />
      <Input id="review-closing" label={isCard ? 'Amount owed at end (JPY)' : 'Statement closing balance (JPY)'} inputMode="numeric" value={closing} onChange={(event) => setClosing(event.target.value)} />
    </div>
    <p className="text-xs text-slate-500">Copy these from your {isCard ? 'card' : 'bank'} statement. No bank login or statement upload is needed.</p>
    {accountId && validRange && (statement.isLoading ? <Skeleton className="h-24" /> : statement.isError ? <Alert>Could not load this period’s activity. {normalizeApiError(statement.error).message}</Alert> : statement.data && <div className="space-y-2">
      <p className="text-sm">This app shows {isCard ? 'an amount owed' : 'a balance'} of <strong><StatementAmount account={account} value={statement.data.opening} /></strong> at the start and <strong><StatementAmount account={account} value={statement.data.closing} /></strong> at the end of the period.</p>
      {statement.data.postings.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="text-left text-sm font-medium">Untick anything that isn’t on the statement</caption>
        <thead><tr className="border-b border-slate-200">{['On statement', 'Posted', 'Purchase date', 'Entry', isCard ? 'Change in amount owed' : 'Amount'].map((heading) => <th key={heading} scope="col" className="py-2 pr-3 text-left font-medium text-slate-500">{heading}</th>)}</tr></thead>
        <tbody>{statement.data.postings.map((posting) => { const found = lookup(posting.amount, posting.effective_date); return <tr key={posting.id} className="border-b border-slate-100">
          <td className="py-2 pr-3"><input type="checkbox" aria-label={`On statement: ${found?.description ?? 'entry'} ${formatJPY(Math.abs(posting.amount))} posted ${posting.effective_date}`} checked={!excluded.has(posting.id)} onChange={(event) => { const next = new Set(excluded); if (event.target.checked) next.delete(posting.id); else next.add(posting.id); setExcluded(next) }} /></td>
          <td className="whitespace-nowrap py-2 pr-3">{formatDate(posting.effective_date)}</td>
          <td className="whitespace-nowrap py-2 pr-3">{found?.occurred_on ? formatDate(found.occurred_on) : <span className="text-slate-500">—</span>}</td>
          <td className="py-2 pr-3">{found?.description ?? <span className="text-slate-500">—</span>}</td>
          <td className="py-2 pr-3"><Amount value={statementFigure(account, posting.amount)} /></td>
        </tr> })}</tbody></table></div>}
    </div>)}
    <Button type="submit" loading={draft.isPending} disabled={!accountId}>Start check</Button>
  </form>
}

function AdjustmentForm({ account, session, onDone }: { account: Account; session: Reconciliation; onDone: (message?: string) => void }) {
  const create = useCreateFinancialEvent()
  const idempotency = useIdempotencyKey()
  const once = useSingleFlight()
  const isCard = account.kind === 'CREDIT_CARD'
  // Default to the side that closes the unexplained difference; the user can change it.
  const [direction, setDirection] = useState<'up' | 'down'>(session.difference >= 0 ? 'up' : 'down')
  const [amount, setAmount] = useState(String(Math.abs(session.difference) || ''))
  const [date, setDate] = useState(session.period_end)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const delta = (direction === 'up' ? 1 : -1) * Number(amount || 0)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!WHOLE.test(amount) || Number(amount) <= 0 || !reason.trim() || !isValidISODate(date)) { setError('Enter an amount, a date and the reason for this adjustment.'); return }
    const body = { kind: 'BALANCE_ADJUSTMENT' as const, amount: Number(amount), adjustment_delta: delta, account_id: account.id, occurred_on: date, effective_date: date, description: reason.trim() }
    void once(async () => {
      setError('')
      try { await create.mutateAsync({ ...body, idempotency_key: idempotency.keyFor(body) }); idempotency.reset(); onDone('Balance adjustment recorded. Include it in the check to clear the difference.') }
      catch (cause) { setError(normalizeApiError(cause).message) }
    })
  }
  const change = isCard ? -delta : delta
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Use this only when you can’t find the missing entry. An adjustment changes the account balance; it is never counted as income or spending. It stays in your history with its reason.</p>
    <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">The server balance should go</legend>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="adjust" checked={direction === 'up'} onChange={() => setDirection('up')} />Up</label>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="adjust" checked={direction === 'down'} onChange={() => setDirection('down')} />Down</label>
    </fieldset>
    <Input id="adjust-amount" label="Amount (JPY)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
    <Input id="adjust-date" label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    <Input id="adjust-reason" label="Reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} />
    {Number(amount) > 0 && <p className="rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">Preview: {account.name} {isCard ? 'amount owed' : 'balance'} {change >= 0 ? 'increases' : 'decreases'} by {formatJPY(Math.abs(change))} on {isValidISODate(date) ? formatDate(date) : 'the chosen date'}. Income and spending are unchanged.</p>}
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={create.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={create.isPending}>Record adjustment</Button></div>
  </form>
}

function SessionView({ id, accounts, options, onClose }: { id: string; accounts: Map<string, Account>; options: EntryOptions; onClose: () => void }) {
  const session = useReconciliation(id)
  const include = useIncludePosting()
  const confirm = useConfirmReconciliation()
  const reopen = useReopenReconciliation()
  const once = useSingleFlight()
  const [dialog, setDialog] = useState<'missing' | 'adjust' | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const data = session.data
  const account = data ? accounts.get(data.account_id) : undefined
  const events = useFinancialEvents({ account_id: data?.account_id, page_size: 100 }, Boolean(data))
  const lookup = useMemo(() => describePostings(events.data?.items ?? [], data?.account_id ?? ''), [data?.account_id, events.data])
  const run = (work: () => Promise<unknown>, success: string) => void once(async () => {
    setFeedback(null)
    try { await work(); setFeedback({ text: success, error: false }) }
    catch (error) { const apiError = normalizeApiError(error); setFeedback({ text: apiError.kind === 'conflict' ? `${apiError.message}.` : apiError.message, error: true }) }
  })
  if (session.isLoading) return <Skeleton className="h-48" />
  if (session.isError || !data) return <div className="space-y-2"><Alert>Could not load this statement check. {normalizeApiError(session.error).message}</Alert><Button variant="secondary" onClick={() => session.refetch()}>Try again</Button><Button variant="ghost" onClick={onClose}>Start a different check</Button></div>
  const isCard = account?.kind === 'CREDIT_CARD'
  const canConfirm = data.status === 'draft' && data.difference === 0 && !data.unmatched_postings.length && !data.opening_mismatch
  const status = { draft: { label: 'In progress', tone: 'warn' as const }, confirmed: { label: 'Reconciled', tone: 'ok' as const }, stale: { label: 'Changed after reconciling', tone: 'error' as const } }[data.status]
  const close = (message?: string) => { setDialog(null); if (message) setFeedback({ text: message, error: false }) }
  return <section aria-labelledby="session-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="session-heading" className="text-lg font-semibold">{account?.name ?? 'Account'} · {formatDate(data.period_start)} – {formatDate(data.period_end)}</h3><p className="mt-1"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></p></div><Button variant="ghost" onClick={onClose}>Start a different check</Button></div>
    {feedback && <Alert tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Alert>}
    {data.status === 'stale' && <Alert>Entries in this reconciled period changed afterwards, so it no longer matches the statement. Reopen it to review the changes.</Alert>}
    <dl className="grid gap-4 sm:grid-cols-4">
      {[[isCard ? 'Statement: owed at start' : 'Statement opening', data.statement_opening], [isCard ? 'Statement: owed at end' : 'Statement closing', data.statement_closing], [isCard ? 'This app: owed at end' : 'This app: closing', data.calculated_closing]].map(([label, value]) => <div key={label as string} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold"><StatementAmount account={account} value={value as number} /></dd></div>)}
      <div className={`rounded-lg border p-3 ${data.difference ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><dt className="text-xs">Unexplained difference</dt><dd className="mt-1 font-bold">{data.difference === 0 ? 'None' : formatJPY(Math.abs(data.difference))}</dd></div>
    </dl>
    {data.opening_mismatch && <Alert>The statement’s opening {isCard ? 'amount owed' : 'balance'} doesn’t match this app’s balance the day before the period (<StatementAmount account={account} value={data.baseline_before_period} />). Check the previous period or the account’s opening balance first.</Alert>}
    {data.suggestions.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{data.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>}
    {data.unmatched_postings.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="text-left text-sm font-medium">Entries in this period that aren’t part of the check yet</caption>
      <thead><tr className="border-b border-slate-200">{['Posted', 'Purchase date', 'Entry', isCard ? 'Change in amount owed' : 'Amount', 'Action'].map((heading) => <th key={heading} scope="col" className="py-2 pr-3 text-left font-medium text-slate-500">{heading}</th>)}</tr></thead>
      <tbody>{data.unmatched_postings.map((posting) => { const found = lookup(posting.delta, posting.effective_date); return <tr key={posting.id} className="border-b border-slate-100">
        <td className="whitespace-nowrap py-2 pr-3">{formatDate(posting.effective_date)}</td>
        <td className="whitespace-nowrap py-2 pr-3">{found?.occurred_on ? formatDate(found.occurred_on) : <span className="text-slate-500">—</span>}</td>
        <td className="py-2 pr-3">{found?.description ?? <span className="text-slate-500">—</span>}</td>
        <td className="py-2 pr-3"><Amount value={statementFigure(account, posting.delta)} /></td>
        <td className="py-2 pr-3">{data.status === 'draft' && <Button variant="ghost" className="px-2" loading={include.isPending} onClick={() => run(() => include.mutateAsync({ id: data.id, postingId: posting.id }), 'Entry included.')}>Include<span className="sr-only"> entry posted {posting.effective_date}</span></Button>}</td>
      </tr> })}</tbody></table></div>}
    {data.status === 'draft' && <div className="flex flex-wrap gap-2">
      {account && account.archived_at === null && <Button variant="secondary" onClick={() => setDialog('missing')}>Record a missing entry</Button>}
      <Link to={`/transactions?${new URLSearchParams({ account_id: data.account_id, from: data.period_start, to: data.period_end })}`} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Correct an entry</Link>
      {account && data.difference !== 0 && <Button variant="secondary" onClick={() => setDialog('adjust')}>Record a balance adjustment</Button>}
    </div>}
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
      {data.status === 'draft' ? <><Button disabled={!canConfirm} loading={confirm.isPending} onClick={() => run(() => confirm.mutateAsync(data.id), 'Statement reconciled.')}>Confirm reconciliation</Button>{!canConfirm && <p className="text-sm text-slate-600">Confirm once the unexplained difference is zero and every entry in the period is included.</p>}</>
        : <Button variant="secondary" loading={reopen.isPending} onClick={() => run(() => reopen.mutateAsync(data.id), 'Reopened. Review the changes, then confirm again.')}>Reopen</Button>}
    </div>
    <Dialog open={dialog !== null} title={dialog === 'missing' ? 'Record a missing entry' : 'Record a balance adjustment'} onClose={() => close()}>
      {dialog === 'missing' && account && <EventForm mode="purchase" options={options} defaults={{ account_id: account.id, date: data.period_end }} onDone={(message) => close(message ? `${message} Include it below to update the check.` : undefined)} />}
      {dialog === 'adjust' && account && <AdjustmentForm account={account} session={data} onDone={close} />}
    </Dialog>
  </section>
}

function ExportPanel() {
  const exportLedger = useLedgerExport()
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null)
  const download = async () => {
    setResult(null)
    try {
      const data = await exportLedger.mutateAsync()
      const stamp = new Date().toISOString()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `finance-ledger-${stamp.slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      const events = Array.isArray(data.events) ? data.events.length : 0
      setResult({ text: `Downloaded a complete copy prepared by the server: ${events} entries plus accounts, schedules, savings and statement checks.`, error: false })
    } catch (error) {
      const apiError = normalizeApiError(error)
      setResult({ text: apiError.status === 413 ? 'Your history is too large for a single download. Nothing partial was saved.' : `Export failed. ${apiError.message}`, error: true })
    }
  }
  return <section aria-labelledby="export-heading" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 id="export-heading" className="font-semibold">Export your records</h3>
    <p className="text-sm text-slate-600">A full copy of your own records, assembled by the server, including earlier Cash/Bank records. It is saved only to this device.</p>
    {result && <Alert tone={result.error ? 'error' : 'success'}>{result.text}</Alert>}
    <Button variant="secondary" loading={exportLedger.isPending} onClick={download}>Download export</Button>
  </section>
}

export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const options = useEntryOptions()
  const accountsQuery = useAccounts(true)
  const quality = useLedgerQuality()
  const accounts = useMemo(() => new Map((accountsQuery.data ?? []).map((account) => [account.id, account])), [accountsQuery.data])
  const active = (accountsQuery.data ?? []).filter((account) => account.archived_at === null)
  const sessionId = params.get('session')
  const startFor = (accountId: string) => setParams({ account: accountId })
  return <section aria-labelledby="review-heading" className="space-y-6">
    <div><h2 id="review-heading" className="text-2xl font-bold tracking-tight">Review</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Keep your records matching your bank and card statements.</p></div>
    <details className="rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm"><summary className="cursor-pointer font-semibold">How to keep things accurate</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div><h3 className="font-semibold">Weekly check (5 minutes)</h3><ol className="mt-1 list-decimal space-y-1 pl-5"><li>Record any purchases you haven’t entered yet.</li><li>Clear the items in “Things to review”.</li><li>Look at the next card withdrawal and reserve money for it.</li></ol></div>
        <div><h3 className="font-semibold">Monthly close</h3><ol className="mt-1 list-decimal space-y-1 pl-5"><li>When a statement arrives, check it below: enter its opening and closing figures.</li><li>Include or add entries until the unexplained difference is zero. Look for a missing fee, a duplicate, a refund or a timing difference.</li><li>Fix a wrong entry with a correction. Use a balance adjustment only as a last resort.</li><li>Confirm the reconciliation.</li></ol></div>
      </div>
    </details>
    {quality.isLoading ? <Skeleton className="h-32" /> : quality.isError ? <div className="space-y-2"><Alert>Could not load the review list. {normalizeApiError(quality.error).message}</Alert><Button variant="secondary" onClick={() => quality.refetch()}>Try again</Button></div> : quality.data && <QualityQueue quality={quality.data} accounts={accounts} onReconcile={startFor} />}
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {options.isLoading || accountsQuery.isLoading ? <Skeleton className="h-40" /> : options.isError || accountsQuery.isError ? <Alert>Could not load your accounts. {normalizeApiError(options.error ?? accountsQuery.error).message}</Alert>
        : options.data && (sessionId ? <SessionView key={sessionId} id={sessionId} accounts={accounts} options={options.data} onClose={() => setParams({})} /> : <StartForm key={params.get('account') ?? ''} accounts={active} initialAccount={params.get('account') ?? ''} today={options.data.local_today} onStarted={(session) => setParams({ session: session.id })} />)}
    </div>
    <ExportPanel />
  </section>
}
