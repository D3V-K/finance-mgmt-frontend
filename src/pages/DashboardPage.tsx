import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { normalizeApiError } from '@/api/errors'
import { useAccounts } from '@/api/hooks/accounts'
import { useCanonicalMonthlyReport } from '@/api/hooks/events'
import { useCashForecast, useDashboard } from '@/api/hooks/forecast'
import type { AvailableCashAccount, BalanceStatus, Dashboard, ForecastScenario, ISODate } from '@/api/types'
import { Amount, StatusBadge } from '@/components/finance/Amount'
import { MigrationNotice } from '@/components/finance/MigrationNotice'
import { Button } from '@/components/ui/Button'
import { Alert, Skeleton } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/FormControls'
import { isFeatureEnabled } from '@/config/features'
import { formatDate, formatJPY } from '@/utils/format'
import { addDays, isValidISODate } from '@/utils/reporting'

const HORIZONS = { payday: 'Until next payday', '30': 'Next 30 days', '90': 'Next 90 days' } as const
type Horizon = keyof typeof HORIZONS

const coverageReason: Record<BalanceStatus, string> = {
  complete: '', unavailable: 'Opening balance needed', incomplete_legacy_mapping: 'Earlier records not yet assigned',
}

function Panel({ id, title, children, action }: { id: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <section aria-labelledby={id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h3 id={id} className="font-semibold text-slate-950">{title}</h3>{action}</div>{children}</section>
}

function Retry({ text, error, retry }: { text: string; error: unknown; retry: () => void }) {
  return <div className="space-y-2"><Alert>{text} {normalizeApiError(error).message}</Alert><Button variant="secondary" onClick={retry}>Try again</Button></div>
}

/** Links each server warning to the screen that resolves it; the warning text itself is shown verbatim. */
function warningLink(warning: string) {
  if (/legacy|mapping|cutover/i.test(warning)) return isFeatureEnabled('cutover') ? { to: '/setup/migration', label: 'Review migration' } : null
  if (/opening/i.test(warning)) return { to: '/accounts', label: 'Check accounts' }
  if (/settlement|card/i.test(warning)) return isFeatureEnabled('cards') ? { to: '/cards', label: 'Open cards' } : null
  if (/reconcil|statement/i.test(warning)) return isFeatureEnabled('reconciliation') ? { to: '/review', label: 'Open review' } : null
  if (/securities|valuation|position/i.test(warning)) return isFeatureEnabled('investments') ? { to: '/investments', label: 'Update values' } : null
  if (/settings/i.test(warning)) return isFeatureEnabled('budgets') ? { to: '/budget', label: 'Payday settings' } : null
  if (/purchase dates/i.test(warning)) return { to: '/transactions?view=earlier', label: 'See earlier records' }
  return null
}

function Headline({ data, names }: { data: Dashboard; names: Map<string, string> }) {
  const rows = data.available_cash.accounts
  const complete = data.available_cash.coverage === 'complete' && rows.every((row) => row.spendable !== null)
  // A total is only meaningful when every account is known; otherwise each account is listed with its reason.
  const total = complete ? rows.reduce((sum, row) => sum + (row.spendable ?? 0), 0) : null
  const next = [...data.upcoming_withdrawals].sort((a, b) => a.date.localeCompare(b.date))[0]
  return <div className="grid gap-4 lg:grid-cols-3">
    <article aria-labelledby="available-heading" className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
      <h3 id="available-heading" className="text-sm font-medium text-indigo-900">Available after commitments</h3>
      <p className="mt-2 text-3xl font-bold tracking-tight text-indigo-950"><Amount value={total} unknown="Needs review" /></p>
      <p className="mt-1 text-xs text-indigo-900">{complete ? 'Cash minus money set aside and known bills due by the next payday. Each account must cover its own withdrawals.' : 'Some accounts are incomplete, so no total is shown. See each account below.'}</p>
    </article>
    <article aria-labelledby="budget-left-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="budget-left-heading" className="text-sm font-medium text-slate-600">Left in this payday’s budget</h3>
      <p className="mt-2 text-3xl font-bold tracking-tight"><Amount value={data.available_cash.remaining_discretionary_budget} unknown="Needs review" /></p>
      <p className="mt-1 text-xs text-slate-500">{data.available_cash.remaining_discretionary_budget === null ? 'Some purchase dates are unknown, so remaining budget can’t be calculated.' : `Cycle ${formatDate(data.cycle.start)} – ${formatDate(addDays(data.cycle.end_exclusive, -1))}.`}{isFeatureEnabled('budgets') && <> <Link to="/budget" className="font-semibold text-indigo-700 underline">Budget details</Link></>}</p>
    </article>
    <article aria-labelledby="next-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="next-heading" className="text-sm font-medium text-slate-600">Next withdrawal</h3>
      {next ? <><p className="mt-2 text-3xl font-bold tracking-tight">{formatJPY(-next.amount)}</p><p className="mt-1 text-xs text-slate-500">{next.label} from {names.get(next.account_id) ?? 'an account'} on {formatDate(next.date)} · {/^estimat/.test(next.certainty) ? 'estimated' : 'confirmed'}</p></> : <p className="mt-2 text-sm text-slate-600">No scheduled withdrawals before the next payday.</p>}
    </article>
  </div>
}

function AccountsTable({ rows, names, lowest }: { rows: AvailableCashAccount[]; names: Map<string, string>; lowest: Dashboard['lowest_projected_balance_by_account'] }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Cash available by account</caption>
    <thead><tr className="border-b border-slate-200">{['Account', 'Account balance', 'Set aside', 'Due, not yet reserved', 'Available after commitments', 'Lowest before payday'].map((heading) => <th key={heading} scope="col" className="py-2 pr-3 text-left font-medium text-slate-500">{heading}</th>)}</tr></thead>
    <tbody>{rows.map((row) => {
      const low = lowest[row.account_id]
      return <tr key={row.account_id} className="border-b border-slate-100 align-top">
        <th scope="row" className="py-2 pr-3 text-left font-medium">{names.get(row.account_id) ?? 'Account'}{row.coverage !== 'complete' && <span className="mt-1 block"><StatusBadge tone="warn">Needs review: {coverageReason[row.coverage]}</StatusBadge></span>}</th>
        <td className="py-2 pr-3"><Amount value={row.liquid_balance} unknown="Needs review" /></td>
        <td className="py-2 pr-3">{formatJPY(row.funded_earmarks)}</td>
        <td className="py-2 pr-3">{formatJPY(row.unfunded_known_due)}</td>
        <td className="py-2 pr-3 font-semibold"><Amount value={row.spendable} unknown="Needs review" />{row.raw_available !== null && row.raw_available < 0 && <span className="block text-xs font-semibold text-rose-700">Short by {formatJPY(-row.raw_available)} for what is due</span>}</td>
        <td className="py-2 pr-3">{low ? <><Amount value={low.balance} /><span className="block text-xs text-slate-500">{formatDate(low.date)}</span></> : <span className="text-slate-500">—</span>}</td>
      </tr>
    })}</tbody></table></div>
}

function Forecast({ asOf, to, scenario, account, accounts, names, onAccount }: { asOf: ISODate; to: ISODate; scenario: ForecastScenario; account: string; accounts: string[]; names: Map<string, string>; onAccount: (id: string) => void }) {
  const forecast = useCashForecast(asOf, to, scenario)
  const days = useMemo(() => (forecast.data?.days ?? []).filter((day) => day.account_id === account), [account, forecast.data])
  const chart = days.map((day) => ({ date: day.date, label: formatDate(day.date), balance: day.end_balance }))
  const lowest = forecast.data?.lowest_by_account[account]
  const shortfalls = days.filter((day) => day.shortfall)
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><Select id="forecast-account" label="Account" value={account} onChange={(event) => onAccount(event.target.value)}>{accounts.map((id) => <option key={id} value={id}>{names.get(id) ?? 'Account'}</option>)}</Select></div>
    {forecast.isLoading ? <Skeleton className="h-64" /> : forecast.isError ? <Retry text="Could not load the forecast." error={forecast.error} retry={() => forecast.refetch()} /> : !days.length ? <p className="text-sm text-slate-600">No forecast for this account.</p> : <>
      <p className="text-sm text-slate-700">{lowest ? <>Lowest projected balance: <strong><Amount value={lowest.balance} /></strong> on {formatDate(lowest.date)}.</> : 'The starting balance is unknown, so no projection is shown. Set the opening balance first.'} Scenario: <strong>{scenario === 'baseline' ? 'baseline (confirmed and estimated items only)' : 'including scenario items such as an unconfirmed bonus'}</strong>.</p>
      {shortfalls.length > 0 && <Alert>{names.get(account) ?? 'This account'} is projected to go below zero on {formatDate(shortfalls[0].date)}. Money in other accounts does not cover it automatically; move money in or reschedule a payment.</Alert>}
      {forecast.data?.warnings.map((warning) => <Alert key={warning} tone="info">{warning}</Alert>)}
      <div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis width={72} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => value == null ? 'Unknown' : formatJPY(Number(value))} /><ReferenceLine y={0} stroke="#be123c" strokeDasharray="4 4" /><Line type="stepAfter" dataKey="balance" name="Projected balance" stroke="#4f46e5" strokeWidth={2} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div>
      <div className="max-h-96 overflow-auto"><table className="min-w-full text-sm"><caption className="sr-only">Projected balance by day for {names.get(account) ?? 'this account'}</caption>
        <thead className="sticky top-0 bg-white"><tr className="border-b border-slate-200">{['Date', 'Movements', 'End of day'].map((heading) => <th key={heading} scope="col" className="py-2 pr-3 text-left font-medium text-slate-500">{heading}</th>)}</tr></thead>
        <tbody>{days.filter((day, index) => index === 0 || day.movements.length || day.shortfall).map((day) => <tr key={day.date} className="border-b border-slate-100 align-top">
          <th scope="row" className="whitespace-nowrap py-2 pr-3 text-left font-medium">{formatDate(day.date)}</th>
          <td className="py-2 pr-3">{day.movements.length ? <ul className="space-y-1">{day.movements.map((item, index) => <li key={`${item.id}-${index}`}><Amount value={item.amount} /> {item.label}{item.source === 'actual' ? ' (recorded)' : item.certainty === 'scenario_only' ? ' (scenario)' : ` (${item.certainty.replace(/_/g, ' ')})`}</li>)}</ul> : <span className="text-slate-500">Starting balance</span>}{day.intraday_order_uncertain && <p className="mt-1 text-xs text-amber-800">Same-day order unknown: money in and out on this day may clear in either order.</p>}</td>
          <td className="py-2 pr-3 font-semibold"><Amount value={day.end_balance} unknown={coverageReason[day.coverage] || 'Needs review'} />{day.shortfall && <span className="block text-xs font-semibold text-rose-700">Below zero</span>}</td>
        </tr>)}</tbody></table></div>
      {forecast.data && <details className="text-sm text-slate-600"><summary className="cursor-pointer font-medium">Forecast assumptions</summary><ul className="mt-2 list-disc space-y-1 pl-5">{forecast.data.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>}
    </>}
  </div>
}

function MonthlyActivity({ month, onMonth }: { month: string; onMonth: (month: string) => void }) {
  const range = useMemo(() => {
    const [year, number] = month.split('-').map(Number)
    return { from: `${month}-01`, to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) }
  }, [month])
  const report = useCanonicalMonthlyReport(range)
  const point = report.data?.find((item) => item.month.slice(0, 7) === month)
  return <Panel id="monthly-heading" title="Calendar month" action={<label className="text-sm font-medium text-slate-700">Month<input aria-label="Dashboard month" type="month" value={month} onChange={(event) => event.target.value && onMonth(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-slate-300 px-2 text-sm" /></label>}>
    <p className="text-sm text-slate-600">Income and spending by purchase date during the month. This doesn’t change the cash and payday figures above.</p>
    {report.isLoading ? <Skeleton className="h-16" /> : report.isError ? <Retry text="Monthly activity is unavailable." error={report.error} retry={() => report.refetch()} />
      : <dl className="grid gap-4 sm:grid-cols-3">{[['Income', point?.income], ['Spending after refunds', point?.net_spending], ['Refunds', point?.refunds]].map(([label, value]) => <div key={label as string}><dt className="text-sm text-slate-600">{label}</dt><dd className="text-xl font-bold">{value === undefined ? <span className="text-sm font-normal text-slate-500">No entries</span> : formatJPY(value as number)}</dd></div>)}</dl>}
    <Link to={`/transactions?${new URLSearchParams({ ...range, kind: 'EXPENSE' })}`} className="text-sm font-semibold text-indigo-700 underline">View purchases this month</Link>
  </Panel>
}

export function DashboardPage({ defaultMonth }: { defaultMonth: string }) {
  const [params, setParams] = useSearchParams()
  const requestedAsOf = params.get('as_of')
  const asOf = requestedAsOf && isValidISODate(requestedAsOf) ? requestedAsOf : null
  const scenario: ForecastScenario = params.get('scenario') === 'with_scenario' ? 'with_scenario' : 'baseline'
  const horizon: Horizon = params.get('range') === '30' || params.get('range') === '90' ? params.get('range') as Horizon : 'payday'
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '') ? params.get('month')! : defaultMonth
  const dashboard = useDashboard(asOf)
  const accounts = useAccounts(true)
  const names = useMemo(() => new Map((accounts.data ?? []).map((account) => [account.id, account.name])), [accounts.data])
  const update = (key: string, value: string | null) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next }, { replace: true })
  const data = dashboard.data
  const liquidIds = data?.available_cash.accounts.map((row) => row.account_id) ?? []
  const forecastAccount = params.get('account') && liquidIds.includes(params.get('account')!) ? params.get('account')! : data?.upcoming_withdrawals[0]?.account_id ?? liquidIds[0] ?? ''
  const to = data ? horizon === 'payday' ? data.cycle.end_exclusive : addDays(data.as_of_date, Number(horizon)) : undefined
  const emergency = data?.buckets ?? []
  const position = data?.financial_position

  return <section aria-labelledby="dashboard-heading" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 id="dashboard-heading" className="text-2xl font-bold tracking-tight text-slate-950">Overview</h2><p className="mt-1 text-sm text-slate-600">{data ? <>As of {formatDate(data.as_of_date)} · payday cycle {formatDate(data.cycle.start)} – {formatDate(addDays(data.cycle.end_exclusive, -1))}</> : 'What you can spend, and whether each account covers what is coming.'}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id="dashboard-scenario" label="Forecast scenario" value={scenario} onChange={(event) => update('scenario', event.target.value === 'with_scenario' ? 'with_scenario' : null)}><option value="baseline">Baseline</option><option value="with_scenario">Include scenario items (e.g. unconfirmed bonus)</option></Select>
        <Select id="dashboard-range" label="Forecast range" value={horizon} onChange={(event) => update('range', event.target.value === 'payday' ? null : event.target.value)}>{(Object.keys(HORIZONS) as Horizon[]).map((key) => <option key={key} value={key}>{HORIZONS[key]}</option>)}</Select>
      </div>
    </div>
    <MigrationNotice />
    {dashboard.isLoading ? <div aria-label="Loading overview" className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      : dashboard.isError ? <Retry text="Could not load your overview." error={dashboard.error} retry={() => dashboard.refetch()} />
      : data && <>
        <Headline data={data} names={names} />
        {data.warnings.length > 0 && <Panel id="warnings-heading" title="Needs review"><ul className="space-y-2 text-sm">{data.warnings.map((warning) => { const link = warningLink(warning); return <li key={warning} className="flex flex-wrap items-center gap-2"><StatusBadge tone="warn">Review</StatusBadge><span>{warning}</span>{link && <Link to={link.to} className="font-semibold text-indigo-700 underline">{link.label}</Link>}</li> })}</ul></Panel>}
        <Panel id="accounts-heading" title="Account balances and commitments"><p className="text-sm text-slate-600">An account balance is not all free to spend. Money set aside for savings or card payments, and known bills, come off first, and each account must cover its own withdrawals.</p><AccountsTable rows={data.available_cash.accounts} names={names} lowest={data.lowest_projected_balance_by_account} /></Panel>
        <Panel id="forecast-heading" title="Cash forecast">{to && forecastAccount ? <Forecast asOf={data.as_of_date} to={to} scenario={scenario} account={forecastAccount} accounts={liquidIds} names={names} onAccount={(id) => update('account', id)} /> : <p className="text-sm text-slate-600">Add a bank or cash account to see a forecast.</p>}<p className="text-xs text-slate-500">Expected salary appears here as future income; it is never counted as money you have today.</p></Panel>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel id="reserves-heading" title="Money set aside" action={isFeatureEnabled('budgets') ? <Link to="/savings" className="text-sm font-semibold text-indigo-700 underline">Savings</Link> : undefined}>
            {emergency.length ? <ul className="space-y-2 text-sm">{emergency.map((bucket) => <li key={bucket.id} className="flex flex-wrap justify-between gap-2"><span className="font-medium">{bucket.name}</span><span>{formatJPY(bucket.funded)} of {formatJPY(bucket.target)}{bucket.shortfall > 0 ? ` · ${formatJPY(bucket.shortfall)} to go` : ' · funded'}</span></li>)}</ul> : <p className="text-sm text-slate-600">Nothing set aside for savings yet.</p>}
            <p className="text-sm">Card payments not yet reserved: <strong className={data.reserve_funding_shortfall > 0 ? 'text-amber-800' : ''}>{formatJPY(data.reserve_funding_shortfall)}</strong>{data.reserve_funding_shortfall > 0 && isFeatureEnabled('cards') && <> · <Link to="/cards" className="font-semibold text-indigo-700 underline">Reserve now</Link></>}</p>
            <p className="text-xs text-slate-500">Reserved money and the payment it covers are counted once by the server; the figures above already account for it.</p>
          </Panel>
          {position && <Panel id="wealth-heading" title="Net worth" action={isFeatureEnabled('investments') ? <Link to="/reports" className="text-sm font-semibold text-indigo-700 underline">Reports</Link> : undefined}>
            <p className="text-3xl font-bold"><Amount value={position.net_worth} unknown="Needs review" /></p>
            <p className="text-sm text-slate-600">{position.net_worth === null ? 'Some balances or investment values are missing, so net worth is not calculated.' : 'Everything you own, including investments, minus what you owe. Not money available to spend.'} As of {formatDate(position.as_of_date)}.</p>
          </Panel>}
        </div>
      </>}
    {isFeatureEnabled('events') && <MonthlyActivity month={month} onMonth={(value) => update('month', value)} />}
  </section>
}
