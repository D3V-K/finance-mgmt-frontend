import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '@/api/errors'
import { CategoriesPage } from '@/pages/CategoriesPage'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}))

const parent = {
  id: 'parent', user_id: 'user', name: 'Housing', type: 'EXPENSE' as const, color: '#e11d48', parent_id: null, created_at: '2026-01-01T00:00:00Z',
  children: [{ id: 'child', user_id: 'user', name: 'Rent', type: 'EXPENSE' as const, color: '#f43f5e', parent_id: 'parent', created_at: '2026-01-01T00:00:00Z', children: [] }],
}
const income = { id: 'income', user_id: 'user', name: 'Salary', type: 'INCOME' as const, color: '#059669', parent_id: null, created_at: '2026-01-01T00:00:00Z', children: [] }
const tree = [parent, income]
const list = [parent, parent.children[0], income]

vi.mock('@/api/hooks/categories', () => ({
  useCategoryTree: () => ({ data: tree, isLoading: false, isError: false, refetch: vi.fn() }),
  useCategories: () => ({ data: list }),
  useCreateCategory: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: mocks.update, isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: mocks.remove, isPending: false }),
}))

describe('CategoriesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('validates and creates a category', async () => {
    mocks.create.mockResolvedValue({})
    render(<CategoriesPage />)
    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.click(screen.getByRole('button', { name: /create category/i }))
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Groceries  ' } })
    fireEvent.click(screen.getByRole('button', { name: /create category/i }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: 'Groceries', type: 'EXPENSE', parent_id: null, color: '#e11d48' }))
  })

  it('prevents a category from becoming its own ancestor', () => {
    render(<CategoriesPage />)
    const housing = screen.getByText('Housing').closest('div')!
    fireEvent.click(within(housing).getByRole('button', { name: 'Edit' }))
    const options = within(screen.getByRole('dialog')).getAllByRole('option').map((option) => option.textContent)
    expect(options).not.toContain('Housing')
    expect(options).not.toContain('Rent')
    expect(options).not.toContain('Salary')
  })

  it('explains how to resolve an in-use deletion', async () => {
    mocks.remove.mockRejectedValue(new ApiError('Conflict', 'validation', 409))
    render(<CategoriesPage />)
    const rent = screen.getByText('Rent').closest('div')!
    fireEvent.click(within(rent).getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/move those transactions or child categories first/i)
  })
})
