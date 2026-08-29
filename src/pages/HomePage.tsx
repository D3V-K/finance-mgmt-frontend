import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { normalizeApiError } from '@/api/errors'
import { useCategoryReport, useMonthlyReport } from '@/api/hooks/reports'
import { useTransactions } from '@/api/hooks/transactions'
import type { MonthlyReport } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { formatDate, formatJPY } from '@/utils/format'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) }
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7)
}

const reportMonth = (value: string) => value.slice(0, 7)
function monthLabel(month: string, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(undefined, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}

function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return <div className="space-y-3"><Alert>{message}</Alert><Button variant="secondary" onClick={retry}>Try again</Button></div>
}

function SummaryCards({ data, month }: { data: MonthlyReport[]; month: string }) {
  const current = data.find((item) => reportMonth(item.month) === month)
  const previous = data.find((item) => reportMonth(item.month) === shiftMonth(month, -1))
  const income = current?.income ?? 0
  const expense = current?.expense ?? 0
  const net = income - expense
  const values = [
    { label: 'Income', value: income, previous: previous?.income, type: 'income', color: 'text-emerald-700' },
    { label: 'Expenses', value: expense, previous: previous?.expense, type: 'expense', color: 'text-rose-700' },
    { label: 'Net cash flow', value: net, previous: previous ? previous.income - previous.expense : undefined, type: '', color: net < 0 ? 'text-rose-700' : 'text-slate-950' },
  ]
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{values.map((item) => {
    const query = new URLSearchParams({ ...monthRange(month), ...(item.type ? { type: item.type } : {}) })
    const difference = item.previous === undefined ? null : item.value - item.previous
    const content = <><p className="text-sm font-medium text-slate-600">{item.label}</p><p className={`mt-2 text-3xl font-bold tracking-tight ${item.color}`}>{formatJPY(item.value)}</p><p className="mt-1 text-xs text-slate-500">{difference === null ? 'No previous-month data' : `${difference >= 0 ? '+' : ''}${formatJPY(difference)} from ${monthLabel(shiftMonth(month, -1))}`}</p>{item.type && <p className="mt-1 text-xs text-indigo-600">View transactions →</p>}</>
    return item.type ? <Link key={item.label} to={`/transactions?${query}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{content}</Link> : <article key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{content}</article>
  })}</div>
}

export function HomePage() {
  const [params, setParams] = useSearchParams()
  const requestedMonth = params.get('month') ?? ''
  const month = MONTH_PATTERN.test(requestedMonth) ? requestedMonth : currentMonth()
  const selectedRange = useMemo(() => monthRange(month), [month])
  const trendRange = useMemo(() => ({ from: `${shiftMonth(month, -5)}-01`, to: selectedRange.to }), [month, selectedRange.to])
  const monthlyQuery = useMonthlyReport(trendRange)
  const categoriesQuery = useCategoryReport(selectedRange)
  const transactionsQuery = useTransactions({ ...selectedRange, page: 1, page_size: 5 })

  useEffect(() => {
    if (requestedMonth === month) return
    setParams((current) => { const next = new URLSearchParams(current); next.set('month', month); return next }, { replace: true })
  }, [month, requestedMonth, setParams])

  const trendData = useMemo(() => {
    const reports = new Map((monthlyQuery.data ?? []).map((item) => [reportMonth(item.month), item]))
    return Array.from({ length: 6 }, (_, index) => { const key = shiftMonth(month, index - 5); const report = reports.get(key); return { month: monthLabel(key), income: report?.income ?? 0, expense: report?.expense ?? 0 } })
  }, [month, monthlyQuery.data])
  const categories = [...(categoriesQuery.data ?? [])].filter((item) => item.total > 0).sort((a, b) => b.total - a.total).slice(0, 5)
  const transactions = transactionsQuery.data?.items ?? []

  return <section aria-labelledby="dashboard-heading" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="dashboard-heading" className="text-2xl font-bold tracking-tight text-slate-950">Overview</h2><p className="mt-1 text-sm text-slate-600">Your financial activity for {monthLabel(month, 'long')}.</p></div><label className="text-sm font-medium text-slate-700">Month<input aria-label="Dashboard month" type="month" value={month} onChange={(event) => setParams({ month: event.target.value })} className="mt-1 block min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label></div>
    {monthlyQuery.isLoading ? <div aria-label="Loading summary" className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/></div> : monthlyQuery.isError ? <ErrorPanel message={`Could not load the monthly summary. ${normalizeApiError(monthlyQuery.error).message}`} retry={() => monthlyQuery.refetch()} /> : <SummaryCards data={monthlyQuery.data ?? []} month={month} />}

    <div className="grid gap-6 xl:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2" aria-labelledby="trend-heading"><h3 id="trend-heading" className="font-semibold text-slate-950">Income versus expenses</h3><p className="mt-1 text-sm text-slate-500">Six months through {monthLabel(month)}.</p>
        {monthlyQuery.isLoading ? <Skeleton className="mt-5 h-64"/> : monthlyQuery.isError ? <div className="mt-5"><ErrorPanel message="Trend data is unavailable." retry={() => monthlyQuery.refetch()} /></div> : <><div className="mt-5 h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendData} margin={{ left: 4, right: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month" tick={{ fontSize: 12 }}/><YAxis width={58} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => formatJPY(Number(value))}/><Legend/><Bar dataKey="income" name="Income" fill="#059669" radius={[4, 4, 0, 0]}/><Bar dataKey="expense" name="Expenses" fill="#e11d48" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Income and expense values shown in the chart</caption><thead><tr><th className="py-2 text-left font-medium text-slate-500">Month</th><th className="py-2 text-right font-medium text-slate-500">Income</th><th className="py-2 text-right font-medium text-slate-500">Expenses</th></tr></thead><tbody>{trendData.map((point) => <tr key={point.month} className="border-t border-slate-100"><th scope="row" className="py-2 text-left font-medium">{point.month}</th><td className="py-2 text-right text-emerald-700">{formatJPY(point.income)}</td><td className="py-2 text-right text-rose-700">{formatJPY(point.expense)}</td></tr>)}</tbody></table></div></>}
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="categories-heading"><h3 id="categories-heading" className="font-semibold text-slate-950">Top spending categories</h3><p className="mt-1 text-sm text-slate-500">Largest expenses this month.</p>{categoriesQuery.isLoading ? <div className="mt-5 space-y-3"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-10"/></div> : categoriesQuery.isError ? <div className="mt-5"><ErrorPanel message="Category insights are unavailable." retry={() => categoriesQuery.refetch()} /></div> : !categories.length ? <p className="mt-6 text-sm text-slate-500">No spending category data for this month.</p> : <ol className="mt-5 space-y-4">{categories.map((category, index) => { const query = new URLSearchParams({ ...selectedRange, category_id: category.category_id, type: 'expense' }); return <li key={category.category_id} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span><Link to={`/transactions?${query}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-indigo-700 hover:underline">{category.category_name}</Link><span className="text-sm font-semibold">{formatJPY(category.total)}</span></li> })}</ol>}</article>
    </div>

    <article className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-heading"><div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><h3 id="recent-heading" className="font-semibold text-slate-950">Recent transactions</h3><p className="mt-1 text-sm text-slate-500">Latest activity in the selected month.</p></div><Link className="text-sm font-semibold text-indigo-700 hover:underline" to={`/transactions?${new URLSearchParams(selectedRange)}`}>View all</Link></div>{transactionsQuery.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-12"/><Skeleton className="h-12"/></div> : transactionsQuery.isError ? <div className="p-5"><ErrorPanel message="Recent transactions are unavailable." retry={() => transactionsQuery.refetch()} /></div> : !transactions.length ? <div className="p-5"><EmptyState title="No transactions this month" description="Transactions in the selected month will appear here." /></div> : <ul className="divide-y divide-slate-100">{transactions.map((transaction) => <li key={transaction.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.description || 'Transaction'}</p><p className="mt-1 text-xs text-slate-500">{formatDate(transaction.transaction_date)}</p></div><span className="shrink-0 text-sm font-semibold">{formatJPY(transaction.amount)}</span></li>)}</ul>}</article>
  </section>
}
