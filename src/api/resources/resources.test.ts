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

  it('uses the backend category tree route', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    await categoriesApi.tree()
    expect(apiClient.get).toHaveBeenCalledWith('/categories/tree')
  })

  it('uses the backend report route and date filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    const filters = { from: '2026-01-01' }
    await reportsApi.byCategory(filters)
    expect(apiClient.get).toHaveBeenCalledWith('/reports/by-category', { params: filters })
  })
})
