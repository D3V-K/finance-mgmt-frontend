import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setEnabledFeatures } from '@/config/features'
import { InvestmentsPage } from '@/pages/InvestmentsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { positionFixture } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return { ResponsiveContainer: Box, LineChart: Box, BarChart: Box, Line: () => null, Bar: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null, ReferenceLine: () => null }
})

const route = '/reports?range=custom&from=2026-07-01&to=2026-09-30'

beforeEach(() => {
  setEnabledFeatures(['accounts', 'events', 'investments'])
  server.use(http.get('*/reports/net-worth', () => HttpResponse.json([{ month: '2026-09-01', net_worth: 90000 }])))
})
afterEach(() => setEnabledFeatures('none'))

it('shows net worth from assets minus liabilities, separate from spendable cash and the legacy net balance', async () => {
  renderWithClient(<ReportsPage />, { route })
  const section = await screen.findByRole('article', { name: 'Net worth' })
  // Synthetic: bank 100,000 + brokerage cash 10,000 + securities 50,000 − card debt 20,000.
  expect(await within(section).findByText('¥140,000', { selector: 'dd *' })).toBeInTheDocument()
  expect(within(section).getByText('¥100,000')).toBeInTheDocument()
  expect(within(section).getByText('¥10,000')).toBeInTheDocument()
  expect(within(section).getByText('¥50,000')).toBeInTheDocument()
  expect(within(section).getByText('¥20,000')).toBeInTheDocument()
  expect(within(section).getByText(/It is not money available to spend/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Income minus spending' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Net balance from earlier Cash/Bank records' })).toBeInTheDocument()
  expect(screen.getByText(/It is not net worth/)).toBeInTheDocument()
})

it('leaves gaps for months the server cannot value instead of estimating them', async () => {
  server.use(http.get('*/reports/financial-position/series', () => HttpResponse.json([
    { ...positionFixture, as_of_date: '2026-07-31', net_worth: null, coverage: 'incomplete' },
    { ...positionFixture, as_of_date: '2026-09-30' },
  ])))
  renderWithClient(<ReportsPage />, { route })
  const table = await screen.findByRole('table', { name: 'Net worth values shown in the chart' })
  await waitFor(() => expect(within(table).getAllByText('Incomplete')).toHaveLength(2))
  const rows = within(table).getAllByRole('row')
  expect(within(rows[rows.length - 1]).getByText('¥140,000')).toBeInTheDocument()
})

it('keeps categories whose refunds bring spending to zero or below', async () => {
  server.use(http.get('*/reports/canonical-by-category', () => HttpResponse.json([
    { category_id: 'category-1', category_name: 'Groceries', gross_spending: 6000, refunds: 0, net_spending: 6000, date_basis: 'known_only' },
    { category_id: 'category-2', category_name: 'Electronics', gross_spending: 0, refunds: 500, net_spending: -500, date_basis: 'known_only' },
    { category_id: 'category-3', category_name: 'Clothing', gross_spending: 3000, refunds: 3000, net_spending: 0, date_basis: 'known_only' },
  ])))
  renderWithClient(<ReportsPage />, { route })
  const table = await screen.findByRole('table', { name: 'Spending category values shown in the chart' })
  const electronics = within(table).getByRole('rowheader', { name: 'Electronics' }).closest('tr')!
  // Refunded 500 with nothing purchased in range: spending after refunds is −500, not hidden.
  expect(within(electronics).getAllByText('−¥500')).toHaveLength(2)
  expect(within(table).getByRole('rowheader', { name: 'Clothing' })).toBeInTheDocument()
  expect(within(table).getByRole('link', { name: 'Groceries' })).toHaveAttribute('href', '/transactions?from=2026-07-01&to=2026-09-30&category_id=category-1')
})

it('reports canonical income minus spending after refunds by purchase date', async () => {
  renderWithClient(<ReportsPage />, { route })
  const table = await screen.findByRole('table', { name: 'Monthly cash-flow values shown in the chart' })
  const rows = within(table).getAllByRole('row')
  const september = rows[rows.length - 1]
  expect(within(september).getByText('¥300,000')).toBeInTheDocument()
  expect(within(september).getByText('¥6,000')).toBeInTheDocument()
  expect(within(september).getByText('¥294,000')).toBeInTheDocument()
  expect(screen.getByText(/card repayments and money set aside are not spending/)).toBeInTheDocument()
})

describe('investments', () => {
  it('records a manual securities-only value and explains a same-date conflict', async () => {
    const writes: unknown[] = []
    let attempt = 0
    server.use(http.post('*/investments/:id/valuations', async ({ request }) => {
      writes.push(await request.json())
      attempt += 1
      return attempt === 1 ? HttpResponse.json({ detail: 'Valuation for date already exists; preserve its history' }, { status: 409 }) : HttpResponse.json({ id: 'v2' }, { status: 201 })
    }))
    const user = userEvent.setup()
    renderWithClient(<InvestmentsPage />)
    const card = await screen.findByRole('article', { name: 'Brokerage' })
    expect((await within(card).findAllByText('¥50,000')).length).toBeGreaterThan(0)
    expect(within(card).getByText(/entered manually · securities only/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Record value for Brokerage' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Leave out uninvested cash/)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Value as of'))
    await user.type(within(dialog).getByLabelText('Value as of'), '2026-09-01')
    await user.type(within(dialog).getByLabelText('Securities value (JPY)'), '52000')
    await user.click(within(dialog).getByRole('button', { name: 'Record value' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already recorded for that date and is kept as history')
    await user.clear(within(dialog).getByLabelText('Value as of'))
    await user.type(within(dialog).getByLabelText('Value as of'), '2026-09-10')
    await user.click(within(dialog).getByRole('button', { name: 'Record value' }))
    expect(await screen.findByText(/Securities value for Brokerage recorded/)).toBeInTheDocument()
    expect(writes).toEqual([
      { scope: 'securities_only', source: 'manual', as_of_date: '2026-09-01', market_value: 52000 },
      { scope: 'securities_only', source: 'manual', as_of_date: '2026-09-10', market_value: 52000 },
    ])
  })

  it('warns when holdings changed after the last value and makes clear no trade is placed', async () => {
    server.use(http.get('*/reports/financial-position', () => HttpResponse.json({ ...positionFixture, net_worth: null, coverage: 'incomplete', accounts: positionFixture.accounts.map((row) => row.securities ? { ...row, securities: { ...row.securities, status: 'stale_after_holdings_change' } } : row) })))
    const user = userEvent.setup()
    renderWithClient(<InvestmentsPage />)
    expect(await screen.findByText(/Holdings changed after the last value/)).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Note a trade for Brokerage' }))
    expect(screen.getByText(/does not place a trade/)).toBeInTheDocument()
    expect(screen.getByText(/Sale proceeds stay in brokerage cash and are not salary/)).toBeInTheDocument()
  })

  it('has no automated accessibility violations', async () => {
    const { axe } = await import('jest-axe')
    const { container } = renderWithClient(<InvestmentsPage />)
    await screen.findByRole('article', { name: 'Brokerage' })
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
