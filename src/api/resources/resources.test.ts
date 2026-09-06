import { apiClient } from '@/api/client'
import { categoriesApi } from '@/api/resources/categories'
import { reportsApi } from '@/api/resources/reports'
import { transactionsApi } from '@/api/resources/transactions'

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('typed API resources', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes transaction filters as query parameters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    const filters = { from: '2026-01-01', to: '2026-01-31', category_id: 'category-1' }

    await transactionsApi.list(filters)

    expect(apiClient.get).toHaveBeenCalledWith('/transactions', { params: filters })
  })

  it.each(['cash', 'bank'] as const)('persists %s in create and edit requests', async (account_type) => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} })
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} })
    const payload = { account_type, amount: 100, category_id: 'category-1', transaction_date: '2026-01-01' }
    await transactionsApi.create(payload)
    await transactionsApi.update('transaction-1', { account_type })
    expect(apiClient.post).toHaveBeenCalledWith('/transactions', payload)
    expect(apiClient.put).toHaveBeenCalledWith('/transactions/transaction-1', { account_type })
  })

  it('uses the backend category tree route', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    await categoriesApi.tree()
    expect(apiClient.get).toHaveBeenCalledWith('/categories/tree')
  })

  it.each([
    { response: [{ id: 'category-1' }], label: 'an array' },
    { response: { items: [{ id: 'category-1' }] }, label: 'an items envelope' },
    { response: { categories: [{ id: 'category-1' }] }, label: 'a categories envelope' },
    { response: { data: { items: [{ id: 'category-1' }] } }, label: 'a nested data envelope' },
  ])('normalizes category lists returned as $label', async ({ response }) => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: response })

    await expect(categoriesApi.list()).resolves.toEqual([{ id: 'category-1' }])
  })

  it('normalizes wrapped category trees', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { categories: [{ id: 'category-1', children: [] }] } })

    await expect(categoriesApi.tree()).resolves.toEqual([{ id: 'category-1', children: [] }])
  })

  it('uses the existing net-worth endpoint for net balance with exact date filters', async () => {
    const response = [{ month: '2026-01-01', net_worth: -1500 }]
    vi.mocked(apiClient.get).mockResolvedValue({ data: response })
    const filters = { from: '2026-01-01', to: '2026-01-31' }
    await expect(reportsApi.netBalance(filters)).resolves.toEqual(response)
    expect(apiClient.get).toHaveBeenCalledWith('/reports/net-worth', { params: filters })
  })

  it('uses the backend report route and date filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    const filters = { from: '2026-01-01' }
    await reportsApi.byCategory(filters)
    expect(apiClient.get).toHaveBeenCalledWith('/reports/by-category', { params: filters })
  })
})
