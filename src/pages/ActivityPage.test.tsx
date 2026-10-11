import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { FinancialEventCreateDto } from '@/api/types'
import { setEnabledFeatures } from '@/config/features'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { TransfersPage } from '@/pages/TransfersPage'
import { categoryFixture } from '@/test/handlers'
import { entryOptionsFixture, eventFixture, ledgerAccounts } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

const archivedCategory = { ...categoryFixture, id: 'category-old', name: 'Old hobby', archived_at: '2026-09-01T00:00:00' }
const purchase = eventFixture({ id: 'purchase-1', description: 'Weekly shop' })
const unknownDate = eventFixture({ id: 'legacy-1', description: 'Imported card bill', occurred_on: null, date_basis: 'legacy_recorded_date', category_id: 'category-old', postings: [{ account_id: 'acct-bank', delta: -18000, effective_date: '2026-08-27' }], amount: 18000 })

function Location() { return <output data-testid="location">{useLocation().search}</output> }
function renderPage(route = '/transactions') {
  return renderWithClient(<Routes><Route path="/transactions" element={<><TransactionsPage /><Location /></>} /><Route path="/transfers" element={<TransfersPage />} /></Routes>, { route })
}

function useLedgerApi(events = [purchase, unknownDate]) {
  const created: FinancialEventCreateDto[] = []
  const listParams: URLSearchParams[] = []
  server.use(
    http.get('*/accounts', () => HttpResponse.json(ledgerAccounts)),
    http.get('*/categories', ({ request }) => {
      const items = new URL(request.url).searchParams.get('include_archived') ? [categoryFixture, archivedCategory] : [categoryFixture]
      return HttpResponse.json({ items, total: items.length, page: 1, page_size: 100, total_pages: 1 })
    }),
    http.get('*/financial-events', ({ request }) => { listParams.push(new URL(request.url).searchParams); return HttpResponse.json({ items: events, total: 41, page: 1, page_size: 20 }) }),
    http.post('*/financial-events', async ({ request }) => {
      const body = await request.json() as FinancialEventCreateDto
      created.push(body)
      return HttpResponse.json(eventFixture({ ...body, id: `created-${created.length}`, category_id: body.category_id ?? null } as never), { status: 201 })
    }),
  )
  return { created, listParams }
}

beforeEach(() => setEnabledFeatures(['accounts', 'events']))
afterEach(() => { setEnabledFeatures('none'); vi.useRealTimers() })

it('records a card purchase immediately as spending and debt without touching the bank', async () => {
  const { created } = useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }))
  const dialog = screen.getByRole('dialog', { name: 'Record a purchase' })
  // Defaults come from the server: the user's default card, their recent category and local today.
  expect(within(dialog).getByLabelText('Paid with')).toHaveValue('acct-card')
  expect(within(dialog).getByLabelText('Purchase date')).toHaveValue('2026-09-10')
  await waitFor(() => expect(within(dialog).getByLabelText('Category')).toHaveValue('category-1'))
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '6000')
  expect(within(dialog).getByText(/¥6,000 counts as Groceries spending on the purchase date and is added to what you owe on Rewards Card\. Your bank balance doesn't change/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }))
  await waitFor(() => expect(created).toHaveLength(1))
  expect(created[0]).toEqual({ kind: 'EXPENSE', amount: 6000, account_id: 'acct-card', category_id: 'category-1', occurred_on: '2026-09-10', description: null, idempotency_key: expect.any(String) })
  expect(created[0]).not.toHaveProperty('effective_date')
  expect(await screen.findByText('Purchase recorded.')).toBeInTheDocument()
})

it('explains a bank purchase differently and validates inputs inline', async () => {
  useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(within(dialog).getByLabelText('Paid with'), 'acct-bank')
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '12.5')
  await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }))
  expect(within(dialog).getByText('Enter a whole number of yen greater than zero.')).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveAttribute('aria-describedby', 'event-amount-error')
  expect(within(dialog).getByText(/comes out of Everyday Bank on the purchase date/)).toBeInTheDocument()
})

