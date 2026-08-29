import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ReportsPage } from '@/pages/ReportsPage'

const mocks = vi.hoisted(() => ({ monthly: vi.fn(), categories: vi.fn() }))
vi.mock('@/api/hooks/reports', () => ({
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
    mocks.monthly.mockReturnValue(ok([{ month: '2026-07-01', income: 300000, expense: 120000 }]))
    mocks.categories.mockReturnValue(ok([{ category_id: 'food', category_name: 'Food', total: 45000 }]))
  })

  it('renders accessible tabular reports and a transaction drill-down', () => {
    render(<MemoryRouter initialEntries={['/reports?range=custom&from=2026-07-01&to=2026-07-31']}><ReportsPage /></MemoryRouter>)

    expect(mocks.monthly).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' }, true)
    expect(screen.getByRole('table', { name: /monthly cash-flow values/i })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /spending category values/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Food' })).toHaveAttribute('href', '/transactions?from=2026-07-01&to=2026-07-31&category_id=food&type=expense')
    expect(screen.getByText(/data model does not expose account balance history/i)).toBeInTheDocument()
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
})
