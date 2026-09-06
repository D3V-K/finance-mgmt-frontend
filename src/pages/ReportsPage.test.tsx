import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ReportsPage } from '@/pages/ReportsPage'

const mocks = vi.hoisted(() => ({ monthly: vi.fn(), categories: vi.fn(), balance: vi.fn() }))
vi.mock('@/api/hooks/reports', () => ({
  useNetBalanceReport: (filters: unknown, enabled: boolean) => mocks.balance(filters, enabled),
  useMonthlyReport: (filters: unknown, enabled: boolean) => mocks.monthly(filters, enabled),
  useCategoryReport: (filters: unknown, enabled: boolean) => mocks.categories(filters, enabled),
}))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null, CartesianGrid: () => null, Legend: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() })
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }

describe('reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.balance.mockReturnValue(ok([]))
    mocks.monthly.mockReturnValue(ok([{ month: '2026-07-01', income: 300000, expense: 120000 }]))
    mocks.categories.mockReturnValue(ok([{ category_id: 'food', category_name: 'Food', total: 45000 }]))
  })

  it('renders accessible tabular reports and a transaction drill-down', () => {
    render(<MemoryRouter initialEntries={['/reports?range=custom&from=2026-07-01&to=2026-07-31']}><ReportsPage /></MemoryRouter>)

    expect(mocks.monthly).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' }, true)
    expect(screen.getByRole('table', { name: /monthly cash-flow values/i })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /spending category values/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute('href', '/transactions?from=2026-07-01&to=2026-07-31&category_id=food&type=expense')
    expect(screen.getByRole('heading', { name: 'Net balance over time' })).toBeInTheDocument()
  })

  it('preserves custom filters in the URL and rejects reversed ranges', () => {
    render(<MemoryRouter initialEntries={['/reports?range=custom&from=2026-07-01&to=2026-07-31']}><ReportsPage /><LocationProbe /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })

    expect(screen.getByTestId('location')).toHaveTextContent('/reports?range=custom&from=2026-08-01&to=2026-07-31')
    expect(screen.getByRole('alert')).toHaveTextContent('Start date must be on or before end date.')
    expect(mocks.monthly).toHaveBeenLastCalledWith({}, false)
  })

  it('shows missing months as no data instead of zero', () => {
    render(<MemoryRouter initialEntries={['/reports?range=custom&from=2026-06-01&to=2026-07-31']}><ReportsPage /></MemoryRouter>)
    expect(screen.getAllByText('No data')).toHaveLength(3)
  })

  it('renders API balances including seeded, zero, negative and missing months without estimating', () => {
    mocks.balance.mockReturnValue(ok([{ month: '2026-04-01', net_worth: 150000 }, { month: '2026-06-01', net_worth: 0 }, { month: '2026-07-01', net_worth: -1000 }]))
    render(<MemoryRouter initialEntries={['/reports?range=custom&from=2026-04-15&to=2026-07-20']}><ReportsPage /></MemoryRouter>)
    const table = within(screen.getByRole('table', { name: /net balance values/i }))
    expect(table.getByText('¥150,000')).toBeInTheDocument()
    expect(table.getByText('¥0')).toBeInTheDocument()
    expect(table.getByText('-¥1,000')).toBeInTheDocument()
    expect(table.getByText('No data')).toBeInTheDocument()
    expect(mocks.balance).toHaveBeenCalledWith({ from: '2026-04-15', to: '2026-07-20' }, true)
  })

  it('keeps monthly reports visible while balance fails and supports focused retry', () => {
    const refetch = vi.fn()
    mocks.balance.mockReturnValue({ isError: true, error: new Error('offline'), refetch })
    render(<MemoryRouter><ReportsPage /></MemoryRouter>)
    expect(screen.getByText(/Could not load net balance/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /monthly cash-flow/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('loads balance independently of monthly data', () => {
    mocks.balance.mockReturnValue({ isLoading: true })
    render(<MemoryRouter><ReportsPage /></MemoryRouter>)
    expect(screen.getByRole('status', { name: 'Loading net balance' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /monthly cash-flow/i })).toBeInTheDocument()
  })

})
