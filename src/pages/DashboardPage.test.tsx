import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { CashForecast } from '@/api/types'
import { setEnabledFeatures } from '@/config/features'
import { HomePage } from '@/pages/HomePage'
import { dashboardFixture, forecastFixture, ledgerFixtures } from '@/test/ledgerFixtures'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return { ResponsiveContainer: Box, LineChart: Box, BarChart: Box, Line: () => null, Bar: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null, ReferenceLine: () => null }
})

function Location() { return <output data-testid="location">{useLocation().search}</output> }
const renderDashboard = (route = '/') => renderWithClient(<Routes><Route path="/" element={<><HomePage /><Location /></>} /></Routes>, { route })

beforeEach(() => setEnabledFeatures('all'))
afterEach(() => setEnabledFeatures('none'))

it('leads with available cash after commitments and keeps account balances separate', async () => {
  renderDashboard()
  const available = await screen.findByRole('article', { name: 'Available after commitments' })
  expect(within(available).getByText('¥74,000')).toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Left in this payday’s budget' })).getByText('¥34,000')).toBeInTheDocument()
  const next = screen.getByRole('article', { name: 'Next withdrawal' })
  expect(within(next).getByText('¥6,000')).toBeInTheDocument()
  expect(await within(next).findByText(/Card payment from Everyday Bank on Sep 11, 2026 · estimated/)).toBeInTheDocument()
  const table = screen.getByRole('table', { name: 'Cash available by account' })
  const bank = within(table).getByRole('rowheader', { name: 'Everyday Bank' }).closest('tr')!
  expect(within(bank).getByText('¥100,000')).toBeInTheDocument()
  expect(within(bank).getByText('¥20,000')).toBeInTheDocument()
  expect(within(bank).getByText('¥74,000')).toBeInTheDocument()
  expect(screen.getByText(/An account balance is not all free to spend/)).toBeInTheDocument()
  expect(screen.queryByText(/Funds available now/)).not.toBeInTheDocument()
})

