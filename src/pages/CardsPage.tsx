import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useAccountBalance, useAccounts, useEntryOptions } from '@/api/hooks/accounts'
import { useCardSchedules, useCardSettings, useCardStatements, useConfirmCardStatement, useCreateCardSchedule, useFundCardReserve, useLinkCardPayment, useLinkCardRefund, useSaveCardSettings, useUpdateCardSchedule } from '@/api/hooks/cards'
import { useFinancialEvents } from '@/api/hooks/events'
import { useSingleFlight } from '@/api/idempotency'
import type { Account, CardSchedule, CardStatementGroup, EntryOptions, FinancialEvent, ISODate } from '@/api/types'
import { StatusBadge } from '@/components/finance/Amount'
import { EventForm } from '@/components/ledger/EventForms'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { cardBalanceParts } from '@/utils/accounts'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

const WHOLE = /^\d+$/
const positiveYen = (value: string) => WHOLE.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value))

function message(error: unknown) {
  const apiError = normalizeApiError(error)
  if (apiError.kind === 'conflict' && /insufficient/i.test(apiError.message)) return 'There isn’t enough unreserved money in that account. Nothing was reserved; choose a smaller amount or another account.'
  return apiError.kind === 'conflict' ? `${apiError.message}. Nothing was changed.` : apiError.message
}

const scheduleStatus: Record<CardSchedule['status'], { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  planned: { label: 'Estimated', tone: 'warn' }, confirmed: { label: 'Confirmed', tone: 'muted' }, partially_paid: { label: 'Partly paid', tone: 'warn' }, paid: { label: 'Paid', tone: 'ok' },
}

/** The next unpaid withdrawal, from the server's grouping of schedules by due date. */
function nextDue(groups: CardStatementGroup[] | undefined, today: ISODate) {
  return groups?.filter((group) => group.outstanding > 0).sort((a, b) => a.due_date.localeCompare(b.due_date)).find((group) => group.due_date >= today) ?? groups?.filter((group) => group.outstanding > 0)[0]
}

function OwedFigure({ card, asOf }: { card: Account; asOf: ISODate }) {
  const balance = useAccountBalance(card.id, asOf)
  if (balance.isLoading) return <Skeleton className="h-8 w-32" />
  if (balance.isError) return <span className="text-sm">Amount owed unavailable. <button className="underline" onClick={() => balance.refetch()}>Retry</button></span>
  const parts = cardBalanceParts(balance.data?.balance ?? null)
  if (!parts) return <StatusBadge tone="warn">Opening balance needed</StatusBadge>
  return parts.credit > 0 ? <p><span className="text-sm text-slate-600">Credit balance</span><br /><span className="text-2xl font-bold">{formatJPY(parts.credit)}</span></p> : <p><span className="text-sm text-slate-600">Amount owed</span><br /><span className="text-2xl font-bold">{formatJPY(parts.owed)}</span></p>
}

