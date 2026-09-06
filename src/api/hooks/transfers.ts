import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transfersApi } from '@/api/resources/transfers'
import type { TransferCreateDto, TransferFilter, UUID } from '@/api/types'

export const transferKeys = {
  all: ['transfers'] as const,
  lists: () => [...transferKeys.all, 'list'] as const,
  list: (filters: TransferFilter) => [...transferKeys.lists(), filters] as const,
  details: () => [...transferKeys.all, 'detail'] as const,
  detail: (id: UUID) => [...transferKeys.details(), id] as const,
}
export function useTransfers(filters: TransferFilter = {}, enabled = true) {
  return useQuery({ queryKey: transferKeys.list(filters), queryFn: () => transfersApi.list(filters), enabled })
}
export function useTransfer(id: UUID) {
  return useQuery({ queryKey: transferKeys.detail(id), queryFn: () => transfersApi.get(id), enabled: Boolean(id) })
}
function useInvalidateTransferData() {
  const client = useQueryClient()
  return () => Promise.all([
    client.invalidateQueries({ queryKey: transferKeys.all }),
    client.invalidateQueries({ queryKey: ['reports', 'balance'] }),
    client.invalidateQueries({ queryKey: ['reports', 'net-worth'] }),
  ])
}
export function useCreateTransfer() {
  const invalidate = useInvalidateTransferData()
  return useMutation({ mutationFn: (payload: TransferCreateDto) => transfersApi.create(payload), onSuccess: invalidate })
}
export function useDeleteTransfer() {
  const invalidate = useInvalidateTransferData()
  return useMutation({ mutationFn: (id: UUID) => transfersApi.remove(id), onSuccess: invalidate })
}