it('never shows unknown balances, budgets or net worth as a reassuring zero', async () => {
  server.use(http.get('*/dashboard', () => HttpResponse.json({
    ...dashboardFixture,
    available_cash: { ...dashboardFixture.available_cash, coverage: 'incomplete', remaining_discretionary_budget: null, accounts: [
      ...dashboardFixture.available_cash.accounts,
      { account_id: ledgerFixtures.cash.id, liquid_balance: null, funded_earmarks: 0, unfunded_known_due: 0, raw_available: null, spendable: null, reserve_shortfall: 0, coverage: 'unavailable' },
    ] },
    financial_position: { ...dashboardFixture.financial_position, net_worth: null, coverage: 'incomplete' },
    warnings: ['Available cash incomplete; confirm account openings and mapping'],
  })))
  renderDashboard()
  const available = await screen.findByRole('article', { name: 'Available after commitments' })
  expect(within(available).getByText('Needs review')).toBeInTheDocument()
  expect(within(available).queryByText('¥74,000')).not.toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Left in this payday’s budget' })).getByText('Needs review')).toBeInTheDocument()
  const wallet = within(screen.getByRole('table', { name: 'Cash available by account' })).getByRole('rowheader', { name: /Wallet/ })
  expect(await within(wallet).findByText('Needs review: Opening balance needed')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Net worth' })).getByText('Needs review')).toBeInTheDocument()
  const warnings = screen.getByRole('region', { name: 'Needs review' })
  expect(within(warnings).getByText('Available cash incomplete; confirm account openings and mapping')).toBeInTheDocument()
  expect(within(warnings).getByRole('link', { name: 'Review migration' })).toHaveAttribute('href', '/setup/migration')
})

it('flags a settlement bank that cannot cover its withdrawal even when other accounts have money', async () => {
  const short: CashForecast = { ...forecastFixture, days: [
    { ...forecastFixture.days[0], start_balance: 4000, end_balance: 4000 },
    { ...forecastFixture.days[1], start_balance: 4000, end_balance: -2000, shortfall: true },
  ], lowest_by_account: { [ledgerFixtures.bank.id]: { balance: -2000, date: '2026-09-11' } } }
  server.use(
    http.get('*/dashboard', () => HttpResponse.json({ ...dashboardFixture, available_cash: { ...dashboardFixture.available_cash, accounts: [
      { account_id: ledgerFixtures.bank.id, liquid_balance: 4000, funded_earmarks: 0, unfunded_known_due: 6000, raw_available: -2000, spendable: 0, reserve_shortfall: 6000, coverage: 'complete' },
      { account_id: ledgerFixtures.cash.id, liquid_balance: 50000, funded_earmarks: 0, unfunded_known_due: 0, raw_available: 50000, spendable: 50000, reserve_shortfall: 0, coverage: 'complete' },
    ] } })),
    http.get('*/reports/cash-forecast', () => HttpResponse.json(short)),
  )
  renderDashboard()
  const bank = within(await screen.findByRole('table', { name: 'Cash available by account' })).getByRole('rowheader', { name: 'Everyday Bank' }).closest('tr')!
  expect(within(bank).getByText('Short by ¥2,000 for what is due')).toBeInTheDocument()
  expect(await screen.findByText(/Everyday Bank is projected to go below zero on Sep 11, 2026\. Money in other accounts does not cover it automatically/)).toBeInTheDocument()
  expect(screen.getByRole('table', { name: /Projected balance by day for Everyday Bank/ })).toHaveTextContent('Below zero')
})

it('adds an unconfirmed bonus only in the explicit scenario and keeps the choice in the URL', async () => {
  const scenarios: Array<string | null> = []
  server.use(http.get('*/reports/cash-forecast', ({ request }) => {
    const scenario = new URL(request.url).searchParams.get('scenario')
    scenarios.push(scenario)
    const bonus = scenario ? [{ amount: 200000, source: 'expected', label: 'Possible bonus', certainty: 'scenario_only', id: 'flow-bonus' }] : []
    return HttpResponse.json({ ...forecastFixture, scenario: scenario ? 'with_scenario' : 'baseline', days: [forecastFixture.days[0], { ...forecastFixture.days[1], movements: [...forecastFixture.days[1].movements, ...bonus] }] })
  }))
  const user = userEvent.setup()
  renderDashboard()
  const table = await screen.findByRole('table', { name: /Projected balance by day/ })
  expect(within(table).queryByText(/Possible bonus/)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Forecast scenario'), 'with_scenario')
  expect(await screen.findByText(/Possible bonus \(scenario\)/)).toBeInTheDocument()
  expect(screen.getByTestId('location')).toHaveTextContent('scenario=with_scenario')
  expect(scenarios).toEqual([null, 'true'])
  // The scenario never changes the present-day figures.
  expect(within(screen.getByRole('article', { name: 'Available after commitments' })).getByText('¥74,000')).toBeInTheDocument()
})

it('surfaces same-day clearing uncertainty from the server', async () => {
  server.use(http.get('*/reports/cash-forecast', () => HttpResponse.json({ ...forecastFixture, days: [forecastFixture.days[0], { ...forecastFixture.days[1], intraday_order_uncertain: true, movements: [{ amount: 250000, source: 'expected', label: 'Salary', certainty: 'confirmed', id: 'salary' }, ...forecastFixture.days[1].movements] }] })))
  renderDashboard()
  expect(await screen.findByText(/Same-day order unknown/)).toBeInTheDocument()
  expect(screen.getByText(/Expected salary appears here as future income/)).toBeInTheDocument()
})

it('keeps the overview usable when the forecast fails and retries only that section', async () => {
  let attempts = 0
  server.use(http.get('*/reports/cash-forecast', () => { attempts += 1; return attempts === 1 ? HttpResponse.json({ detail: 'Forecast unavailable' }, { status: 500 }) : HttpResponse.json(forecastFixture) }))
  const user = userEvent.setup()
  renderDashboard()
  expect(await screen.findByText(/Could not load the forecast/)).toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Available after commitments' })).toHaveTextContent('¥74,000')
  await user.click(within(screen.getByRole('region', { name: 'Cash forecast' })).getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('table', { name: /Projected balance by day/ })).toBeInTheDocument()
})

it('requests the dashboard for a dated view from the URL', async () => {
  const asOf: Array<string | null> = []
  server.use(http.get('*/dashboard', ({ request }) => { asOf.push(new URL(request.url).searchParams.get('as_of')); return HttpResponse.json(dashboardFixture) }))
  renderDashboard('/?as_of=2026-09-01')
  await screen.findByRole('article', { name: 'Available after commitments' })
  await waitFor(() => expect(asOf).toEqual(['2026-09-01']))
})

it('has no automated accessibility violations', async () => {
  const { axe } = await import('jest-axe')
  const { container } = renderDashboard()
  await screen.findByRole('table', { name: /Projected balance by day/ })
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
})
