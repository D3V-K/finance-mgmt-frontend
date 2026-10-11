import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import type { CardSchedule } from '@/api/types'
import { setEnabledFeatures } from '@/config/features'
import { CardsPage } from '@/pages/CardsPage'
import { eventFixture, ledgerAccounts, ledgerFixtures, scheduleFixture } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

const purchase = eventFixture({ id: 'purchase-tv', amount: 24000, description: 'Television', occurred_on: '2026-09-05', postings: [{ account_id: 'acct-card', delta: -24000, effective_date: '2026-09-05' }] })
const schedules: CardSchedule[] = [
  { ...scheduleFixture, id: 's1', purchase_event_id: 'purchase-tv', due_date: '2026-10-27', principal_due: 8000, outstanding: 8000, unfunded: 8000 },
  { ...scheduleFixture, id: 's2', purchase_event_id: 'purchase-tv', due_date: '2026-11-27', principal_due: 8000, paid: 3000, outstanding: 5000, status: 'partially_paid', funded_reserve: 2000, unfunded: 3000 },
]

function api({ settings = true } = {}) {
  const writes: Array<{ path: string; body: unknown }> = []
  const record = async ({ request }: { request: Request }) => { writes.push({ path: new URL(request.url).pathname, body: await request.json() }) }
  server.use(
    http.get('*/accounts', () => HttpResponse.json(ledgerAccounts)),
    http.get('*/accounts/:id/balance', ({ params }) => HttpResponse.json({ account: ledgerAccounts.find((item) => item.id === params.id), as_of_date: '2026-09-10', balance: params.id === 'acct-card' ? -24000 : 100000, status: 'complete', opening_as_of_date: '2026-09-01' })),
    http.get('*/cards/:id/settings', ({ params }) => settings ? HttpResponse.json({ card_id: params.id, settlement_account_id: 'acct-bank', closing_day: 15, payment_day: 27 }) : HttpResponse.json({ detail: 'Card settings not configured' }, { status: 404 })),
    http.get('*/cards/:id/schedules', () => HttpResponse.json(schedules)),
    http.get('*/cards/:id/statements', () => HttpResponse.json([
      { due_date: '2026-10-27', principal_due: 8000, outstanding: 8000, funded_reserve: 0, schedule_ids: ['s1'], source: 'estimate', statement_id: null, closing_on: null },
      { due_date: '2026-11-27', principal_due: 8000, outstanding: 5000, funded_reserve: 2000, schedule_ids: ['s2'], source: 'estimate', statement_id: null, closing_on: null },
    ])),
    http.get('*/financial-events', ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind')
      const items = kind === 'EXPENSE' ? [purchase] : kind === 'CARD_REPAYMENT' ? [eventFixture({ id: 'repay-old', kind: 'CARD_REPAYMENT', amount: 3000, category_id: null, description: 'Earlier payment' })] : []
      return HttpResponse.json({ items, total: items.length, page: 1, page_size: 100 })
    }),
    http.post('*/cards/:id/schedules', async (info) => { await record(info); return HttpResponse.json(scheduleFixture, { status: 201 }) }),
    http.post('*/cards/:id/schedules/:sid/reserve', async (info) => { await record(info); return HttpResponse.json(schedules[0]) }),
    http.post('*/cards/:id/schedules/:sid/payments', async (info) => { await record(info); return HttpResponse.json({ ...schedules[0], paid: 8000, outstanding: 0, status: 'paid' }) }),
    http.post('*/cards/:id/statements', async (info) => { await record(info); return HttpResponse.json({ detail: 'Confirm or correct each schedule before confirming statement total' }, { status: 422 }) }),
    http.post('*/financial-events', async (info) => {
      const body = await info.request.json() as Record<string, unknown>
      writes.push({ path: '/financial-events', body })
      return HttpResponse.json(eventFixture({ id: 'repay-new', kind: 'CARD_REPAYMENT', amount: Number(body.amount), category_id: null }), { status: 201 })
    }),
  )
  return writes
}

function renderCards(route = '/cards') {
  return renderWithClient(<Routes><Route path="/cards" element={<CardsPage />} /><Route path="/cards/:cardId" element={<CardsPage />} /></Routes>, { route })
}

beforeEach(() => setEnabledFeatures(['accounts', 'events', 'cards']))
afterEach(() => setEnabledFeatures('none'))

it('shows amount owed, next withdrawal and reserve shortfall as separate figures', async () => {
  api()
  renderCards()
  const card = await screen.findByRole('article', { name: 'Rewards Card' })
  expect(await within(card).findByText('¥24,000')).toBeInTheDocument()
  expect(within(card).getByText('Amount owed')).toBeInTheDocument()
  expect(await within(card).findByText('¥8,000')).toBeInTheDocument()
  expect(within(card).getByText(/Oct 27, 2026/)).toBeInTheDocument()
  expect(within(card).getByText('Estimated date')).toBeInTheDocument()
  expect(within(card).getByText('¥8,000 not yet reserved')).toBeInTheDocument()
  expect(await within(card).findByText('Everyday Bank')).toBeInTheDocument()
})