function CardSummary({ card, options, banks, detail = false }: { card: Account; options: EntryOptions; banks: Map<string, Account>; detail?: boolean }) {
  const settings = useCardSettings(card.id)
  const statements = useCardStatements(card.id)
  const due = nextDue(statements.data, options.local_today)
  const bank = settings.data ? banks.get(settings.data.settlement_account_id) : undefined
  return <article aria-labelledby={`card-${card.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 id={`card-${card.id}`} className="text-lg font-semibold">{detail ? 'Summary' : card.name}</h3>{!detail && <Link to={`/cards/${card.id}`} className="text-sm font-semibold text-indigo-700 underline">Payments and schedules<span className="sr-only"> for {card.name}</span></Link>}</div>
    <div className="grid gap-4 sm:grid-cols-3">
      <OwedFigure card={card} asOf={options.local_today} />
      <div><p className="text-sm text-slate-600">Next withdrawal</p>{statements.isLoading ? <Skeleton className="mt-1 h-6 w-28" /> : statements.isError ? <p className="text-sm">Unavailable</p> : due ? <><p className="text-xl font-bold">{formatJPY(due.outstanding)}</p><p className="text-sm">{formatDate(due.due_date)} · <StatusBadge tone={due.source === 'actual' ? 'muted' : 'warn'}>{due.source === 'actual' ? 'Confirmed statement' : 'Estimated date'}</StatusBadge></p></> : <p className="text-sm text-slate-600">Nothing scheduled</p>}</div>
      <div><p className="text-sm text-slate-600">Reserved for it</p>{due ? <><p className="text-xl font-bold">{formatJPY(due.funded_reserve)}</p><p className={`text-sm ${due.outstanding - due.funded_reserve > 0 ? 'font-semibold text-amber-800' : 'text-emerald-700'}`}>{due.outstanding - due.funded_reserve > 0 ? `${formatJPY(due.outstanding - due.funded_reserve)} not yet reserved` : 'Fully reserved'}</p></> : <p className="text-sm text-slate-600">—</p>}</div>
    </div>
    {settings.isLoading ? null : settings.isError ? <Alert>Card settings are unavailable. {normalizeApiError(settings.error).message}</Alert>
      : !settings.data ? <Alert tone="info">Choose which bank pays this card so upcoming withdrawals appear in the right account’s forecast.{!detail && <> <Link to={`/cards/${card.id}`} className="font-semibold underline">Set the settlement bank</Link></>}</Alert>
      : <p className="text-sm text-slate-600">Paid from <strong>{bank?.name ?? 'an archived bank'}</strong> · statement closes on day {settings.data.closing_day}, payment on day {settings.data.payment_day}</p>}
  </article>
}

function SettingsForm({ card, banks }: { card: Account; banks: Account[] }) {
  const settings = useCardSettings(card.id)
  const save = useSaveCardSettings()
  const once = useSingleFlight()
  const [values, setValues] = useState<{ bank: string; closing: string; payment: string } | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const current = values ?? { bank: settings.data?.settlement_account_id ?? '', closing: settings.data ? String(settings.data.closing_day) : '', payment: settings.data ? String(settings.data.payment_day) : '' }
  const set = (field: keyof typeof current) => (event: { target: { value: string } }) => setValues({ ...current, [field]: event.target.value })
  const day = (value: string) => WHOLE.test(value) && Number(value) >= 1 && Number(value) <= 31
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!current.bank || !day(current.closing) || !day(current.payment)) { setFeedback({ text: 'Choose a settlement bank and enter closing and payment days between 1 and 31.', error: true }); return }
    void once(async () => {
      setFeedback(null)
      try { await save.mutateAsync({ cardId: card.id, payload: { settlement_account_id: current.bank, closing_day: Number(current.closing), payment_day: Number(current.payment) } }); setFeedback({ text: 'Card settings saved.', error: false }); setValues(null) }
      catch (error) { setFeedback({ text: message(error), error: true }) }
    })
  }
  if (settings.isLoading) return <Skeleton className="h-24" />
  return <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="settings-heading">
    <h3 id="settings-heading" className="font-semibold">Card settings</h3>
    {feedback && <Alert tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Alert>}
    {!banks.length && <Alert tone="info">Add a bank account first. <Link to="/accounts" className="underline">Go to Accounts</Link></Alert>}
    <div className="grid gap-4 sm:grid-cols-3">
      <Select id="settlement-bank" label="Settlement bank" value={current.bank} onChange={set('bank')}><option value="">Select a bank</option>{banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</Select>
      <Input id="closing-day" label="Statement closing day" inputMode="numeric" value={current.closing} onChange={set('closing')} />
      <Input id="payment-day" label="Payment day" inputMode="numeric" value={current.payment} onChange={set('payment')} />
    </div>
    <p className="text-xs text-slate-500">Days late in the month move to the last day of shorter months. Dates are estimates until you confirm a statement.</p>
    <Button type="submit" variant="secondary" loading={save.isPending}>Save settings</Button>
  </form>
}

function ScheduleForm({ card, purchases, onDone }: { card: Account; purchases: FinancialEvent[]; onDone: (message?: string) => void }) {
  const create = useCreateCardSchedule()
  const once = useSingleFlight()
  const [source, setSource] = useState<'purchase' | 'opening'>(purchases.length ? 'purchase' : 'opening')
  const [purchaseId, setPurchaseId] = useState('')
  const [label, setLabel] = useState('')
  const [total, setTotal] = useState('')
  const [count, setCount] = useState('1')
  const [firstDue, setFirstDue] = useState('')
  const [error, setError] = useState('')
  const purchase = purchases.find((item) => item.id === purchaseId)
  const totalValue = source === 'purchase' && purchase && !total ? purchase.amount : Number(total)
  const installments = WHOLE.test(count) && Number(count) >= 1 && Number(count) <= 36 ? Number(count) : 0
  // Equal installments; any remainder yen goes on the first payment so the parts add up exactly.
  const plan = useMemo(() => {
    if (!installments || !(totalValue > 0) || !isValidISODate(firstDue)) return []
    const base = Math.floor(totalValue / installments)
    const [year, month, day] = firstDue.split('-').map(Number)
    return Array.from({ length: installments }, (_, index) => {
      const target = new Date(Date.UTC(year, month - 1 + index, 1))
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
      const date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10)
      return { due_date: date, principal_due: base + (index === 0 ? totalValue - base * installments : 0) }
    })
  }, [firstDue, installments, totalValue])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (source === 'purchase' && !purchase) { setError('Choose the purchase these payments are for.'); return }
    if (source === 'opening' && !label.trim()) { setError('Describe the existing debt, for example “Balance on start date”.'); return }
    if (!plan.length) { setError('Enter the amount, number of payments (1–36) and a valid first due date.'); return }
    void once(async () => {
      setError('')
      let created = 0
      try {
        for (const row of plan) {
          await create.mutateAsync({ cardId: card.id, payload: { ...row, source: 'estimate', ...(source === 'purchase' ? { purchase_event_id: purchase!.id } : { opening_obligation: label.trim() }) } })
          created += 1
        }
        onDone(`${created} payment ${created === 1 ? 'date' : 'dates'} added.`)
      } catch (cause) {
        setError(`${created ? `${created} of ${plan.length} payment dates were added before this failed. ` : ''}${message(cause)}`)
      }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Payment dates spread when you repay existing debt. They don’t add debt or spending: the purchase was already counted once when you made it.</p>
    <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">These payments are for</legend>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="schedule-source" checked={source === 'purchase'} onChange={() => setSource('purchase')} disabled={!purchases.length} />A purchase on this card</label>
      <label className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="schedule-source" checked={source === 'opening'} onChange={() => setSource('opening')} />Debt that was already owed on the start date</label>
    </fieldset>
    {source === 'purchase' ? <Select id="schedule-purchase" label="Purchase" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)}><option value="">Select a purchase</option>{purchases.map((item) => <option key={item.id} value={item.id}>{item.description || 'Purchase'} · {formatJPY(item.amount)}{item.occurred_on ? ` · ${formatDate(item.occurred_on)}` : ''}</option>)}</Select>
      : <Input id="schedule-label" label="Description of the debt" value={label} onChange={(event) => setLabel(event.target.value)} />}
    <div className="grid gap-4 sm:grid-cols-3">
      <Input id="schedule-total" label="Total to repay (JPY)" inputMode="numeric" placeholder={purchase ? String(purchase.amount) : ''} value={total} onChange={(event) => setTotal(event.target.value)} />
      <Input id="schedule-count" label="Number of payments" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
      <Input id="schedule-first" label="First due date" type="date" value={firstDue} onChange={(event) => setFirstDue(event.target.value)} />
    </div>
    {plan.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="text-left text-sm font-medium">Payments to add</caption><thead><tr><th className="py-1 text-left text-slate-500">Due</th><th className="py-1 text-right text-slate-500">Amount</th></tr></thead><tbody>{plan.map((row) => <tr key={row.due_date} className="border-t border-slate-100"><td className="py-1">{formatDate(row.due_date)}</td><td className="py-1 text-right">{formatJPY(row.principal_due)}</td></tr>)}</tbody></table></div>}
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={create.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={create.isPending}>Add payment dates</Button></div>
  </form>
}

function RescheduleForm({ card, schedule, onDone }: { card: Account; schedule: CardSchedule; onDone: (message?: string) => void }) {
  const update = useUpdateCardSchedule()
  const once = useSingleFlight()
  const [date, setDate] = useState(schedule.due_date)
  const [amount, setAmount] = useState(String(schedule.principal_due))
  const [actual, setActual] = useState(schedule.source === 'actual')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValidISODate(date) || !positiveYen(amount)) { setError('Enter a valid date and a whole yen amount.'); return }
    void once(async () => {
      setError('')
      try { await update.mutateAsync({ cardId: card.id, scheduleId: schedule.id, payload: { due_date: date, principal_due: Number(amount), source: actual ? 'actual' : 'estimate' } }); onDone('Payment date updated.') }
      catch (cause) { setError(message(cause)) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <Input id="reschedule-date" label="Due date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    <Input id="reschedule-amount" label="Amount due (JPY)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
    <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={actual} onChange={(event) => setActual(event.target.checked)} />This matches my card statement</label>
    <p className="text-xs text-slate-500">An estimated date is not marked paid when it passes; record the repayment when the money leaves your bank.</p>
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={update.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={update.isPending}>Save</Button></div>
  </form>
}

function ReserveForm({ card, schedule, defaultAccount, liquid, today, onDone }: { card: Account; schedule: CardSchedule; defaultAccount?: string; liquid: Account[]; today: ISODate; onDone: (message?: string) => void }) {
  const fund = useFundCardReserve()
  const once = useSingleFlight()
  const [account, setAccount] = useState(defaultAccount ?? '')
  const [amount, setAmount] = useState(String(schedule.unfunded))
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!account || !positiveYen(amount)) { setError('Choose an account and a whole yen amount greater than zero.'); return }
    void once(async () => {
      setError('')
      try { await fund.mutateAsync({ cardId: card.id, scheduleId: schedule.id, payload: { account_id: account, amount: Number(amount), as_of_date: today } }); onDone(`${formatJPY(Number(amount))} reserved for the ${formatDate(schedule.due_date)} payment.`) }
      catch (cause) { setError(message(cause)) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Reserving sets aside money you already have so it isn’t counted as available to spend. No money moves between accounts, and nothing is paid until you record the repayment.</p>
    <Select id="reserve-account" label="Reserve from" value={account} onChange={(event) => setAccount(event.target.value)}><option value="">Select an account</option>{liquid.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <Input id="reserve-amount" label="Amount to reserve (JPY)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
    <p className="text-xs text-slate-500">Still needed for this payment: {formatJPY(schedule.unfunded)} of {formatJPY(schedule.outstanding)}.</p>
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={fund.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={fund.isPending}>Reserve money</Button></div>
  </form>
}

function LinkForm({ card, schedule, candidates, kind, onDone }: { card: Account; schedule: CardSchedule; candidates: FinancialEvent[]; kind: 'payment' | 'refund'; onDone: (message?: string) => void }) {
  const linkPayment = useLinkCardPayment()
  const linkRefund = useLinkCardRefund()
  const once = useSingleFlight()
  const [eventId, setEventId] = useState('')
  const [amount, setAmount] = useState(String(schedule.outstanding))
  const [error, setError] = useState('')
  const pending = linkPayment.isPending || linkRefund.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!eventId || !positiveYen(amount)) { setError(`Choose a ${kind === 'payment' ? 'repayment' : 'refund'} and a whole yen amount.`); return }
    void once(async () => {
      setError('')
      try {
        if (kind === 'payment') await linkPayment.mutateAsync({ cardId: card.id, scheduleId: schedule.id, payload: { repayment_event_id: eventId, amount: Number(amount) } })
        else await linkRefund.mutateAsync({ cardId: card.id, scheduleId: schedule.id, payload: { refund_event_id: eventId, amount: Number(amount) } })
        onDone(kind === 'payment' ? 'Repayment applied to this payment date.' : 'Refund applied; less is now due.')
      } catch (cause) { setError(message(cause)) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    {!candidates.length ? <Alert tone="info">{kind === 'payment' ? 'No card repayments to this card are recorded yet.' : 'No refunds of this purchase are recorded yet.'}</Alert>
      : <Select id="link-event" label={kind === 'payment' ? 'Repayment' : 'Refund'} value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Select one</option>{candidates.map((item) => <option key={item.id} value={item.id}>{formatJPY(item.amount)} on {item.occurred_on ? formatDate(item.occurred_on) : 'unknown date'}{item.description ? ` · ${item.description}` : ''}</option>)}</Select>}
    <Input id="link-amount" label="Amount to apply (JPY)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={pending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={pending} disabled={!candidates.length}>Apply</Button></div>
  </form>
}

function StatementForm({ card, group, onDone }: { card: Account; group: CardStatementGroup; onDone: (message?: string) => void }) {
  const confirm = useConfirmCardStatement()
  const once = useSingleFlight()
  const [closing, setClosing] = useState('')
  const [total, setTotal] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValidISODate(closing) || !WHOLE.test(total)) { setError('Enter the statement closing date and its total.'); return }
    void once(async () => {
      setError('')
      try { await confirm.mutateAsync({ cardId: card.id, payload: { closing_on: closing, due_date: group.due_date, principal_confirmed: Number(total), schedule_ids: group.schedule_ids } }); onDone('Statement confirmed.') }
      catch (cause) { setError(`${message(cause)} If your statement shows a different total, correct the individual payment dates first.`) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Confirm the {formatDate(group.due_date)} withdrawal against your card statement. The statement total should equal the {group.schedule_ids.length} payment {group.schedule_ids.length === 1 ? 'date' : 'dates'} it covers ({formatJPY(group.principal_due)}); it is not added on top of them.</p>
    <Input id="statement-closing" label="Statement closing date" type="date" value={closing} onChange={(event) => setClosing(event.target.value)} />
    <Input id="statement-total" label="Statement total (JPY)" inputMode="numeric" value={total} onChange={(event) => setTotal(event.target.value)} />
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={confirm.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={confirm.isPending}>Confirm statement</Button></div>
  </form>
}

type CardDialog =
  | { type: 'schedule' } | { type: 'pay'; schedule: CardSchedule } | { type: 'reserve'; schedule: CardSchedule } | { type: 'reschedule'; schedule: CardSchedule }
  | { type: 'link'; schedule: CardSchedule; kind: 'payment' | 'refund' } | { type: 'statement'; group: CardStatementGroup }

function CardDetail({ card, options, accounts }: { card: Account; options: EntryOptions; accounts: Account[] }) {
  const settings = useCardSettings(card.id)
  const schedules = useCardSchedules(card.id)
  const statements = useCardStatements(card.id)
  const purchases = useFinancialEvents({ account_id: card.id, kind: 'EXPENSE', page_size: 100 })
  const repayments = useFinancialEvents({ account_id: card.id, kind: 'CARD_REPAYMENT', page_size: 100 })
  const refunds = useFinancialEvents({ account_id: card.id, kind: 'REFUND', page_size: 100 })
  const linkPayment = useLinkCardPayment()
  const [dialog, setDialog] = useState<CardDialog | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const active = accounts.filter((account) => account.archived_at === null)
  const banks = active.filter((account) => account.kind === 'BANK')
  const liquid = active.filter((account) => account.kind !== 'CREDIT_CARD')
  const purchaseMap = new Map((purchases.data?.items ?? []).map((item) => [item.id, item]))
  const openPurchases = (purchases.data?.items ?? []).filter((item) => !item.is_reversal)
  const linkError = useRef<string | null>(null)
  const close = (text?: string) => {
    setDialog(null)
    if (linkError.current) { setFeedback({ text: linkError.current, error: true }); linkError.current = null }
    else if (text) setFeedback({ text, error: false })
  }
  const titles: Record<CardDialog['type'], string> = { schedule: 'Add payment dates', pay: 'Record repayment', reserve: 'Reserve money for this payment', reschedule: 'Change payment date', link: 'Apply an existing entry', statement: 'Confirm statement' }

  // A repayment is one canonical movement; it is linked to its schedule, never posted as an expense.
  const onRepaymentCreated = (schedule: CardSchedule) => async (event: FinancialEvent) => {
    try { await linkPayment.mutateAsync({ cardId: card.id, scheduleId: schedule.id, payload: { repayment_event_id: event.id, amount: Math.min(event.amount, schedule.outstanding) } }) }
    catch (error) { linkError.current = `The repayment was recorded but could not be applied to the ${formatDate(schedule.due_date)} payment. ${message(error)} Use “Apply repayment” to link it.` }
  }

  return <div className="space-y-6">
    <CardSummary card={card} options={options} banks={new Map(accounts.map((account) => [account.id, account]))} detail />
    {feedback && <Alert tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Alert>}
    <SettingsForm card={card} banks={banks} />

    <section aria-labelledby="due-heading" className="space-y-3">
      <h3 id="due-heading" className="text-lg font-semibold">Upcoming withdrawals</h3>
      {statements.isLoading ? <Skeleton className="h-24" /> : statements.isError ? <Alert>Could not load withdrawals. {normalizeApiError(statements.error).message}</Alert>
        : !statements.data?.length ? <p className="text-sm text-slate-600">No payment dates yet.</p>
        : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Withdrawals grouped by due date</caption>
          <thead className="bg-slate-50"><tr>{['Due date', 'Status', 'Still due', 'Reserved', 'Not reserved', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{statements.data.map((group) => <tr key={`${group.due_date}-${group.statement_id ?? 'estimate'}`}>
            <td className="whitespace-nowrap px-3 py-2">{formatDate(group.due_date)}</td>
            <td className="px-3 py-2"><StatusBadge tone={group.statement_id ? 'muted' : 'warn'}>{group.statement_id ? `Statement closed ${group.closing_on ? formatDate(group.closing_on) : ''}` : group.source === 'actual' ? 'Matches statement' : 'Estimated'}</StatusBadge></td>
            <td className="px-3 py-2 font-semibold">{formatJPY(group.outstanding)}</td>
            <td className="px-3 py-2">{formatJPY(group.funded_reserve)}</td>
            <td className={`px-3 py-2 ${group.outstanding - group.funded_reserve > 0 ? 'font-semibold text-amber-800' : ''}`}>{formatJPY(Math.max(0, group.outstanding - group.funded_reserve))}</td>
            <td className="px-3 py-2">{!group.statement_id && group.outstanding > 0 && <Button variant="ghost" className="px-3" onClick={() => setDialog({ type: 'statement', group })}>Confirm statement<span className="sr-only"> due {group.due_date}</span></Button>}</td>
          </tr>)}</tbody></table></div>}
    </section>

    <section aria-labelledby="schedule-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="schedule-heading" className="text-lg font-semibold">Payment dates</h3><Button variant="secondary" disabled={purchases.isLoading} onClick={() => setDialog({ type: 'schedule' })}>Add payment dates</Button></div>
      {schedules.isLoading ? <Skeleton className="h-32" /> : schedules.isError ? <div className="space-y-2"><Alert>Could not load payment dates. {normalizeApiError(schedules.error).message}</Alert><Button variant="secondary" onClick={() => schedules.refetch()}>Try again</Button></div>
        : !schedules.data?.length ? <EmptyState title="No payment dates" description="Add when each purchase or existing balance will be withdrawn, including interest-free installments." />
        : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">Card payment dates</caption>
          <thead className="bg-slate-50"><tr>{['Due date', 'For', 'Amount due', 'Paid', 'Refunded', 'Still due', 'Reserved', 'Status', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{schedules.data.map((schedule) => {
            const purchase = schedule.purchase_event_id ? purchaseMap.get(schedule.purchase_event_id) : undefined
            const status = scheduleStatus[schedule.status]
            const open = schedule.outstanding > 0
            const label = `${formatDate(schedule.due_date)} ${purchase?.description ?? schedule.opening_obligation ?? ''}`
            return <tr key={schedule.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2">{formatDate(schedule.due_date)}</td>
              <td className="px-3 py-2">{schedule.opening_obligation ?? (purchase ? `${purchase.description || 'Purchase'}${purchase.occurred_on ? ` (${formatDate(purchase.occurred_on)})` : ''}` : 'Card purchase')}</td>
              <td className="px-3 py-2">{formatJPY(schedule.principal_due)}</td>
              <td className="px-3 py-2">{formatJPY(schedule.paid)}</td>
              <td className="px-3 py-2">{formatJPY(schedule.refunded)}</td>
              <td className="px-3 py-2 font-semibold">{formatJPY(schedule.outstanding)}</td>
              <td className="px-3 py-2">{formatJPY(schedule.funded_reserve)}{schedule.unfunded > 0 && <p className="text-xs text-amber-800">{formatJPY(schedule.unfunded)} short</p>}</td>
              <td className="px-3 py-2"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{schedule.source === 'estimate' && schedule.status !== 'paid' && schedule.due_date < options.local_today && <p className="mt-1 text-xs text-amber-800">Date passed; record the repayment if it was paid</p>}</td>
              <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{open && <>
                <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'pay', schedule })}>Record repayment<span className="sr-only"> for {label}</span></Button>
                {schedule.unfunded > 0 && <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'reserve', schedule })}>Reserve<span className="sr-only"> for {label}</span></Button>}
                <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'link', schedule, kind: 'payment' })}>Apply repayment<span className="sr-only"> to {label}</span></Button>
                {schedule.purchase_event_id && <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'link', schedule, kind: 'refund' })}>Apply refund<span className="sr-only"> to {label}</span></Button>}
                {!schedule.statement_id && <Button variant="ghost" className="px-2" onClick={() => setDialog({ type: 'reschedule', schedule })}>Change<span className="sr-only"> {label}</span></Button>}
              </>}</div></td>
            </tr>
          })}</tbody></table></div>}
    </section>

    <Dialog open={dialog !== null} title={dialog ? titles[dialog.type] : ''} onClose={() => close()}>
      {dialog?.type === 'schedule' && <ScheduleForm card={card} purchases={openPurchases} onDone={close} />}
      {dialog?.type === 'pay' && <EventForm mode="repayment" options={options} defaults={{ account_id: settings.data?.settlement_account_id ?? '', destination_account_id: card.id, amount: String(dialog.schedule.outstanding), date: dialog.schedule.due_date <= options.local_today ? dialog.schedule.due_date : options.local_today }} onCreated={onRepaymentCreated(dialog.schedule)} onDone={close} />}
      {dialog?.type === 'reserve' && <ReserveForm card={card} schedule={dialog.schedule} defaultAccount={settings.data?.settlement_account_id} liquid={liquid} today={options.local_today} onDone={close} />}
      {dialog?.type === 'reschedule' && <RescheduleForm card={card} schedule={dialog.schedule} onDone={close} />}
      {dialog?.type === 'link' && <LinkForm card={card} schedule={dialog.schedule} kind={dialog.kind} candidates={dialog.kind === 'payment' ? (repayments.data?.items ?? []).filter((item) => !item.is_reversal) : (refunds.data?.items ?? []).filter((item) => !item.is_reversal && item.original_event_id === dialog.schedule.purchase_event_id)} onDone={close} />}
      {dialog?.type === 'statement' && <StatementForm card={card} group={dialog.group} onDone={close} />}
    </Dialog>
  </div>
}

export function CardsPage() {
  const { cardId } = useParams()
  const accounts = useAccounts(true)
  const options = useEntryOptions()
  const cards = (accounts.data ?? []).filter((account) => account.kind === 'CREDIT_CARD' && (account.archived_at === null || account.id === cardId))
  const card = cardId ? cards.find((item) => item.id === cardId) : undefined
  const banks = new Map((accounts.data ?? []).map((account) => [account.id, account]))
  const heading = card ? card.name : 'Cards'
  return <section aria-labelledby="cards-heading" className="space-y-6">
    <div><h2 id="cards-heading" className="text-2xl font-bold tracking-tight">{heading}</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">{card ? 'What you owe, when it will be withdrawn, and how much money you have set aside for it.' : 'Card purchases count as spending when you buy. Here you track what you owe and keep money ready for each withdrawal.'}</p>{card && <Link to="/cards" className="mt-2 inline-block text-sm font-semibold text-indigo-700 underline">All cards</Link>}</div>
    {accounts.isLoading || options.isLoading ? <Skeleton className="h-40" />
      : accounts.isError || options.isError ? <div className="space-y-3"><Alert>Could not load cards. {normalizeApiError(accounts.error ?? options.error).message}</Alert><Button variant="secondary" onClick={() => { accounts.refetch(); options.refetch() }}>Try again</Button></div>
      : cardId ? (card && options.data ? <CardDetail card={card} options={options.data} accounts={accounts.data ?? []} /> : <EmptyState title="Card not found" description="It may have been removed from your accounts." action={<Link to="/cards" className="font-semibold text-indigo-700 underline">All cards</Link>} />)
      : !cards.length ? <EmptyState title="No cards yet" description="Add a credit card on the Accounts page to track what you owe." action={<Link to="/accounts" className="font-semibold text-indigo-700 underline">Go to Accounts</Link>} />
      : <div className="grid gap-6">{options.data && cards.map((item) => <CardSummary key={item.id} card={item} options={options.data!} banks={banks} />)}</div>}
  </section>
}
