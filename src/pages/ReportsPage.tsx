import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { normalizeApiError } from '@/api/errors'
import { useCategoryReport, useMonthlyReport, useNetBalanceReport } from '@/api/hooks/reports'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/FormControls'
import { formatJPY } from '@/utils/format'
import { buildTrendData, monthKeys, isValidISODate, presetRange, type ReportPreset } from '@/utils/reporting'

const PRESETS: Array<{ value: ReportPreset; label: string }> = [{ value: '3m', label: 'Last 3 months' }, { value: '6m', label: 'Last 6 months' }, { value: '12m', label: 'Last 12 months' }, { value: 'ytd', label: 'Year to date' }, { value: 'custom', label: 'Custom range' }]
const CATEGORY_COLORS = ['#4f46e5', '#0891b2', '#7c3aed', '#c026d3', '#ea580c', '#64748b']

function monthLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="space-y-3"><Alert>{message}</Alert><Button variant="secondary" onClick={retry}>Try again</Button></div>
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const requestedPreset = params.get('range')
  const preset: ReportPreset = PRESETS.some((item) => item.value === requestedPreset) ? requestedPreset as ReportPreset : '6m'
  const defaults = preset === 'custom' ? presetRange('6m') : presetRange(preset)
  const from = params.get('from') ?? defaults.from
  const to = params.get('to') ?? defaults.to
  const dateError = !isValidISODate(from) || !isValidISODate(to) ? 'Enter valid start and end dates.' : from > to ? 'Start date must be on or before end date.' : ''
  const filters = useMemo(() => dateError ? {} : { from, to }, [dateError, from, to])
  const monthlyQuery = useMonthlyReport(filters, !dateError)
  const balanceQuery = useNetBalanceReport(filters, !dateError)
  const balanceData = useMemo(() => {
    const points = new Map((balanceQuery.data ?? []).map((point) => [point.month.slice(0, 7), point.net_worth]))
    return dateError ? [] : monthKeys(from, to).map((month) => ({ month, label: monthLabel(month), balance: points.get(month) ?? null }))
  }, [balanceQuery.data, dateError, from, to])
  const categoriesQuery = useCategoryReport(filters, !dateError)

  const trendData = useMemo(() => dateError ? [] : buildTrendData(monthlyQuery.data ?? [], from, to), [dateError, from, monthlyQuery.data, to])
  const categories = useMemo(() => [...(categoriesQuery.data ?? [])].filter((item) => item.total > 0).sort((a, b) => b.total - a.total), [categoriesQuery.data])
  const updateRange = (nextPreset: ReportPreset) => {
    if (nextPreset === 'custom') setParams({ range: 'custom', from, to })
    else setParams({ range: nextPreset, ...presetRange(nextPreset) })
  }
  const updateDate = (key: 'from' | 'to', value: string) => setParams((current) => { const next = new URLSearchParams(current); next.set('range', 'custom'); next.set(key, value); return next }, { replace: true })
  const hasMonthlyData = trendData.some((point) => point.income !== null || point.expense !== null)
  const totals = trendData.reduce((sum, point) => ({ income: sum.income + (point.income ?? 0), expense: sum.expense + (point.expense ?? 0) }), { income: 0, expense: 0 })
  const chartTrendData = trendData.map((point) => ({ ...point, label: monthLabel(point.month) }))

  return <section aria-labelledby="reports-heading" className="space-y-6">
    <div><h2 id="reports-heading" className="text-2xl font-bold tracking-tight">Reports</h2><p className="mt-1 text-sm text-slate-600">Understand spending patterns and cash-flow trends over time.</p></div>

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-3">
        <Select id="report-range" label="Date range" value={preset} onChange={(event) => updateRange(event.target.value as ReportPreset)}>{PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
        <Input id="report-from" label="From" type="date" value={from} onChange={(event) => updateDate('from', event.target.value)} aria-describedby="report-boundary report-date-error" />
        <Input id="report-to" label="To" type="date" value={to} onChange={(event) => updateDate('to', event.target.value)} aria-describedby="report-boundary report-date-error" />
      </div>
      <p id="report-boundary" className="mt-3 text-xs text-slate-500">Dates are inclusive calendar-day boundaries in Asia/Tokyo.</p>
      {dateError && <p id="report-date-error" role="alert" className="mt-2 text-sm text-red-700">{dateError}</p>}
    </div>

    {!dateError && <div className="grid gap-4 sm:grid-cols-3">
      {[{ label: 'Income', value: totals.income, color: 'text-emerald-700' }, { label: 'Expenses', value: totals.expense, color: 'text-rose-700' }, { label: 'Net cash flow', value: totals.income - totals.expense, color: totals.income - totals.expense < 0 ? 'text-rose-700' : 'text-slate-950' }].map((item) => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-600">{item.label}</p><p className={`mt-2 text-2xl font-bold ${item.color}`}>{monthlyQuery.isLoading ? '—' : hasMonthlyData ? formatJPY(item.value) : 'No data'}</p><p className="mt-1 text-xs text-slate-500">Total of available monthly data</p></article>)}
    </div>}

    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="cash-flow-heading">
      <h3 id="cash-flow-heading" className="font-semibold text-slate-950">Monthly cash flow</h3><p className="mt-1 text-sm text-slate-500">Income, expenses, and the resulting net movement. Gaps mean the API returned no data for that month.</p>
      {dateError ? <div className="mt-5"><EmptyState title="Choose a valid date range" description="Correct the dates above to generate this report." /></div> : monthlyQuery.isLoading ? <Skeleton className="mt-5 h-72" /> : monthlyQuery.isError ? <div className="mt-5"><ErrorPanel message={`Could not load monthly trends. ${normalizeApiError(monthlyQuery.error).message}`} retry={() => monthlyQuery.refetch()} /></div> : !hasMonthlyData ? <div className="mt-5"><EmptyState title="No monthly report data" description="There is no reported activity in this date range." /></div> : <>
        <div className="mt-5 h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartTrendData} margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 12 }}/><YAxis width={68} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => value == null ? 'No data' : formatJPY(Number(value))}/><Legend/><Line connectNulls={false} type="monotone" dataKey="income" name="Income" stroke="#047857" strokeWidth={2}/><Line connectNulls={false} type="monotone" dataKey="expense" name="Expenses" stroke="#be123c" strokeWidth={2}/><Line connectNulls={false} type="monotone" dataKey="net" name="Net cash flow" stroke="#4f46e5" strokeWidth={2}/></LineChart></ResponsiveContainer></div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Monthly cash-flow values shown in the chart</caption><thead><tr className="border-b border-slate-200">{['Month', 'Income', 'Expenses', 'Net cash flow'].map((heading) => <th key={heading} className={`py-2 font-medium text-slate-500 ${heading === 'Month' ? 'text-left' : 'text-right'}`}>{heading}</th>)}</tr></thead><tbody>{trendData.map((point) => <tr key={point.month} className="border-b border-slate-100"><th scope="row" className="py-2 text-left font-medium">{monthLabel(point.month)}{point.partial ? <span className="ml-1 text-xs font-normal text-slate-500">(partial)</span> : null}</th>{[point.income, point.expense, point.net].map((value, index) => <td key={index} className="py-2 text-right">{value === null ? <span className="text-slate-400">No data</span> : formatJPY(value)}</td>)}</tr>)}</tbody></table></div>
      </>}
    </article>

    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="spending-heading">
      <h3 id="spending-heading" className="font-semibold text-slate-950">Spending by category</h3><p className="mt-1 text-sm text-slate-500">Select a category in the table to review its matching expense transactions.</p>
      {dateError ? <div className="mt-5"><EmptyState title="Choose a valid date range" description="Correct the dates above to generate this report." /></div> : categoriesQuery.isLoading ? <Skeleton className="mt-5 h-72"/> : categoriesQuery.isError ? <div className="mt-5"><ErrorPanel message={`Could not load category spending. ${normalizeApiError(categoriesQuery.error).message}`} retry={() => categoriesQuery.refetch()} /></div> : !categories.length ? <div className="mt-5"><EmptyState title="No category spending" description="There are no reported expenses in this date range." /></div> : <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }}/><YAxis type="category" dataKey="category_name" width={100} tick={{ fontSize: 12 }}/><Tooltip formatter={(value) => formatJPY(Number(value))}/><Bar dataKey="total" name="Expenses" fill={CATEGORY_COLORS[0]} radius={[0, 4, 4, 0]}/></BarChart></ResponsiveContainer></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Spending category values shown in the chart</caption><thead><tr className="border-b border-slate-200"><th className="py-2 text-left font-medium text-slate-500">Category</th><th className="py-2 text-right font-medium text-slate-500">Expenses</th></tr></thead><tbody>{categories.map((category, index) => { const query = new URLSearchParams({ from, to, category_id: category.category_id, type: 'expense' }); return <tr key={category.category_id} className="border-b border-slate-100"><th scope="row" className="py-3 text-left font-medium"><span className="mr-2 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} aria-hidden="true"/><Link className="text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" to={`/transactions?${query}`}>{category.category_name}</Link></th><td className="py-3 text-right font-semibold">{formatJPY(category.total)}</td></tr> })}</tbody></table></div>
      </div>}
    </article>

    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="net-balance-heading">
      <h3 id="net-balance-heading" className="font-semibold text-slate-950">Net balance over time</h3>
      <p className="mt-1 text-sm text-slate-500">Total funds at a point in time, including opening balances as returned by the API. Cash flow is income minus expenses during a period. Transfers do not change total balance.</p>
      <p className="mt-2 text-xs text-slate-500">Only reported monthly values are shown. Gaps mean no reported balance; values are never estimated for missing months or partial date ranges.</p>
      {dateError ? <EmptyState title="Choose a valid date range" description="Correct the dates above to generate this report." /> : balanceQuery.isLoading ? <div role="status" aria-label="Loading net balance"><Skeleton className="mt-5 h-72" /></div> : balanceQuery.isError ? <div className="mt-5"><ErrorPanel message={`Could not load net balance. ${normalizeApiError(balanceQuery.error).message}`} retry={() => balanceQuery.refetch()} /></div> : !balanceQuery.data?.length ? <EmptyState title="No net balance history" description="The API returned no monthly balance points for this range. Opening balances alone may not produce history until transactions are recorded." /> : <>
        <div className="mt-5 h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={balanceData} margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{ fontSize: 12 }}/><YAxis width={68} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => value == null ? 'No data' : formatJPY(Number(value))}/><Line connectNulls={false} type="linear" dataKey="balance" name="Net balance" stroke="#4f46e5" strokeWidth={2}/></LineChart></ResponsiveContainer></div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Net balance values shown in the chart</caption><thead><tr className="border-b border-slate-200"><th className="py-2 text-left">Month</th><th className="py-2 text-right">Net balance</th></tr></thead><tbody>{balanceData.map((point) => <tr key={point.month} className="border-b border-slate-100"><th scope="row" className="py-2 text-left font-medium">{point.label}</th><td className="py-2 text-right">{point.balance === null ? 'No data' : formatJPY(point.balance)}</td></tr>)}</tbody></table></div>
      </>}
    </article>
  </section>
}
