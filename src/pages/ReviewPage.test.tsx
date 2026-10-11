import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { FinancialEventCreateDto, Reconciliation } from '@/api/types'
import { setEnabledFeatures } from '@/config/features'
import { ReviewPage } from '@/pages/ReviewPage'
import { eventFixture, qualityFixture } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

function Location() { return <output data-testid="location">{useLocation().search}</output> }
const renderReview = (route = '/review') => renderWithClient(<Routes><Route path="/review" element={<><ReviewPage /><Location /></>} /></Routes>, { route })

const baseSession: Reconciliation = {
  id: 'rec-1', account_id: 'acct-bank', period_start: '2026-09-01', period_end: '2026-09-30', statement_opening: 100000, statement_closing: 93500,
  calculated_closing: 94000, all_postings_closing: 94000, difference: -500, baseline_before_period: 100000, opening_mismatch: false,
  selected_posting_ids: ['p-1'], unmatched_postings: [], status: 'draft', captured_at: '2026-09-30T10:00:00', suggestions: ['Check for a missing fee, duplicate, refund or timing difference'],
}

/** A small stand-in for the server's frozen-selection reconciliation arithmetic. */
function useReconciliationApi(initial: Reconciliation = baseSession) {
  let session = { ...initial }
  const calls: string[] = []
  server.use(
    http.get('*/reconciliations/:id', () => HttpResponse.json(session)),
    http.post('*/financial-events', async ({ request }) => {
      const body = await request.json() as FinancialEventCreateDto
      calls.push(`event:${body.kind}:${body.amount}`)
      // A new posting in the period surfaces as unmatched; the difference is unchanged until it is included.
      session = { ...session, unmatched_postings: [{ id: 'p-fee', delta: -body.amount, effective_date: '2026-09-30' }], suggestions: [...session.suggestions, 'New postings appeared in this statement period; reopen to review'] }
      return HttpResponse.json(eventFixture({ id: 'fee', amount: body.amount, postings: [{ account_id: 'acct-bank', delta: -body.amount, effective_date: '2026-09-30' }] }), { status: 201 })
    }),
    http.post('*/reconciliations/:id/include/:posting', ({ params }) => {
      calls.push(`include:${params.posting}`)
      const posting = session.unmatched_postings.find((item) => item.id === params.posting)!
      const calculated = session.calculated_closing + posting.delta
      session = { ...session, calculated_closing: calculated, difference: session.statement_closing - calculated, unmatched_postings: [], selected_posting_ids: [...session.selected_posting_ids, posting.id], suggestions: [] }
      return HttpResponse.json(session)
    }),
    http.post('*/reconciliations/:id/confirm', () => { calls.push('confirm'); session = { ...session, status: 'confirmed' }; return HttpResponse.json(session) }),
  )
  return calls
}

beforeEach(() => setEnabledFeatures(['accounts', 'events', 'reconciliation', 'cards', 'cutover', 'investments']))
afterEach(() => setEnabledFeatures('none'))

it('shows a missing fee as a difference and resolves it once the fee is recorded and included', async () => {
  const calls = useReconciliationApi()
  const user = userEvent.setup()
  renderReview('/review?session=rec-1')
  const session = await screen.findByRole('region', { name: /Everyday Bank · Sep 1, 2026 – Sep 30, 2026/ })
  expect(within(session).getByText('¥500')).toBeInTheDocument()
  expect(within(session).getByRole('button', { name: 'Confirm reconciliation' })).toBeDisabled()
  expect(within(session).getByText(/Check for a missing fee/)).toBeInTheDocument()

  await user.click(within(session).getByRole('button', { name: 'Record a missing entry' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Paid with')).toHaveValue('acct-bank')
  expect(within(dialog).getByLabelText('Purchase date')).toHaveValue('2026-09-30')
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '500')
  await user.selectOptions(within(dialog).getByLabelText('Category'), 'category-1')
  await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }))
  await user.click(await within(session).findByRole('button', { name: /Include entry posted 2026-09-30/ }))
  expect(await within(session).findByText('None')).toBeInTheDocument()
  await user.click(within(session).getByRole('button', { name: 'Confirm reconciliation' }))
  expect(await within(session).findByText('Reconciled')).toBeInTheDocument()
  expect(calls).toEqual(['event:EXPENSE:500', 'include:p-fee', 'confirm'])
})

