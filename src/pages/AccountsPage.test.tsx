import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import type { Account } from '@/api/types'
import { FeatureRoute } from '@/components/layout/FeatureGate'
import { setEnabledFeatures } from '@/config/features'
import { AccountsPage } from '@/pages/AccountsPage'
import { ledgerFixtures } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

const secondBank: Account = { ...ledgerFixtures.bank, id: 'acct-bank-2', name: 'Savings Bank' }
const balances: Record<string, number | null> = { 'acct-bank': 120000, 'acct-bank-2': 0, 'acct-cash': null, 'acct-card': -20000, 'acct-broker': 5000 }

function useAccountsApi(accounts: Account[] = [ledgerFixtures.bank, secondBank, ledgerFixtures.cash, ledgerFixtures.card]) {
  server.use(
    http.get('*/accounts', () => HttpResponse.json(accounts)),
    http.get('*/accounts/:id/balance', ({ params }) => {
      const account = accounts.find((item) => item.id === params.id)!
      const balance = balances[String(params.id)] ?? null
      const card = account.kind === 'CREDIT_CARD' && balance !== null ? { amount_owed: Math.max(0, -balance), credit_balance: Math.max(0, balance) } : {}
      return HttpResponse.json({ account, as_of_date: '2026-09-10', balance, status: balance === null ? 'unavailable' : 'complete', opening_as_of_date: balance === null ? null : '2026-09-01', ...card })
    }),
  )
}

const row = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li') as HTMLElement

beforeEach(() => setEnabledFeatures(['accounts']))
afterEach(() => setEnabledFeatures('none'))

