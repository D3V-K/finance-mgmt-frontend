import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { HomePage } from '@/pages/HomePage'

const mocks = vi.hoisted(() => ({
  monthly: vi.fn(),
  categories: vi.fn(),
  transactions: vi.fn(),
}))

vi.mock('@/api/hooks/reports', () => ({
  useMonthlyReport: (filters: unknown) => mocks.monthly(filters),
  useCategoryReport: (filters: unknown) => mocks.categories(filters),
}))
vi.mock('@/api/hooks/transactions', () => ({ useTransactions: (filters: unknown) => mocks.transactions(filters) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() })
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output> }

describe('monthly dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.monthly.mockReturnValue(ok([
      { month: '2026-06-01', income: 300000, expense: 120000 },
      { month: '2026-07-01', income: 350000, expense: 100000 },
    ]))
    mocks.categories.mockReturnValue(ok([{ category_id: 'food', category_name: 'Food', total: 45000 }]))
    mocks.transactions.mockReturnValue(ok({ items: [{ id: 'tx-1', description: 'Groceries', amount: 5000, transaction_date: '2026-07-20' }], total: 1, page: 1, page_size: 5, total_pages: 1 }))
  })

  it('renders API insights and requests consistent selected-month boundaries', () => {
    render(<MemoryRouter initialEntries={['/?month=2026-07']}><HomePage /></MemoryRouter>)

    expect(screen.getAllByText(/350,000/)).not.toHaveLength(0)
    expect(screen.getAllByText(/100,000/)).not.toHaveLength(0)
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(mocks.monthly).toHaveBeenCalledWith({ from: '2026-02-01', to: '2026-07-31' })
    expect(mocks.categories).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
    expect(mocks.transactions).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31', page: 1, page_size: 5 })
    expect(screen.getByRole('link', { name: /income.*view transactions/i })).toHaveAttribute('href', '/transactions?from=2026-07-01&to=2026-07-31&type=income')
  })

  it('stores month changes in the URL and updates every widget filter', () => {
    render(<MemoryRouter initialEntries={['/?month=2026-07']}><HomePage /><LocationProbe /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Dashboard month'), { target: { value: '2026-02' } })

    expect(screen.getByTestId('location')).toHaveTextContent('/?month=2026-02')
    expect(mocks.monthly).toHaveBeenLastCalledWith({ from: '2025-09-01', to: '2026-02-28' })
    expect(mocks.categories).toHaveBeenLastCalledWith({ from: '2026-02-01', to: '2026-02-28' })
    expect(mocks.transactions).toHaveBeenLastCalledWith({ from: '2026-02-01', to: '2026-02-28', page: 1, page_size: 5 })
  })

  it('keeps other widgets available when category insights fail', () => {
    mocks.categories.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('failed'), refetch: vi.fn() })
    render(<MemoryRouter initialEntries={['/?month=2026-07']}><HomePage /></MemoryRouter>)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Category insights are unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Income versus expenses' })).toBeInTheDocument()
  })
})
