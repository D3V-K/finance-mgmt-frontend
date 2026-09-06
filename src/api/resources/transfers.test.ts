import { apiClient } from '@/api/client'
import { transfersApi } from '@/api/resources/transfers'
vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
it('uses transfer create/list/detail/delete endpoints and exact filters', async () => {
  const transfer = { id: 'one', from_account: 'bank' as const, to_account: 'cash' as const, amount: 1000, transfer_date: '2026-09-01' }
  vi.mocked(apiClient.post).mockResolvedValue({ data: transfer })
  await expect(transfersApi.create(transfer)).resolves.toEqual(transfer)
  expect(apiClient.post).toHaveBeenCalledWith('/transfers', transfer)
  const result = { items: [transfer], page: 2, page_size: 20, total: 21, total_pages: 2 }
  vi.mocked(apiClient.get).mockResolvedValueOnce({ data: result }).mockResolvedValueOnce({ data: transfer })
  const filters = { from: '2026-08-01', to: '2026-09-01', page: 2, page_size: 20 }
  await expect(transfersApi.list(filters)).resolves.toEqual(result)
  expect(apiClient.get).toHaveBeenCalledWith('/transfers', { params: filters })
  await expect(transfersApi.get('one')).resolves.toEqual(transfer)
  expect(apiClient.get).toHaveBeenCalledWith('/transfers/one')
  await transfersApi.remove('one')
  expect(apiClient.delete).toHaveBeenCalledWith('/transfers/one')
})
