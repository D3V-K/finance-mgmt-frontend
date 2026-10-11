import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { reconciliationApi } from '@/api/resources/reconciliation'
import type { ISODate, ReconciliationDto, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

export function useLedgerQuality(enabled = true) {
  return useQuery({ queryKey: ledgerKeys.quality.all, queryFn: reconciliationApi.quality, enabled: isFeatureEnabled('reconciliation') && enabled })
}

export function useStatementBalance(accountId: UUID | undefined, from: ISODate | undefined, to: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.reconciliations.statement(accountId ?? '', from ?? '', to ?? ''), queryFn: () => reconciliationApi.statementBalance(accountId!, from!, to!), enabled: isFeatureEnabled('reconciliation') && Boolean(accountId && from && to) })
}

export function useReconciliation(id: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.reconciliations.detail(id ?? ''), queryFn: () => reconciliationApi.get(id!), enabled: isFeatureEnabled('reconciliation') && Boolean(id) })
}

export function useDraftReconciliation() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: ReconciliationDto) => reconciliationApi.draft(payload), onSuccess: () => invalidateFor(client, 'reconciliation') })
}

export function useIncludePosting() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, postingId }: { id: UUID; postingId: UUID }) => reconciliationApi.include(id, postingId), onSuccess: () => invalidateFor(client, 'reconciliation') })
}

export function useConfirmReconciliation() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => reconciliationApi.confirm(id), onSuccess: () => invalidateFor(client, 'reconciliation') })
}

export function useReopenReconciliation() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => reconciliationApi.reopen(id), onSuccess: () => invalidateFor(client, 'reconciliation') })
}

/** Export is an explicit user action, not a cached query. */
export function useLedgerExport() {
  return useMutation({ mutationFn: reconciliationApi.exportLedger })
}
