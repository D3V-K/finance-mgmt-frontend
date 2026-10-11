import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setEnabledFeatures } from '@/config/features'
import { MigrationPage } from '@/pages/MigrationPage'
import { ledgerFixtures } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

const accounts = [ledgerFixtures.bank, ledgerFixtures.card]
const legacyBankExpense = { id: 'tx-rent', user_id: 'test-user', account_type: 'bank', amount: 80000, description: 'Rent', category_id: 'category-1', transaction_date: '2026-09-27', created_at: '' }
const legacyCardLike = { ...legacyBankExpense, id: 'tx-shop', amount: 6000, description: 'Department store', transaction_date: '2026-09-28' }
const preview = {
  as_of_date: '2026-09-25', legacy_transaction_count: 12, legacy_transfer_count: 1, category_sums: { 'category-1': 186000 }, legacy_date_min: '2026-06-01', legacy_date_max: '2026-09-28',
  unresolved_transaction_ids: ['tx-shop'], unresolved_transfer_ids: [], unresolved_count: 1, mapped_count: 1, opening_total: 80000, legacy_account_type_is_unverified: true, purchase_date_basis: 'unknown_unless_confirmed',
}

function api({ confirmed = false, openings = {} as Record<string, { amount: number; as_of_date: string }> } = {}) {
  const calls = { previews: [] as unknown[], confirms: [] as unknown[], openings: [] as unknown[] }
  let isConfirmed = confirmed
  server.use(
    http.get('*/accounts', () => HttpResponse.json(accounts)),
    http.get('*/accounts/:id/opening-balance', ({ params }) => {
      const opening = openings[String(params.id)]
      return opening ? HttpResponse.json({ id: `o-${params.id}`, account_id: params.id, revision: 1, updated_at: '', ...opening }) : HttpResponse.json({ detail: 'Opening balance not set' }, { status: 404 })
    }),
    http.put('*/accounts/:id/opening-balance', async ({ params, request }) => { const body = await request.json() as { amount: number; as_of_date: string }; calls.openings.push({ id: params.id, ...body }); openings[String(params.id)] = body; return HttpResponse.json({ id: 'o', account_id: params.id, revision: 1, updated_at: '', ...body }) }),
    http.get('*/transactions', ({ request }) => {
      expect(new URL(request.url).searchParams.get('from')).toBe('2026-09-25')
      return HttpResponse.json({ items: [legacyBankExpense, legacyCardLike], total: 2, page: 1, page_size: 100, total_pages: 1 })
    }),
    http.get('*/transfers', () => HttpResponse.json({ items: [], total: 0, page: 1, page_size: 100, total_pages: 0 })),
    http.post('*/ledger-cutovers/preview', async ({ request }) => { calls.previews.push(await request.json()); return HttpResponse.json(preview) }),
    http.post('*/ledger-cutovers/confirm', async ({ request }) => { calls.confirms.push(await request.json()); isConfirmed = true; return HttpResponse.json({ id: 'cutover-1', as_of_date: '2026-09-25', unresolved_count: 1, status: 'confirmed' }) }),
    http.get('*/ledger-cutovers/unresolved', () => isConfirmed
      ? HttpResponse.json({ as_of_date: '2026-09-25', count: 1, records: [{ source_table: 'transactions', source_id: 'tx-shop', recorded_date: '2026-09-28', amount: 6000, category_id: 'category-1' }] })
      : HttpResponse.json({ detail: 'Confirm cutover first' }, { status: 404 })),
  )
  return calls
}

beforeEach(() => setEnabledFeatures(['accounts', 'cutover']))
afterEach(() => setEnabledFeatures('none'))

