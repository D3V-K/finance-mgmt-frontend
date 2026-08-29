import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { MemoryRouter } from 'react-router-dom'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { TransactionsPage } from '@/pages/TransactionsPage'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  category: { id: 'category-1', user_id: 'user', name: 'Groceries', type: 'expense' as const, color: '#e11d48', parent_id: null, created_at: '2026-01-01T00:00:00Z', children: [] },
  query: (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  mutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/auth/useAuth', () => ({ useAuth: () => ({ signIn: mocks.signIn }) }))
vi.mock('@/api/hooks/categories', () => ({
  useCategories: () => mocks.query([mocks.category]), useCategoryTree: () => mocks.query([mocks.category]),
  useCreateCategory: mocks.mutation, useUpdateCategory: mocks.mutation, useDeleteCategory: mocks.mutation,
}))
vi.mock('@/api/hooks/transactions', () => ({
  useTransactions: () => mocks.query({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }),
  useCreateTransaction: mocks.mutation, useUpdateTransaction: mocks.mutation, useDeleteTransaction: mocks.mutation,
}))
vi.mock('@/api/hooks/reports', () => ({ useMonthlyReport: () => mocks.query([]), useCategoryReport: () => mocks.query([]) }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null, CartesianGrid: () => null, Legend: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

async function expectAccessible(ui: React.ReactElement) {
  const { container } = render(<MemoryRouter>{ui}</MemoryRouter>)
  expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
}

describe('key page accessibility', () => {
  it.each([
    ['login', <LoginPage />], ['dashboard', <HomePage />], ['transactions', <TransactionsPage />],
    ['categories', <CategoriesPage />], ['reports', <ReportsPage />],
  ])('has no automated accessibility violations on %s', async (_name, page) => expectAccessible(page))

  it('has no automated accessibility violations in the transaction dialog', async () => {
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><TransactionsPage /></MemoryRouter>)
    await user.click(screen.getByRole('button', { name: 'New transaction' }))
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })

  it('has no automated accessibility violations in the category dialog', async () => {
    const user = userEvent.setup()
    const { container } = render(<CategoriesPage />)
    await user.click(screen.getByRole('button', { name: 'New category' }))
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
