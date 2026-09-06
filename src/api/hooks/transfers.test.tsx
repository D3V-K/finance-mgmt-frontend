import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { useCreateTransfer, useDeleteTransfer } from '@/api/hooks/transfers'
import { transfersApi } from '@/api/resources/transfers'
vi.mock('@/api/resources/transfers', () => ({ transfersApi: { create: vi.fn(), remove: vi.fn() } }))
it.each(['create', 'delete'])('%s invalidates transfers and balances without invalidating transactions or income/expense reports', async (operation) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidated = [['transfers', 'list', {}], ['transfers', 'detail', 'one'], ['reports', 'balance'], ['reports', 'net-worth', {}]]
  const preserved = [['transactions', 'list', {}], ['reports', 'monthly', {}], ['reports', 'by-category', {}]]
  for (const key of [...invalidated, ...preserved]) client.setQueryData(key, {})
  vi.mocked(transfersApi.create).mockResolvedValue({} as never)
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => ({ create: useCreateTransfer(), remove: useDeleteTransfer() }), { wrapper })
  await act(async () => {
    if (operation === 'create') await result.current.create.mutateAsync({ from_account: 'cash', to_account: 'bank', amount: 10, transfer_date: '2026-09-01' })
    else await result.current.remove.mutateAsync('one')
  })
  for (const key of invalidated) expect(client.getQueryState(key)?.isInvalidated).toBe(true)
  for (const key of preserved) expect(client.getQueryState(key)?.isInvalidated).toBe(false)
})
