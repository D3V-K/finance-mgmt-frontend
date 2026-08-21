import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transactionsApi } from '@/api/resources/transactions'
import { reportKeys } from '@/api/hooks/reports'
import type { TransactionCreateDto, TransactionFilter, TransactionUpdateDto, UUID } from '@/api/types'

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (filters: TransactionFilter) => [...transactionKeys.lists(), filters] as const,
  details: () => [...transactionKeys.all, 'detail'] as const,
  detail: (id: UUID) => [...transactionKeys.details(), id] as const,
}

export function useTransactions(filters: TransactionFilter = {}) {
  return useQuery({ queryKey: transactionKeys.list(filters), queryFn: () => transactionsApi.list(filters) })
}

export function useTransaction(id: UUID) {
  return useQuery({ queryKey: transactionKeys.detail(id), queryFn: () => transactionsApi.get(id), enabled: Boolean(id) })
}

function useInvalidateTransactionData() {
  const client = useQueryClient()
  return () => Promise.all([
    client.invalidateQueries({ queryKey: transactionKeys.all }),
    client.invalidateQueries({ queryKey: reportKeys.all }),
  ])
}

export function useCreateTransaction() {
  const invalidate = useInvalidateTransactionData()
  return useMutation({ mutationFn: (payload: TransactionCreateDto) => transactionsApi.create(payload), onSuccess: invalidate })
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateTransactionData()
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: TransactionUpdateDto }) => transactionsApi.update(id, payload),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactionData()
  return useMutation({ mutationFn: (id: UUID) => transactionsApi.remove(id), onSuccess: invalidate })
}
