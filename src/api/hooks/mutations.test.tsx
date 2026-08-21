import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { useCreateTransaction } from '@/api/hooks/transactions'
import { transactionsApi } from '@/api/resources/transactions'

vi.mock('@/api/resources/transactions', () => ({
  transactionsApi: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

describe('mutation cache invalidation', () => {
  it('invalidates transaction and report data, but not categories', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    client.setQueryData(['transactions', 'list', {}], [])
    client.setQueryData(['reports', 'monthly', {}], [])
    client.setQueryData(['categories', 'list'], [])
    vi.mocked(transactionsApi.create).mockResolvedValue({ id: 'transaction-1' } as never)
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCreateTransaction(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ amount: 100, category_id: 'category-1', transaction_date: '2026-01-01' })
    })

    expect(client.getQueryState(['transactions', 'list', {}])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['reports', 'monthly', {}])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['categories', 'list'])?.isInvalidated).toBe(false)
  })
})