it('prompts for a settlement bank when none is configured', async () => {
  api({ settings: false })
  renderCards()
  expect(await screen.findByText(/Choose which bank pays this card/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Set the settlement bank' })).toHaveAttribute('href', '/cards/acct-card')
})

it('splits one purchase into three installments without creating any expense', async () => {
  const writes = api()
  const user = userEvent.setup()
  renderCards('/cards/acct-card')
  await user.click(await screen.findByRole('button', { name: 'Add payment dates' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/They don’t add debt or spending/)).toBeInTheDocument()
  await user.selectOptions(within(dialog).getByLabelText('Purchase'), 'purchase-tv')
  await user.clear(within(dialog).getByLabelText('Number of payments'))
  await user.type(within(dialog).getByLabelText('Number of payments'), '3')
  await user.type(within(dialog).getByLabelText('First due date'), '2026-10-31')
  expect(within(within(dialog).getByRole('table')).getAllByText('¥8,000')).toHaveLength(3)
  await user.click(within(dialog).getByRole('button', { name: 'Add payment dates' }))
  expect(await screen.findByText('3 payment dates added.')).toBeInTheDocument()
  expect(writes).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'].map((due_date) => ({ path: '/api/cards/acct-card/schedules', body: { due_date, principal_due: 8000, source: 'estimate', purchase_event_id: 'purchase-tv' } })))
})

it('reserves existing money without moving it and explains insufficient cash', async () => {
  const writes = api()
  const user = userEvent.setup()
  renderCards('/cards/acct-card')
  await user.click(await screen.findByRole('button', { name: /^Reserve for Oct 27, 2026/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/No money moves between accounts/)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Reserve from')).toHaveValue('acct-bank')
  expect(within(dialog).getByLabelText('Amount to reserve (JPY)')).toHaveValue('8000')
  await user.click(within(dialog).getByRole('button', { name: 'Reserve money' }))
  expect(await screen.findByText('¥8,000 reserved for the Oct 27, 2026 payment.')).toBeInTheDocument()
  expect(writes).toEqual([{ path: '/api/cards/acct-card/schedules/s1/reserve', body: { account_id: 'acct-bank', amount: 8000, as_of_date: '2026-09-10' } }])

  server.use(http.post('*/cards/:id/schedules/:sid/reserve', () => HttpResponse.json({ detail: 'Insufficient unallocated cash' }, { status: 409 })))
  await user.click(screen.getByRole('button', { name: /^Reserve for Oct 27, 2026/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reserve money' }))
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('There isn’t enough unreserved money')
  expect(within(screen.getByRole('dialog')).getByLabelText('Amount to reserve (JPY)')).toHaveValue('8000')
})

it('records a repayment as a movement and links it to the payment date', async () => {
  const writes = api()
  const user = userEvent.setup()
  renderCards('/cards/acct-card')
  await user.click(await screen.findByRole('button', { name: /^Record repayment for Oct 27, 2026/ }))
  const dialog = screen.getByRole('dialog', { name: 'Record repayment' })
  expect(within(dialog).getByLabelText('Paid from')).toHaveValue('acct-bank')
  expect(within(dialog).getByLabelText('Card')).toHaveValue('acct-card')
  expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveValue('8000')
  await user.click(within(dialog).getByRole('button', { name: 'Record card repayment' }))
  expect(await screen.findByText('Card repayment recorded.')).toBeInTheDocument()
  expect(writes.map((write) => write.path)).toEqual(['/financial-events', '/api/cards/acct-card/schedules/s1/payments'])
  expect(writes[0].body).toMatchObject({ kind: 'CARD_REPAYMENT', account_id: 'acct-bank', destination_account_id: 'acct-card', amount: 8000 })
  expect(writes[0].body).not.toHaveProperty('category_id')
  expect(writes[1].body).toEqual({ repayment_event_id: 'repay-new', amount: 8000 })
})

it('keeps a clear trace when a recorded repayment could not be linked', async () => {
  api()
  server.use(http.post('*/cards/:id/schedules/:sid/payments', () => HttpResponse.json({ detail: 'Payment exceeds outstanding schedule or repayment' }, { status: 422 })))
  const user = userEvent.setup()
  renderCards('/cards/acct-card')
  await user.click(await screen.findByRole('button', { name: /^Record repayment for Oct 27, 2026/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record card repayment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/recorded but could not be applied.*Apply repayment/)
})

it('shows partly paid schedules with their remaining amount', async () => {
  api()
  renderCards('/cards/acct-card')
  const row = (await screen.findByText('Partly paid')).closest('tr')!
  expect(within(row).getByText('¥3,000')).toBeInTheDocument()
  expect(within(row).getByText('¥5,000')).toBeInTheDocument()
  expect(within(row).getByText('¥3,000 short')).toBeInTheDocument()
})

it('explains a statement total that does not match its payment dates', async () => {
  const writes = api()
  const user = userEvent.setup()
  renderCards('/cards/acct-card')
  await user.click(await screen.findByRole('button', { name: /Confirm statement due 2026-10-27/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/it is not added on top of them/)).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('Statement closing date'), '2026-10-15')
  await user.type(within(dialog).getByLabelText('Statement total (JPY)'), '8500')
  await user.click(within(dialog).getByRole('button', { name: 'Confirm statement' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('correct the individual payment dates first')
  await waitFor(() => expect(writes.at(-1)).toEqual({ path: '/api/cards/acct-card/statements', body: { closing_on: '2026-10-15', due_date: '2026-10-27', principal_confirmed: 8500, schedule_ids: ['s1'] } }))
})

it('has no automated accessibility violations on the card detail', async () => {
  const { axe } = await import('jest-axe')
  api()
  const { container } = renderCards(`/cards/${ledgerFixtures.card.id}`)
  await screen.findByText('Partly paid')
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
