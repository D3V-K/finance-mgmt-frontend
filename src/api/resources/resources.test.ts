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

  it('uses the backend report route and date filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    const filters = { from: '2026-01-01' }
    await reportsApi.byCategory(filters)
    expect(apiClient.get).toHaveBeenCalledWith('/reports/by-category', { params: filters })
  })
})
