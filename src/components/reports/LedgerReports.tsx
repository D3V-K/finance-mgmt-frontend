import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { normalizeApiError } from '@/api/errors'
import { useCanonicalCategoryReport } from '@/api/hooks/events'
import { useFinancialPosition, useFinancialPositionSeries } from '@/api/hooks/investments'
import type { FinancialPosition, ISODate } from '@/api/types'
import { Amount } from '@/components/finance/Amount'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { formatDate, formatJPY } from '@/utils/format'
import { monthKeys } from '@/utils/reporting'

function monthLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
}

function Failed({ text, error, retry }: { text: string; error: unknown; retry: () => void }) {
  return <div className="mt-5 space-y-3"><Alert>{text} {normalizeApiError(error).message}</Alert><Button variant="secondary" onClick={retry}>Try again</Button></div>
}

/** Net spending by category. Refunds can bring a category to zero or below; those rows are kept, not filtered out. */
export function CanonicalCategorySpending({ from, to }: { from: ISODate; to: ISODate }) {
  const query = useCanonicalCategoryReport({ from, to })
  const rows = useMemo(() => [...(query.data ?? [])].sort((a, b) => b.net_spending - a.net_spending), [query.data])
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="spending-heading">
    <h3 id="spending-heading" className="font-semibold text-slate-950">Spending by category</h3>
    <p className="mt-1 text-sm text-slate-500">By purchase date, after refunds. Select a category to review its purchases.</p>
    {query.isLoading ? <Skeleton className="mt-5 h-72" /> : query.isError ? <Failed text="Could not load category spending." error={query.error} retry={() => query.refetch()} />
      : !rows.length ? <div className="mt-5"><EmptyState title="No category spending" description="There are no purchases or refunds with known dates in this range." /></div>
      : <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="category_name" width={100} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => formatJPY(Number(value))} /><ReferenceLine x={0} stroke="#94a3b8" /><Bar dataKey="net_spending" name="Spending after refunds" fill="#4f46e5" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Spending category values shown in the chart</caption>
          <thead><tr className="border-b border-slate-200">{['Category', 'Purchased', 'Refunds', 'Spending after refunds'].map((heading) => <th key={heading} className={`py-2 font-medium text-slate-500 ${heading === 'Category' ? 'text-left' : 'text-right'}`}>{heading}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.category_id} className="border-b border-slate-100">
            <th scope="row" className="py-3 text-left font-medium"><Link className="text-indigo-700 hover:underline" to={`/transactions?${new URLSearchParams({ from, to, category_id: row.category_id })}`}>{row.category_name}</Link></th>
            <td className="py-3 text-right">{formatJPY(row.gross_spending)}</td><td className="py-3 text-right">{row.refunds ? `−${formatJPY(row.refunds)}` : formatJPY(0)}</td>
            <td className="py-3 text-right font-semibold"><Amount value={row.net_spending} /></td>
          </tr>)}</tbody></table></div>
      </div>}
  </article>
}

function Breakdown({ position }: { position: FinancialPosition }) {
  const owed = position.signed_card_balances === null ? null : Math.max(0, -position.signed_card_balances)
  const credit = position.signed_card_balances === null ? null : Math.max(0, position.signed_card_balances)
  const stale = position.accounts.filter((account) => account.securities && account.securities.status !== 'recorded')
  return <div className="space-y-3">
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {[['Bank and cash', position.liquid_cash], ['Brokerage cash', position.brokerage_cash], ['Securities (latest values)', position.securities_value], ['Card amount owed', owed]].map(([label, value]) => <div key={label as string} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold"><Amount value={value as number | null} unknown="Needs review" /></dd></div>)}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3"><dt className="text-xs text-indigo-900">Net worth</dt><dd className="mt-1 text-lg font-bold text-indigo-950"><Amount value={position.net_worth} unknown="Needs review" /></dd></div>
    </dl>
    {credit !== null && credit > 0 && <p className="text-sm text-slate-600">Cards also hold a {formatJPY(credit)} credit balance, which is included in net worth.</p>}
    {position.coverage !== 'complete' && <Alert tone="info">Net worth is not calculated until every account has an opening balance and each brokerage account has a current securities value.{stale.length ? ` ${stale.map((account) => `${account.name}: ${account.securities?.status === 'missing' ? 'no value recorded' : 'holdings changed after the last value'}`).join('; ')}.` : ''}</Alert>}
    <p className="text-xs text-slate-500">Net worth is what you own minus what you owe. It is not money available to spend, and transfers, brokerage contributions and card repayments don't change it by themselves. {position.assumptions.join(' ')}</p>
  </div>
}

/** True assets-minus-liabilities position from the server, kept apart from cash flow and the legacy net balance. */
export function NetWorthSection({ from, to }: { from: ISODate; to: ISODate }) {
  const position = useFinancialPosition(to)
  const series = useFinancialPositionSeries(from, to)
  const points = useMemo(() => {
    const byMonth = new Map((series.data ?? []).map((item) => [item.as_of_date.slice(0, 7), item]))
    return monthKeys(from, to).map((month) => ({ month, label: monthLabel(month), value: byMonth.get(month)?.net_worth ?? null, asOf: byMonth.get(month)?.as_of_date }))
  }, [from, series.data, to])
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="net-worth-heading">
    <h3 id="net-worth-heading" className="font-semibold text-slate-950">Net worth</h3>
    <p className="mt-1 text-sm text-slate-500">All accounts and the latest manual securities values, minus card debt, as of {formatDate(to)}.</p>
    <div className="mt-4">{position.isLoading ? <Skeleton className="h-24" /> : position.isError ? <Failed text="Could not load your financial position." error={position.error} retry={() => position.refetch()} /> : position.data && <Breakdown position={position.data} />}</div>
    <h4 className="mt-6 text-sm font-semibold">Net worth over time</h4>
    <p className="text-xs text-slate-500">Month-end values from the server. Gaps mean the value is incomplete for that month; a value recorded later is never applied to earlier months.</p>
    {series.isLoading ? <Skeleton className="mt-3 h-64" /> : series.isError ? <Failed text="Could not load net worth history." error={series.error} retry={() => series.refetch()} /> : <>
      <div className="mt-3 h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis width={72} tickFormatter={(value) => `¥${Number(value).toLocaleString()}`} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => value == null ? 'Incomplete' : formatJPY(Number(value))} /><Line connectNulls={false} type="linear" dataKey="value" name="Net worth" stroke="#4f46e5" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">Net worth values shown in the chart</caption><thead><tr className="border-b border-slate-200"><th className="py-2 text-left">Month</th><th className="py-2 text-right">Net worth</th></tr></thead>
        <tbody>{points.map((point) => <tr key={point.month} className="border-b border-slate-100"><th scope="row" className="py-2 text-left font-medium">{point.label}</th><td className="py-2 text-right">{point.value === null ? <span className="text-slate-500">Incomplete</span> : <Amount value={point.value} />}</td></tr>)}</tbody></table></div>
    </>}
  </article>
}
