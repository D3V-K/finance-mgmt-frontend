import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '@/api/hooks/transactions'
import { useUpdateCategory, useDeleteCategory } from '@/api/hooks/categories'
import { categoriesApi } from '@/api/resources/categories'
import { transactionsApi } from '@/api/resources/transactions'

vi.mock('@/api/resources/transactions', () => ({
  transactionsApi: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

vi.mock('@/api/resources/categories', () => ({ categoriesApi: { update: vi.fn(), remove: vi.fn() } }))

describe('mutation cache invalidation', () => {
  it.each(['create', 'update', 'delete'] as const)('%s invalidates transaction and all balance/report data, but not categories', async (operation) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    client.setQueryData(['transactions', 'list', {}], [])
    client.setQueryData(['reports', 'monthly', {}], [])
    client.setQueryData(['reports', 'balance'], {})
    client.setQueryData(['reports', 'net-worth', {}], [])
    client.setQueryData(['categories', 'list'], [])
    vi.mocked(transactionsApi.create).mockResolvedValue({ id: 'transaction-1' } as never)
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => ({ create: useCreateTransaction(), update: useUpdateTransaction(), delete: useDeleteTransaction() }), { wrapper })

    await act(async () => {
      const payload = { account_type: 'cash' as const, amount: 100, category_id: 'category-1', transaction_date: '2026-01-01' }
      if (operation === 'create') await result.current.create.mutateAsync(payload)
      else if (operation === 'update') await result.current.update.mutateAsync({ id: 'transaction-1', payload })
      else await result.current.delete.mutateAsync('transaction-1')
    })

    expect(client.getQueryState(['transactions', 'list', {}])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['reports', 'monthly', {}])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['reports', 'balance'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['reports', 'net-worth', {}])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['categories', 'list'])?.isInvalidated).toBe(false)
  })
})

describe('category mutation balance invalidation', () => {
  it.each(['update', 'delete'] as const)('%s refreshes current and historical balances', async (operation) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const keys = [['reports', 'balance'], ['reports', 'net-balance', {}], ['reports', 'monthly', {}], ['transactions', 'list', {}], ['categories', 'list']]
    keys.forEach((key) => client.setQueryData(key, []))
    vi.mocked(categoriesApi.update).mockResolvedValue({} as never)
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => ({ update: useUpdateCategory(), delete: useDeleteCategory() }), { wrapper })
    await act(async () => {
      if (operation === 'update') await result.current.update.mutateAsync({ id: 'category-1', payload: { type: 'income' } })
      else await result.current.delete.mutateAsync('category-1')
    })
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true))
  })
})
