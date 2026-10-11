import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useAccountBalance, useAccounts, useEntryOptions } from '@/api/hooks/accounts'
import { useFinancialPosition, useRecordHoldingsChange, useRecordValuation, useValuations } from '@/api/hooks/investments'
import { useSingleFlight } from '@/api/idempotency'
import type { Account, ISODate, PositionAccount } from '@/api/types'
import { Amount, StatusBadge } from '@/components/finance/Amount'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/FormControls'
import { formatDate, formatJPY } from '@/utils/format'
import { isValidISODate } from '@/utils/reporting'

const WHOLE = /^\d+$/

function ValuationForm({ account, today, onDone }: { account: Account; today: ISODate; onDone: (message?: string) => void }) {
  const record = useRecordValuation()
  const once = useSingleFlight()
  const [date, setDate] = useState(today)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValidISODate(date) || !WHOLE.test(value) || !Number.isSafeInteger(Number(value))) { setError('Enter the valuation date and a whole number of yen.'); return }
    void once(async () => {
      setError('')
      try { await record.mutateAsync({ accountId: account.id, payload: { as_of_date: date, market_value: Number(value) } }); onDone(`Securities value for ${account.name} recorded for ${formatDate(date)}.`) }
      catch (cause) {
        const apiError = normalizeApiError(cause)
        setError(apiError.kind === 'conflict' ? 'A value is already recorded for that date and is kept as history. Choose another date for the new value.' : apiError.message)
      }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Enter the market value of the securities only, as shown by your broker. Leave out uninvested cash; that is tracked as the account balance. Nothing is fetched or traded.</p>
    <Input id="valuation-date" label="Value as of" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    <Input id="valuation-value" label="Securities value (JPY)" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={record.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={record.isPending}>Record value</Button></div>
  </form>
}

function HoldingsChangeForm({ account, today, onDone }: { account: Account; today: ISODate; onDone: (message?: string) => void }) {
  const record = useRecordHoldingsChange()
  const once = useSingleFlight()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [gain, setGain] = useState('')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!isValidISODate(date) || !note.trim() || (gain && !/^-?\d+$/.test(gain))) { setError('Enter a date and a short note. A realized gain, if entered, must be whole yen.'); return }
    void once(async () => {
      setError('')
      try { await record.mutateAsync({ accountId: account.id, payload: { occurred_on: date, note: note.trim(), user_entered_realized_gain: gain ? Number(gain) : null } }); onDone('Holdings change noted. Record a new securities value to bring net worth up to date.') }
      catch (cause) { setError(normalizeApiError(cause).message) }
    })
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {error && <Alert>{error}</Alert>}
    <p className="text-sm text-slate-600">Note a buy or sell you made at your broker. This only records that holdings changed; it does not place a trade. Sale proceeds stay in brokerage cash and are not salary.</p>
    <Input id="holdings-date" label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    <Input id="holdings-note" label="What changed" value={note} onChange={(event) => setNote(event.target.value)} />
    <Input id="holdings-gain" label="Realized gain or loss you calculated (optional, JPY)" inputMode="numeric" value={gain} onChange={(event) => setGain(event.target.value)} />
    <div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={record.isPending} onClick={() => onDone()}>Cancel</Button><Button type="submit" loading={record.isPending}>Save note</Button></div>
  </form>
}

function BrokerageCard({ account, today, position, onValue, onChange }: { account: Account; today: ISODate; position: PositionAccount | undefined; onValue: () => void; onChange: () => void }) {
  const balance = useAccountBalance(account.id, today)
  const valuations = useValuations(account.id)
  const securities = position?.securities
  const latest = [...(valuations.data ?? [])].sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0]
  return <article aria-labelledby={`broker-${account.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 id={`broker-${account.id}`} className="text-lg font-semibold">{account.name}</h3><div className="flex gap-2"><Button onClick={onValue}>Record value<span className="sr-only"> for {account.name}</span></Button><Button variant="secondary" onClick={onChange}>Note a trade<span className="sr-only"> for {account.name}</span></Button></div></div>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-600">Brokerage cash</dt><dd className="text-2xl font-bold">{balance.isLoading ? <Skeleton className="h-8 w-28" /> : balance.isError ? <span className="text-sm">Unavailable</span> : <Amount value={balance.data?.balance ?? null} unknown="Opening balance needed" />}</dd></div>
      <div><dt className="text-sm text-slate-600">Securities value</dt><dd className="text-2xl font-bold">{valuations.isLoading ? <Skeleton className="h-8 w-28" /> : latest ? formatJPY(latest.market_value) : <span className="text-base text-amber-800">No value recorded</span>}</dd>
        {latest && <p className="text-xs text-slate-500">As of {formatDate(latest.as_of_date)} · entered manually · securities only</p>}</div>
    </dl>
    {securities?.status === 'stale_after_holdings_change' && <Alert tone="info">Holdings changed after the last value. Record a new value so net worth isn’t based on outdated holdings.</Alert>}
    {securities?.status === 'missing' && <Alert tone="info">Net worth needs a securities value for this account.</Alert>}
    {valuations.data && valuations.data.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium">Value history ({valuations.data.length})</summary><table className="mt-2 min-w-full"><caption className="sr-only">Securities value history for {account.name}</caption><thead><tr><th className="py-1 text-left text-slate-500">As of</th><th className="py-1 text-right text-slate-500">Value</th></tr></thead><tbody>{valuations.data.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="py-1">{formatDate(row.as_of_date)}</td><td className="py-1 text-right">{formatJPY(row.market_value)}</td></tr>)}</tbody></table></details>}
    {valuations.isError && <Alert>Could not load value history. {normalizeApiError(valuations.error).message}</Alert>}
  </article>
}

type InvestmentDialog = { type: 'value' | 'change'; account: Account }

export function InvestmentsPage() {
  const accounts = useAccounts()
  const options = useEntryOptions()
  const today = options.data?.local_today
  const position = useFinancialPosition(today)
  const [dialog, setDialog] = useState<InvestmentDialog | null>(null)
  const [feedback, setFeedback] = useState('')
  const brokers = (accounts.data ?? []).filter((account) => account.kind === 'BROKERAGE_CASH')
  const positions = new Map((position.data?.accounts ?? []).map((row) => [row.account_id, row]))
  const close = (message?: string) => { setDialog(null); if (message) setFeedback(message) }
  return <section aria-labelledby="investments-heading" className="space-y-6">
    <div><h2 id="investments-heading" className="text-2xl font-bold tracking-tight">Investments</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Track brokerage cash and the value of your securities, entered by hand. Investments count toward net worth, not toward money you can spend. No prices are fetched, no advice is given and no trades are placed.</p></div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    <p className="text-sm text-slate-600">Moving money into a brokerage account? <Link to="/transfers" className="font-semibold text-indigo-700 underline">Record a transfer</Link>. It moves money you already own, so it doesn’t change net worth.</p>
    {accounts.isLoading || options.isLoading ? <Skeleton className="h-40" />
      : accounts.isError || options.isError ? <div className="space-y-2"><Alert>Could not load investments. {normalizeApiError(accounts.error ?? options.error).message}</Alert><Button variant="secondary" onClick={() => { accounts.refetch(); options.refetch() }}>Try again</Button></div>
      : !brokers.length ? <EmptyState title="No brokerage accounts" description="Add a brokerage cash account on the Accounts page to track investments." action={<Link to="/accounts" className="font-semibold text-indigo-700 underline">Go to Accounts</Link>} />
      : today && <div className="grid gap-6">{brokers.map((account) => <BrokerageCard key={account.id} account={account} today={today} position={positions.get(account.id)} onValue={() => setDialog({ type: 'value', account })} onChange={() => setDialog({ type: 'change', account })} />)}</div>}
    {position.data && <p className="text-sm">Net worth today: <strong><Amount value={position.data.net_worth} unknown="Needs review" /></strong> · <Link to="/reports" className="font-semibold text-indigo-700 underline">See the full breakdown</Link>{position.data.coverage === 'incomplete' && <> <StatusBadge tone="warn">Incomplete</StatusBadge></>}</p>}
    <Dialog open={dialog !== null} title={dialog ? `${dialog.type === 'value' ? 'Record securities value' : 'Note a trade'} · ${dialog.account.name}` : ''} onClose={() => close()}>
      {dialog?.type === 'value' && today && <ValuationForm account={dialog.account} today={today} onDone={close} />}
      {dialog?.type === 'change' && today && <HoldingsChangeForm account={dialog.account} today={today} onDone={close} />}
    </Dialog>
  </section>
}