it('enters card statements as amounts owed and sends the server sign convention', async () => {
  const drafts: unknown[] = []
  server.use(
    http.get('*/accounts/:id/statement-balance', ({ params, request }) => {
      expect(new URL(request.url).searchParams.get('from_')).toBe('2026-09-01')
      return HttpResponse.json({ account_id: params.id, from: '2026-09-01', to: '2026-09-10', opening: -20000, closing: -26000, postings: [{ id: 'p-card', amount: -6000, effective_date: '2026-09-05' }], coverage: 'complete' })
    }),
    http.post('*/reconciliations', async ({ request }) => { drafts.push(await request.json()); return HttpResponse.json({ ...baseSession, id: 'rec-card', account_id: 'acct-card' }, { status: 201 }) }),
    http.get('*/reconciliations/:id', () => HttpResponse.json({ ...baseSession, id: 'rec-card', account_id: 'acct-card', statement_opening: -20000, statement_closing: -26000, calculated_closing: -26000, difference: 0, suggestions: [] })),
  )
  const user = userEvent.setup()
  renderReview()
  await user.selectOptions(await screen.findByLabelText('Account'), 'acct-card')
  expect(await screen.findByText(/This app shows an amount owed of/)).toHaveTextContent('¥20,000 at the start and ¥26,000 at the end')
  const row = screen.getByRole('table', { name: /Untick anything/ })
  expect(within(row).getByText('¥6,000')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Amount owed at start (JPY)'), '20000')
  await user.type(screen.getByLabelText('Amount owed at end (JPY)'), '26000')
  await user.click(screen.getByRole('button', { name: 'Start check' }))
  await waitFor(() => expect(drafts).toEqual([{ account_id: 'acct-card', period_start: '2026-09-01', period_end: '2026-09-10', statement_opening: -20000, statement_closing: -26000, selected_posting_ids: ['p-card'] }]))
  expect(await screen.findByTestId('location')).toHaveTextContent('session=rec-card')
  const session = await screen.findByRole('region', { name: /Rewards Card/ })
  expect(within(session).getByText('Statement: owed at end').nextSibling).toHaveTextContent('¥26,000')
  expect(within(session).getByRole('button', { name: 'Confirm reconciliation' })).toBeEnabled()
})

it('does not start a check until this period’s activity has loaded', async () => {
  const drafts: unknown[] = []
  server.use(
    http.get('*/accounts/:id/statement-balance', () => HttpResponse.json({ detail: 'Temporarily unavailable' }, { status: 503 })),
    http.post('*/reconciliations', async ({ request }) => { drafts.push(await request.json()); return HttpResponse.json(baseSession, { status: 201 }) }),
  )
  const user = userEvent.setup()
  renderReview()
  await user.selectOptions(await screen.findByLabelText('Account'), 'acct-bank')
  await user.type(screen.getByLabelText('Statement opening balance (JPY)'), '100000')
  await user.type(screen.getByLabelText('Statement closing balance (JPY)'), '93500')
  expect(await screen.findByText(/Could not load this period’s activity/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start check' })).toBeDisabled()
  expect(drafts).toEqual([])
})

it('requires a reason for a balance adjustment and does not duplicate it on retry', async () => {
  const keys: string[] = []
  useReconciliationApi()
  server.use(http.post('*/financial-events', async ({ request }) => {
    const body = await request.json() as FinancialEventCreateDto
    keys.push(body.idempotency_key!)
    await delay(20)
    return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(eventFixture({ kind: 'BALANCE_ADJUSTMENT' }), { status: 201 })
  }))
  const user = userEvent.setup()
  renderReview('/review?session=rec-1')
  await user.click(await screen.findByRole('button', { name: 'Record a balance adjustment' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Down')).toBeChecked()
  expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveValue('500')
  expect(within(dialog).getByText(/Everyday Bank balance decreases by ¥500.*Income and spending are unchanged/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Record adjustment' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('reason')
  expect(keys).toHaveLength(0)
  await user.type(within(dialog).getByLabelText('Reason (required)'), 'Unexplained bank charge')
  await user.click(within(dialog).getByRole('button', { name: 'Record adjustment' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unable to reach the server')
  await user.click(within(dialog).getByRole('button', { name: 'Record adjustment' }))
  expect(await screen.findByText(/Balance adjustment recorded/)).toBeInTheDocument()
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

it('marks a reconciled period that changed afterwards and offers to reopen it', async () => {
  useReconciliationApi({ ...baseSession, status: 'stale', difference: 0, unmatched_postings: [{ id: 'late', delta: -1200, effective_date: '2026-09-12' }] })
  const reopened: string[] = []
  server.use(http.post('*/reconciliations/:id/reopen', ({ params }) => { reopened.push(String(params.id)); return HttpResponse.json({ ...baseSession, status: 'draft' }) }))
  const user = userEvent.setup()
  renderReview('/review?session=rec-1')
  expect(await screen.findByText('Changed after reconciling')).toBeInTheDocument()
  expect(screen.getByText(/no longer matches the statement/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm reconciliation' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reopen' }))
  await waitFor(() => expect(reopened).toEqual(['rec-1']))
})

it('turns data-quality findings into actionable links', async () => {
  server.use(http.get('*/ledger-quality', () => HttpResponse.json({ ...qualityFixture, unresolved_legacy_records: 2, missing_openings: ['acct-cash'], unknown_purchase_dates: 3, stale_or_missing_valuations: ['acct-broker'], schedule_debt_mismatch: [{ card_id: 'acct-card', amount_owed: 20000, scheduled_outstanding: 14000 }], reserve_shortfall: 6000, unreconciled_sessions: ['rec-1'], accounts_without_confirmed_statement: ['acct-bank'] })))
  const user = userEvent.setup()
  renderReview()
  const queue = await screen.findByRole('region', { name: 'Things to review' })
  expect(within(queue).getByRole('link', { name: 'Assign records' })).toHaveAttribute('href', '/setup/migration')
  expect(await within(queue).findByText('Wallet has no opening balance, so its balance is unknown.')).toBeInTheDocument()
  expect(within(queue).getByRole('link', { name: 'Update value' })).toHaveAttribute('href', '/investments')
  expect(within(queue).getByText(/Rewards Card: payment dates cover ¥14,000 but ¥20,000 is owed/)).toBeInTheDocument()
  expect(within(queue).getByRole('link', { name: 'Review payment dates' })).toHaveAttribute('href', '/cards/acct-card')
  expect(within(queue).getByRole('link', { name: 'Continue check' })).toHaveAttribute('href', '/review?session=rec-1')
  await user.click(within(queue).getByRole('button', { name: /Check a statement for Everyday Bank/ }))
  await waitFor(() => expect(screen.getByLabelText('Account')).toHaveValue('acct-bank'))
})

it('downloads the server export and reports an oversized history without a partial file', async () => {
  const createObjectURL = vi.fn(() => 'blob:export')
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  let attempt = 0
  server.use(http.get('*/ledger-export', () => { attempt += 1; return attempt === 1 ? HttpResponse.json({ format: 'finance-ledger-v1', events: [{ id: 'e1' }, { id: 'e2' }] }) : HttpResponse.json({ detail: 'Use paginated exports for more than 5000 events' }, { status: 413 }) }))
  const user = userEvent.setup()
  renderReview()
  await user.click(await screen.findByRole('button', { name: 'Download export' }))
  expect(await screen.findByText(/complete copy prepared by the server: 2 entries/)).toBeInTheDocument()
  expect(click).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Download export' }))
  expect(await screen.findByText('Your history is too large for a single download. Nothing partial was saved.')).toBeInTheDocument()
  expect(click).toHaveBeenCalledTimes(1)
  click.mockRestore()
})

it('has no automated accessibility violations', async () => {
  const { axe } = await import('jest-axe')
  useReconciliationApi()
  const { container } = renderReview('/review?session=rec-1')
  await screen.findByRole('region', { name: /Everyday Bank/ })
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