it('groups accounts by kind and keeps unknown, zero, card debt and credit balances distinct', async () => {
  useAccountsApi()
  renderWithClient(<AccountsPage />)
  expect(await screen.findByRole('heading', { name: 'Bank accounts' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Credit cards' })).toBeInTheDocument()
  expect(await within(row('Everyday Bank')).findByText('¥120,000')).toBeInTheDocument()
  // Two accounts of the same kind are tracked independently; zero is a real balance.
  expect(await within(row('Savings Bank')).findByText('¥0')).toBeInTheDocument()
  expect(await within(row('Wallet')).findByText('Opening balance needed')).toBeInTheDocument()
  expect(within(row('Wallet')).queryByText('¥0')).not.toBeInTheDocument()
  expect(await within(row('Rewards Card')).findByText('Amount owed ¥20,000')).toBeInTheDocument()
  expect(screen.queryByText(/-20,000|−¥20,000/)).not.toBeInTheDocument()
})

it('shows an overpaid card as a credit balance', async () => {
  balances['acct-card'] = 3000
  useAccountsApi([ledgerFixtures.card])
  renderWithClient(<AccountsPage />)
  expect(await screen.findByText('Credit balance ¥3,000')).toBeInTheDocument()
  balances['acct-card'] = -20000
})

it('converts a card amount owed to the server sign and defaults to the server local date', async () => {
  const saves: unknown[] = []
  useAccountsApi([ledgerFixtures.card])
  server.use(http.put('*/accounts/:id/opening-balance', async ({ params, request }) => {
    saves.push({ id: params.id, ...await request.json() as object })
    return HttpResponse.json({ id: 'opening', account_id: params.id, amount: -15000, as_of_date: '2026-09-10', revision: 1, updated_at: '2026-09-10T00:00:00' })
  }))
  const user = userEvent.setup()
  renderWithClient(<AccountsPage />)
  await user.click(await screen.findByRole('button', { name: 'Set opening balance for Rewards Card' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-09-10')
  expect(within(dialog).getByText(/balance at the start of this date/i)).toBeInTheDocument()
  await user.type(within(dialog).getByLabelText('Amount owed (JPY)'), '15000')
  await user.click(within(dialog).getByRole('button', { name: 'Save opening balance' }))
  await waitFor(() => expect(saves).toEqual([{ id: 'acct-card', amount: -15000, as_of_date: '2026-09-10' }]))
  expect(await screen.findByText('Rewards Card opening balance saved.')).toBeInTheDocument()
})

it('saves zero as a real opening amount and validates whole yen', async () => {
  const saves: unknown[] = []
  useAccountsApi([ledgerFixtures.cash])
  server.use(http.put('*/accounts/:id/opening-balance', async ({ request }) => { saves.push(await request.json()); return HttpResponse.json({ id: 'o', account_id: 'acct-cash', amount: 0, as_of_date: '2026-09-01', revision: 1, updated_at: '2026-09-10T00:00:00' }) }))
  const user = userEvent.setup()
  renderWithClient(<AccountsPage />)
  await user.click(await screen.findByRole('button', { name: 'Set opening balance for Wallet' }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Balance (JPY)'), '12.5')
  await user.click(within(dialog).getByRole('button', { name: 'Save opening balance' }))
  expect(within(dialog).getByText('Enter zero or a positive whole number of yen.')).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Balance (JPY)')).toHaveAttribute('aria-invalid', 'true')
  await user.clear(within(dialog).getByLabelText('Balance (JPY)'))
  await user.type(within(dialog).getByLabelText('Balance (JPY)'), '0')
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-09-01' } })
  await user.click(within(dialog).getByRole('button', { name: 'Save opening balance' }))
  await waitFor(() => expect(saves).toEqual([{ amount: 0, as_of_date: '2026-09-01' }]))
})

it('keeps entered values and explains a conflict when a correction is refused', async () => {
  useAccountsApi([ledgerFixtures.bank])
  server.use(
    http.get('*/accounts/:id/opening-balance', () => HttpResponse.json({ id: 'o', account_id: 'acct-bank', amount: 100000, as_of_date: '2026-09-01', revision: 2, updated_at: '2026-09-05T00:00:00' })),
    http.put('*/accounts/:id/opening-balance', () => HttpResponse.json({ detail: 'Reopen confirmed reconciliations before changing the opening' }, { status: 409 })),
  )
  const user = userEvent.setup()
  renderWithClient(<AccountsPage />)
  await user.click(await screen.findByRole('button', { name: 'Correct opening balance for Everyday Bank' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/entries dated before it are not replayed/i)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Balance (JPY)')).toHaveValue('100000')
  await user.clear(within(dialog).getByLabelText('Balance (JPY)'))
  await user.type(within(dialog).getByLabelText('Balance (JPY)'), '98000')
  await user.click(within(dialog).getByRole('button', { name: 'Save opening balance' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Reopen confirmed reconciliations before changing the opening. Nothing was changed')
  expect(within(dialog).getByLabelText('Balance (JPY)')).toHaveValue('98000')
})

it('creates an account after validation and archives without losing it from review', async () => {
  const writes: unknown[] = []
  const archived = { ...secondBank, archived_at: '2026-09-10T00:00:00' }
  useAccountsApi([ledgerFixtures.bank, secondBank])
  server.use(
    http.post('*/accounts', async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ ...secondBank, id: 'new' }, { status: 201 }) }),
    http.patch('*/accounts/:id', async ({ request }) => { writes.push(await request.json()); return HttpResponse.json(archived) }),
  )
  const user = userEvent.setup()
  renderWithClient(<AccountsPage />)
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add account' }))
  expect(screen.getByText('Choose what kind of account this is.')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Account name'), 'Travel Card')
  await user.selectOptions(screen.getByLabelText('Account type'), 'CREDIT_CARD')
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add account' }))
  await waitFor(() => expect(writes[0]).toEqual({ name: 'Travel Card', kind: 'CREDIT_CARD', currency: 'JPY' }))

  await user.click(await screen.findByRole('button', { name: 'Archive Savings Bank' }))
  expect(screen.getByText(/keeps every past entry and balance/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Archive account' }))
  await waitFor(() => expect(writes[1]).toEqual({ archived: true }))

  const includeArchived: Array<string | null> = []
  server.use(http.get('*/accounts', ({ request }) => { includeArchived.push(new URL(request.url).searchParams.get('include_archived')); return HttpResponse.json([ledgerFixtures.bank, archived]) }))
  await user.click(screen.getByLabelText('Show archived accounts'))
  expect(await screen.findByText('Archived')).toBeInTheDocument()
  expect(includeArchived).toContain('true')
  expect(screen.queryByRole('button', { name: 'Set opening balance for Savings Bank' })).not.toBeInTheDocument()
})

it('saves the default entry account through finance settings', async () => {
  const saves: unknown[] = []
  useAccountsApi([ledgerFixtures.bank, ledgerFixtures.card])
  server.use(http.put('*/finance-settings', async ({ request }) => { const body = await request.json(); saves.push(body); return HttpResponse.json(body) }))
  const user = userEvent.setup()
  renderWithClient(<AccountsPage />)
  const select = await screen.findByLabelText('Default entry account')
  await waitFor(() => expect(select).toHaveValue('acct-card'))
  await user.selectOptions(select, 'acct-bank')
  await user.click(screen.getByRole('button', { name: 'Save preference' }))
  await waitFor(() => expect(saves).toEqual([{ timezone: 'Asia/Tokyo', payday_day: 25, default_account_id: 'acct-bank', currency: 'JPY' }]))
})

it('does not render or request the accounts screen while the feature is disabled', () => {
  setEnabledFeatures('none')
  render(<MemoryRouter><FeatureRoute feature="accounts"><AccountsPage /></FeatureRoute></MemoryRouter>)
  expect(screen.getByText('Not available yet')).toBeInTheDocument()
})

it('has no automated accessibility violations on the list or opening dialog', async () => {
  const { axe } = await import('jest-axe')
  useAccountsApi()
  const user = userEvent.setup()
  const { container } = renderWithClient(<AccountsPage />)
  await screen.findByText('Amount owed ¥20,000')
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  await user.click(screen.getByRole('button', { name: 'Set opening balance for Rewards Card' }))
  expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