it('uses the Tokyo calendar date from the server near UTC midnight', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-10T15:30:00Z'))
  server.use(http.get('*/entry-options', () => HttpResponse.json({ ...entryOptionsFixture, local_today: '2026-09-11' })))
  useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }))
  expect(screen.getByLabelText('Purchase date')).toHaveValue('2026-09-11')
})

it('retries a lost submission with the same key and ignores double clicks', async () => {
  const keys: string[] = []
  useLedgerApi()
  server.use(http.post('*/financial-events', async ({ request }) => {
    const body = await request.json() as FinancialEventCreateDto
    keys.push(body.idempotency_key!)
    await delay(50)
    return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(eventFixture(), { status: 201 })
  }))
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Record purchase' }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '6000')
  await user.dblClick(within(dialog).getByRole('button', { name: 'Record purchase' }))
  expect(await within(dialog).findByText(/submitting again will not record it twice/)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveValue('6000')
  expect(keys).toHaveLength(1)
  await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }))
  expect(await screen.findByText('Purchase recorded.')).toBeInTheDocument()
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

it('records a card repayment as a movement with no expense category', async () => {
  const { created } = useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Card repayment' }))
  const dialog = screen.getByRole('dialog', { name: 'Record a card repayment' })
  expect(within(dialog).queryByLabelText('Category')).not.toBeInTheDocument()
  expect(within(dialog).getByText(/not counted as spending again/)).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '6000')
  await user.selectOptions(within(dialog).getByLabelText('Paid from'), 'acct-bank')
  // A card can only be paid; it is not offered as a source of funds.
  expect(within(within(dialog).getByLabelText('Paid from')).queryByRole('option', { name: /Rewards Card/ })).not.toBeInTheDocument()
  await user.selectOptions(within(dialog).getByLabelText('Card'), 'acct-card')
  await user.clear(within(dialog).getByLabelText('Payment date'))
  await user.type(within(dialog).getByLabelText('Payment date'), '2026-10-27')
  await user.click(within(dialog).getByRole('button', { name: 'Record card repayment' }))
  await waitFor(() => expect(created[0]).toEqual({ kind: 'CARD_REPAYMENT', amount: 6000, account_id: 'acct-bank', destination_account_id: 'acct-card', occurred_on: '2026-10-27', effective_date: '2026-10-27', description: null, idempotency_key: expect.any(String) }))
})

it('links a refund to its purchase and refuses more than was spent', async () => {
  const { created } = useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Refund Weekly shop' }))
  const dialog = screen.getByRole('dialog', { name: 'Record a refund' })
  expect(within(dialog).getByLabelText('Refunded to')).toHaveValue('acct-card')
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '7000')
  await user.click(within(dialog).getByRole('button', { name: 'Record refund' }))
  expect(within(dialog).getByText("A refund can't be more than the original ¥6,000.")).toBeInTheDocument()
  await user.clear(within(dialog).getByLabelText('Amount (JPY)'))
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '1500')
  await user.click(within(dialog).getByRole('button', { name: 'Record refund' }))
  await waitFor(() => expect(created[0]).toMatchObject({ kind: 'REFUND', amount: 1500, account_id: 'acct-card', original_event_id: 'purchase-1' }))
  expect(created[0]).not.toHaveProperty('category_id')
})

