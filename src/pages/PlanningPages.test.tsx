import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import { setEnabledFeatures } from '@/config/features'
import { BudgetPage } from '@/pages/BudgetPage'
import { SavingsPage } from '@/pages/SavingsPage'
import { budgetCycleFixture, ledgerAccounts } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

function Location() { return <output data-testid="location">{useLocation().search}</output> }
const renderBudget = (route = '/budget') => renderWithClient(<Routes><Route path="/budget" element={<><BudgetPage /><Location /></>} /></Routes>, { route })

beforeEach(() => setEnabledFeatures(['accounts', 'events', 'budgets']))
afterEach(() => setEnabledFeatures('none'))

describe('payday budget', () => {
  it('uses server cycle boundaries and moves between cycles by them', async () => {
    const requested: string[] = []
    server.use(http.get('*/budget-cycles/:on/summary', ({ params }) => {
      requested.push(String(params.on))
      // A payday override moved February's payday to the 24th; the client never computes this.
      const cycles: Record<string, { start: string; end_exclusive: string }> = { '2026-09-10': { start: '2026-08-25', end_exclusive: '2026-09-25' }, '2026-08-24': { start: '2026-07-24', end_exclusive: '2026-08-25' }, '2026-09-25': { start: '2026-09-25', end_exclusive: '2026-10-23' } }
      return HttpResponse.json({ ...budgetCycleFixture, ...cycles[String(params.on)] })
    }))
    const user = userEvent.setup()
    renderBudget()
    expect(await screen.findByText(/Aug 25, 2026 – Sep 24, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/This is not a calendar month/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous cycle' }))
    expect(await screen.findByText(/Jul 24, 2026 – Aug 24, 2026/)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('on=2026-08-24')
    await user.click(screen.getByRole('button', { name: 'Next cycle' }))
    await user.click(screen.getByRole('button', { name: 'Next cycle' }))
    expect(await screen.findByText(/Sep 25, 2026 – Oct 22, 2026/)).toBeInTheDocument()
    // Each step asks the server for the cycle containing the day after (or before) the current boundary.
    expect(requested).toEqual(['2026-09-10', '2026-08-24', '2026-08-25', '2026-09-25'])
  })

  it('shows refunds, remaining and overspending in text, not only colour', async () => {
    server.use(http.get('*/budget-cycles/:on/summary', () => HttpResponse.json({ ...budgetCycleFixture, unknown_purchase_date_count: 2, coverage: 'incomplete', budgets: [
      { category_id: 'category-1', category_name: 'Groceries', planned: 40000, gross_spending: 46000, refunds: 1000, net_spending: 45000, remaining: -5000 },
      { category_id: 'category-2', category_name: 'Transport', planned: 10000, gross_spending: 2000, refunds: 0, net_spending: 2000, remaining: 8000 },
    ] })))
    renderBudget()
    const groceries = (await screen.findByRole('rowheader', { name: 'Groceries' })).closest('tr')!
    expect(within(groceries).getByText('Over budget by ¥5,000')).toBeInTheDocument()
    expect(within(groceries).getByText('−¥1,000')).toBeInTheDocument()
    expect(within(screen.getByRole('rowheader', { name: 'Transport' }).closest('tr')!).getByText('¥8,000 left')).toBeInTheDocument()
    expect(screen.getByText(/2 earlier purchases have an unknown purchase date/)).toBeInTheDocument()
  })

  it('saves a budget against the server cycle start', async () => {
    const saves: unknown[] = []
    server.use(http.put('*/budgets', async ({ request }) => { saves.push(await request.json()); return HttpResponse.json({}) }))
    const user = userEvent.setup()
    renderBudget()
    await user.click(await screen.findByRole('button', { name: 'Edit Groceries budget' }))
    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Planned for this cycle (JPY)'))
    await user.type(within(dialog).getByLabelText('Planned for this cycle (JPY)'), '45000')
    await user.click(within(dialog).getByRole('button', { name: 'Save budget' }))
    await waitFor(() => expect(saves).toEqual([{ carryover: 'none', category_id: 'category-1', cycle_start: '2026-08-25', planned: 45000 }]))
  })

  it('saves payday settings and an explicit payday override', async () => {
    const writes: unknown[] = []
    server.use(
      http.put('*/finance-settings', async ({ request }) => { const body = await request.json(); writes.push(body); return HttpResponse.json(body) }),
      http.put('*/finance-settings/payday-overrides', async ({ request }) => { const body = await request.json(); writes.push(body); return HttpResponse.json(body) }),
    )
    const user = userEvent.setup()
    renderBudget()
    const payday = await screen.findByLabelText('Usual payday (day of month)')
    await user.clear(payday)
    await user.type(payday, '31')
    await user.click(screen.getByRole('button', { name: 'Save payday' }))
    expect(await screen.findByText(/Payday settings saved/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Month'), '2026-10')
    await user.type(screen.getByLabelText('Actual payday'), '2026-10-30')
    await user.click(screen.getByRole('button', { name: 'Set actual payday' }))
    await waitFor(() => expect(writes).toEqual([
      { timezone: 'Asia/Tokyo', payday_day: 31, default_account_id: 'acct-card', currency: 'JPY' },
      { month: '2026-10-01', actual_date: '2026-10-30' },
    ]))
  })
})

describe('savings', () => {
  it('keeps target, funded and available cash distinct', async () => {
    renderWithClient(<SavingsPage />)
    const goal = await screen.findByRole('article', { name: 'Emergency fund' })
    expect(within(goal).getByText('¥300,000')).toBeInTheDocument()
    expect(await within(goal).findByText('¥20,000')).toBeInTheDocument()
    expect(within(goal).getByText(/7% funded · ¥280,000 still to set aside/)).toBeInTheDocument()
    const cash = screen.getByRole('table', { name: 'Reserved and unreserved money by account' })
    expect(within(cash).getByText('¥100,000')).toBeInTheDocument()
    expect(within(cash).getByText('¥80,000')).toBeInTheDocument()
  })

  it('earmarks existing money without a transfer and releases it with a negative allocation', async () => {
    const writes: unknown[] = []
    server.use(http.post('*/allocations/buckets/:id/fund', async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ bucket_id: 'bucket-1', target: 300000, funded: 30000, shortfall: 270000 }) }))
    const user = userEvent.setup()
    renderWithClient(<SavingsPage />)
    await user.click(await screen.findByRole('button', { name: 'Set aside for Emergency fund' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Nothing is transferred, and it is not spending/)).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('From money in'), 'acct-bank')
    await user.clear(within(dialog).getByLabelText('Amount (JPY)'))
    await user.type(within(dialog).getByLabelText('Amount (JPY)'), '10000')
    await user.click(within(dialog).getByRole('button', { name: 'Set aside' }))
    expect(await screen.findByText('¥10,000 set aside for Emergency fund.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Release from Emergency fund' }))
    dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Held in'), 'acct-bank')
    await user.clear(within(dialog).getByLabelText('Amount (JPY)'))
    await user.type(within(dialog).getByLabelText('Amount (JPY)'), '5000')
    await user.click(within(dialog).getByRole('button', { name: 'Release' }))
    await waitFor(() => expect(writes).toEqual([{ account_id: 'acct-bank', amount: 10000, as_of_date: '2026-09-10' }, { account_id: 'acct-bank', amount: -5000, as_of_date: '2026-09-10' }]))
  })

  it('shows a funding conflict, keeps the input and refetches allocations', async () => {
    let allocationReads = 0
    server.use(
      http.get('*/allocations', () => { allocationReads += 1; return HttpResponse.json({ currency: 'JPY', as_of_date: '2026-09-10', accounts: [{ account_id: 'acct-bank', balance: 100000, funded: 95000, allocatable: 5000, underfunded: false, status: 'complete' }], buckets: [{ id: 'bucket-1', name: 'Emergency fund', target: 300000, funded: 20000, shortfall: 280000, goal_id: 'goal-1' }] }) }),
      http.post('*/allocations/buckets/:id/fund', () => HttpResponse.json({ detail: 'Insufficient unallocated cash' }, { status: 409 })),
    )
    const user = userEvent.setup()
    renderWithClient(<SavingsPage />)
    await user.click(await screen.findByRole('button', { name: 'Set aside for Emergency fund' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('From money in'), 'acct-bank')
    await user.click(within(dialog).getByRole('button', { name: 'Set aside' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('doesn’t have enough unreserved money. Nothing was set aside.')
    expect(within(dialog).getByLabelText('Amount (JPY)')).toHaveValue('280000')
    await waitFor(() => expect(allocationReads).toBeGreaterThan(1))
    expect(within(within(dialog).getByLabelText('From money in')).getByRole('option', { name: /Everyday Bank · ¥5,000 unreserved/ })).toBeInTheDocument()
  })

  it('shows an empty-goal state with no preset amounts', async () => {
    server.use(http.get('*/savings-goals', () => HttpResponse.json([])))
    const user = userEvent.setup()
    renderWithClient(<SavingsPage />)
    expect(await screen.findByText('No savings goals yet')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Add goal' })[0])
    await user.click(screen.getByRole('button', { name: 'Emergency fund' }))
    expect(screen.getByLabelText('Goal name')).toHaveValue('Emergency fund')
    expect(screen.getByLabelText('Target (JPY)')).toHaveValue('')
  })

  it('has no automated accessibility violations', async () => {
    const { axe } = await import('jest-axe')
    server.use(http.get('*/accounts', () => HttpResponse.json(ledgerAccounts)))
    const { container } = renderWithClient(<SavingsPage />)
    await screen.findByRole('article', { name: 'Emergency fund' })
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