async function walkToRecords(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Get started' }))
  await user.selectOptions(screen.getByLabelText('Records labelled Bank'), 'acct-bank')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.clear(screen.getByLabelText('Start tracking purchases on'))
  await user.type(screen.getByLabelText('Start tracking purchases on'), '2026-09-25')
  expect(screen.getByText(/card debt you already owe on that morning includes all older purchases/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.type(screen.getByLabelText('Everyday Bank balance (JPY)'), '100000')
  await user.type(screen.getByLabelText('Rewards Card amount owed (JPY)'), '20000')
  await user.click(screen.getByRole('button', { name: 'Save balances and continue' }))
  return screen.findByRole('heading', { name: /records on or after/i })
}

it('previews without writing, never guesses purchase dates and confirms exactly the previewed cutover once', async () => {
  const calls = api()
  const user = userEvent.setup()
  renderWithClient(<MigrationPage />)
  await walkToRecords(user)
  expect(calls.openings).toEqual([{ id: 'acct-bank', amount: 100000, as_of_date: '2026-09-25' }, { id: 'acct-card', amount: -20000, as_of_date: '2026-09-25' }])
  expect(screen.getAllByText('Recorded on payment date')).toHaveLength(2)

  // A card assignment needs a confirmed purchase date; nothing is previewed until then.
  await user.selectOptions(screen.getByLabelText(/Account for Department store/), 'acct-card')
  await user.click(screen.getByRole('button', { name: 'Preview migration' }))
  expect(await screen.findByText('Enter the purchase date, or leave this record for later.')).toBeInTheDocument()
  expect(calls.previews).toHaveLength(0)
  await user.selectOptions(screen.getByLabelText(/Account for Department store/), '')
  await user.click(screen.getByRole('button', { name: 'Preview migration' }))

  expect(await screen.findByText('This preview did not change anything.')).toBeInTheDocument()
  expect(calls.previews).toEqual([{
    as_of_date: '2026-09-25',
    openings: [{ account_id: 'acct-bank', amount: 100000 }, { account_id: 'acct-card', amount: -20000 }],
    // The bank record keeps its recorded date as the posting date and an unknown purchase date.
    transactions: [{ transaction_id: 'tx-rent', account_id: 'acct-bank', effective_date: '2026-09-27', occurred_on: null }],
    transfers: [],
  }])
  expect(calls.confirms).toHaveLength(0)
  expect(within(screen.getByRole('table')).getByText('¥186,000')).toBeInTheDocument()
  expect(screen.getByText(/1 recent record stays unassigned/)).toBeInTheDocument()

  const confirm = screen.getByRole('button', { name: 'Confirm migration' })
  expect(confirm).toBeDisabled()
  await user.click(screen.getByLabelText(/I understand that records before/))
  await user.dblClick(confirm)
  expect(await screen.findByRole('heading', { name: /Purchase-date tracking started/ })).toBeInTheDocument()
  expect(calls.confirms).toEqual([calls.previews[0]])
  expect(screen.getByText(/incomplete until the records below are assigned/)).toBeInTheDocument()
})

it('checks the server after a lost confirmation response instead of resubmitting', async () => {
  const calls = api()
  let attempts = 0
  let applied = false
  server.use(
    http.post('*/ledger-cutovers/confirm', () => { attempts += 1; applied = true; return HttpResponse.error() }),
    http.get('*/ledger-cutovers/unresolved', () => applied ? HttpResponse.json({ as_of_date: '2026-09-25', count: 0, records: [] }) : HttpResponse.json({ detail: 'Confirm cutover first' }, { status: 404 })),
  )
  const user = userEvent.setup()
  renderWithClient(<MigrationPage />)
  await walkToRecords(user)
  await user.click(screen.getByRole('button', { name: 'Preview migration' }))
  await user.click(await screen.findByLabelText(/I understand that records before/))
  await user.click(screen.getByRole('button', { name: 'Confirm migration' }))
  expect(await screen.findByText('Every record after the start date is assigned to an account.')).toBeInTheDocument()
  expect(attempts).toBe(1)
  expect(calls.previews).toHaveLength(1)
})

it('resumes from balances already saved on the server', async () => {
  api({ openings: { 'acct-bank': { amount: 100000, as_of_date: '2026-09-25' }, 'acct-card': { amount: -20000, as_of_date: '2026-09-25' } } })
  renderWithClient(<MigrationPage />)
  expect(await screen.findByRole('heading', { name: 'Records on or after Sep 25, 2026' })).toBeInTheDocument()
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('5. Recent records')
})

it('lets a returning user assign remaining records through a read-only preview first', async () => {
  api({ confirmed: true })
  const resolutions: string[] = []
  server.use(
    http.post('*/ledger-cutovers/resolve/preview', async ({ request }) => { resolutions.push(`preview:${JSON.stringify(await request.json())}`); return HttpResponse.json({ as_of_date: '2026-09-25', remaining_before: 1, records: [{ source_table: 'transactions', source_id: 'tx-shop', status: 'unresolved' }], writes: 0 }) }),
    http.post('*/ledger-cutovers/resolve/confirm', async ({ request }) => { resolutions.push(`confirm:${JSON.stringify(await request.json())}`); return HttpResponse.json({ resolved: 1, remaining: 0, status: 'confirmed' }) }),
  )
  const user = userEvent.setup()
  renderWithClient(<MigrationPage />)
  expect(await screen.findByRole('heading', { name: '1 record needs an account' })).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText(/Account for record on 2026-09-28/), 'acct-card')
  await user.type(screen.getByLabelText(/Purchase date for record/), '2026-09-26')
  await user.click(screen.getByRole('button', { name: 'Review assignments' }))
  await user.click(await screen.findByRole('button', { name: 'Assign records' }))
  expect(await screen.findByText('1 record assigned. 0 left.')).toBeInTheDocument()
  const mapping = JSON.stringify({ transactions: [{ transaction_id: 'tx-shop', account_id: 'acct-card', effective_date: '2026-09-26', occurred_on: '2026-09-26' }], transfers: [] })
  expect(resolutions).toEqual([`preview:${mapping}`, `confirm:${mapping}`])
})

it('has no automated accessibility violations on the record mapping step', async () => {
  const { axe } = await import('jest-axe')
  api()
  const user = userEvent.setup()
  const { container } = renderWithClient(<MigrationPage />)
  await walkToRecords(user)
  await waitFor(() => expect(screen.getAllByText('Recorded on payment date')).toHaveLength(2))
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