it('corrects through a linked replacement or reversal instead of editing or deleting', async () => {
  const calls: string[] = []
  useLedgerApi()
  server.use(
    http.post('*/financial-events/:id/replace', async ({ params, request }) => { const body = await request.json() as FinancialEventCreateDto; calls.push(`replace:${params.id}:${body.amount}:${Boolean(body.idempotency_key)}`); return HttpResponse.json(eventFixture({ id: 'replacement', replaces_event_id: String(params.id) }), { status: 201 }) }),
    http.post('*/financial-events/:id/reverse', ({ params }) => { calls.push(`reverse:${params.id}`); return HttpResponse.json({ detail: 'Resolve linked card schedules before reversing' }, { status: 409 }) }),
  )
  const user = userEvent.setup()
  renderPage()
  expect(await screen.findByRole('cell', { name: 'Weekly shop' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Correct purchase Weekly shop/ }))
  let dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/stays in your history/)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveValue('6000')
  await user.clear(within(dialog).getByLabelText('Amount (JPY)'))
  await user.type(within(dialog).getByLabelText('Amount (JPY)'), '6500')
  await user.click(within(dialog).getByRole('button', { name: 'Save correction' }))
  expect(await screen.findByText(/Correction recorded/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Correct purchase Weekly shop/ }))
  dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByLabelText(/Cancel it completely/))
  await user.click(within(dialog).getByRole('button', { name: 'Record reversal' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Resolve linked card schedules before reversing.')
  expect(calls).toEqual(['replace:purchase-1:6500:true', 'reverse:purchase-1'])
})

it('keeps archived categories and unknown purchase dates visible on history without offering them for new entries', async () => {
  setEnabledFeatures(['accounts', 'events', 'category-archive'])
  useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  const row = (await screen.findByRole('cell', { name: 'Imported card bill' })).closest('tr')!
  expect(await within(row).findByText('Old hobby')).toBeInTheDocument()
  expect(within(row).getByText('(archived)')).toBeInTheDocument()
  expect(within(row).getByText('Purchase date unknown')).toBeInTheDocument()
  expect(within(row).getByText('Posted Aug 27, 2026')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Record purchase' }))
  expect(within(within(screen.getByRole('dialog')).getByLabelText('Category')).queryByRole('option', { name: 'Old hobby' })).not.toBeInTheDocument()
})

it('requires a date when correcting an entry whose purchase date is unknown', async () => {
  useLedgerApi()
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByRole('button', { name: /Correct purchase Imported card bill/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Purchase date')).toHaveValue('')
  await user.click(within(dialog).getByRole('button', { name: 'Save correction' }))
  expect(within(dialog).getByText(/original purchase date is unknown/)).toBeInTheDocument()
})

it('filters and paginates on the server through URL parameters', async () => {
  const { listParams } = useLedgerApi()
  const user = userEvent.setup()
  renderPage('/transactions?kind=EXPENSE&account_id=acct-card')
  expect(await screen.findByText('Page 1 of 3 · 41 entries')).toBeInTheDocument()
  expect(listParams.at(-1)?.get('kind')).toBe('EXPENSE')
  expect(listParams.at(-1)?.get('account_id')).toBe('acct-card')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=2'))
  await waitFor(() => expect(listParams.at(-1)?.get('page')).toBe('2'))
})

it('keeps transfers and card repayments in their own view', async () => {
  const kinds: Array<string | null> = []
  useLedgerApi()
  server.use(http.get('*/financial-events', ({ request }) => { kinds.push(new URL(request.url).searchParams.get('kind')); return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 }) }))
  const user = userEvent.setup()
  renderPage('/transfers')
  expect(await screen.findByText('No transfers yet')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Card repayments' }))
  expect(await screen.findByText('No card repayments yet')).toBeInTheDocument()
  expect(kinds).toEqual(['TRANSFER', 'CARD_REPAYMENT'])
})

it('shows earlier Cash/Bank records read-only with their provenance', async () => {
  useLedgerApi()
  renderPage('/transactions?view=earlier')
  expect(await screen.findByRole('heading', { name: 'Earlier records' })).toBeInTheDocument()
  expect(await screen.findByText('Weekly shop')).toBeInTheDocument()
  expect(screen.getAllByText('Recorded on payment date').length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})

it('has no automated accessibility violations on activity or the purchase form', async () => {
  const { axe } = await import('jest-axe')
  useLedgerApi()
  const user = userEvent.setup()
  const { container } = renderPage()
  await screen.findByRole('cell', { name: 'Weekly shop' })
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  await user.click(screen.getByRole('button', { name: 'Record purchase' }))
  expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
