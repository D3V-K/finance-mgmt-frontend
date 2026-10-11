import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { normalizeApiError } from '@/api/errors'
import { useEntryOptions } from '@/api/hooks/accounts'
import { useFinancialEvents } from '@/api/hooks/events'
import type { FinancialEvent } from '@/api/types'
import { EventForm } from '@/components/ledger/EventForms'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { EventTable } from '@/pages/ActivityPage'
import { modeForEvent } from '@/utils/events'

const tabs = {
  transfers: { kind: 'TRANSFER', label: 'Transfers', mode: 'transfer', action: 'New transfer', empty: 'Move money between your own bank, cash and brokerage accounts.' },
  repayments: { kind: 'CARD_REPAYMENT', label: 'Card repayments', mode: 'repayment', action: 'New card repayment', empty: 'Record when money leaves your bank to pay a card.' },
} as const
type Tab = keyof typeof tabs

/** Movements between your own accounts, kept apart from purchases so they are never counted as spending. */
export function MovementsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'repayments' ? 'repayments' : 'transfers'
  const parsedPage = Number(params.get('page'))
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const config = tabs[tab]
  const options = useEntryOptions()
  const events = useFinancialEvents({ kind: config.kind, page, page_size: 20 })
  const [creating, setCreating] = useState(false)
  const [correcting, setCorrecting] = useState<FinancialEvent | null>(null)
  const [feedback, setFeedback] = useState('')
  const totalPages = events.data ? Math.max(1, Math.ceil(events.data.total / events.data.page_size)) : 1
  const close = (message?: string) => { setCreating(false); setCorrecting(null); if (message) setFeedback(message) }
  const correctionMode = correcting ? modeForEvent(correcting) : undefined
  return <section aria-labelledby="movements-heading" className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="movements-heading" className="text-2xl font-bold tracking-tight">Transfers and repayments</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Money moving between your own accounts. These change account balances and card debt, but never count as income or spending.</p></div><Button disabled={!options.data} onClick={() => setCreating(true)}>{config.action}</Button></div>
    <div role="tablist" aria-label="Movement type" className="flex gap-2">{(Object.keys(tabs) as Tab[]).map((key) => <button key={key} role="tab" aria-selected={tab === key} className={`min-h-10 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tab === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`} onClick={() => setParams(key === 'transfers' ? {} : { tab: key })}>{tabs[key].label}</button>)}</div>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {options.isError && <Alert>Entry options could not be loaded, so new entries are unavailable. {normalizeApiError(options.error).message}</Alert>}
    <div role="tabpanel" aria-label={config.label}>
      {events.isLoading ? <Skeleton className="h-48" /> : events.isError ? <div className="space-y-3"><Alert>Could not load {config.label.toLowerCase()}. {normalizeApiError(events.error).message}</Alert><Button variant="secondary" onClick={() => events.refetch()}>Try again</Button></div>
        : !events.data?.items.length ? <EmptyState title={`No ${config.label.toLowerCase()} yet`} description={config.empty} />
        : <EventTable events={events.data.items} caption={config.label} onCorrect={options.data ? setCorrecting : undefined} />}
    </div>
    {events.data && totalPages > 1 && <nav aria-label={`${config.label} pages`} className="flex items-center justify-between gap-4"><p className="text-sm text-slate-600">Page {page} of {totalPages}</p><div className="flex gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setParams({ ...(tab === 'repayments' ? { tab } : {}), page: String(page - 1) })}>Previous</Button><Button variant="secondary" disabled={page >= totalPages} onClick={() => setParams({ ...(tab === 'repayments' ? { tab } : {}), page: String(page + 1) })}>Next</Button></div></nav>}
    <p className="text-sm text-slate-600">Earlier Cash/Bank transfers are kept as recorded. <Link to="/transfers?view=earlier" className="font-semibold text-indigo-700 underline">View earlier transfers</Link></p>
    <Dialog open={creating || correcting !== null} title={correcting ? 'Correct entry' : config.action} onClose={() => close()}>
      {options.data && creating && <EventForm mode={config.mode} options={options.data} onDone={close} />}
      {options.data && correcting && correctionMode && <EventForm mode={correctionMode} options={options.data} original={correcting} replacing onDone={close} />}
    </Dialog>
  </section>
}
