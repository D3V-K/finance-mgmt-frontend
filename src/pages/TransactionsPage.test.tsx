import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { TransactionsPage } from '@/pages/TransactionsPage'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), filters: [] as unknown[] }))
const category = { id: 'cat-1', user_id: 'user', name: 'Salary', type: 'income' as const, color: '#059669', parent_id: null, created_at: '2026-01-01T00:00:00Z' }
const transaction = { id: 'txn-1', user_id: 'user', amount: 120000, description: 'August salary', category_id: 'cat-1', transaction_date: '2026-08-25', created_at: '2026-08-25T00:00:00Z' }

vi.mock('@/api/hooks/categories', () => ({ useCategories: () => ({ data: [category], isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/api/hooks/transactions', () => ({
  useTransactions: (filters: unknown) => { mocks.filters.push(filters); return { data: { items: [transaction], total: 1, page: 1, page_size: 20, total_pages: 1 }, isLoading: false, isError: false, refetch: vi.fn() } },
  useCreateTransaction: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: mocks.remove, isPending: false }),
}))

function Location() { return <output data-testid="location">{useLocation().search}</output> }
function renderPage(path = '/transactions') { return render(<MemoryRouter initialEntries={[path]}><TransactionsPage/><Location/></MemoryRouter>) }

describe('TransactionsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.filters.length = 0 })

  it('shows transactions and preserves filters in the URL', async () => {
    renderPage()
    expect(screen.getByText('August salary')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('type=income'))
    expect(mocks.filters.at(-1)).toMatchObject({ type: 'income', page: 1, page_size: 20 })
  })

  it('validates and creates a transaction', async () => {
    mocks.create.mockResolvedValue({})
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New transaction' }))
    fireEvent.change(screen.getByLabelText('Amount (JPY)'), { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create transaction' }).closest('form')!)
    expect(await screen.findByText('Amount must be greater than zero.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Amount (JPY)'), { target: { value: '2500' } })
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Category'), { target: { value: 'cat-1' } })
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: ' Bonus ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create transaction' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 2500, category_id: 'cat-1', description: 'Bonus' })))
  })

  it('requires confirmation before deleting', async () => {
    mocks.remove.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete transaction' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('txn-1'))
  })
})
