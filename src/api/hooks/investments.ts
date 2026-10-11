import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { investmentsApi } from '@/api/resources/investments'
import type { HoldingsChangeDto, ISODate, UUID, ValuationDto } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

export function useValuations(accountId: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.valuations.list(accountId ?? ''), queryFn: () => investmentsApi.valuations(accountId!), enabled: isFeatureEnabled('investments') && Boolean(accountId) })
}

export function useFinancialPosition(asOf: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.position.asOf(asOf ?? ''), queryFn: () => investmentsApi.position(asOf!), enabled: isFeatureEnabled('investments') && Boolean(asOf) })
}

export function useFinancialPositionSeries(from: ISODate | undefined, to: ISODate | undefined, enabled = true) {
  return useQuery({ queryKey: ledgerKeys.position.series(from ?? '', to ?? ''), queryFn: () => investmentsApi.positionSeries(from!, to!), enabled: isFeatureEnabled('investments') && Boolean(from && to) && enabled })
}

export function useRecordValuation() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ accountId, payload }: { accountId: UUID; payload: ValuationDto }) => investmentsApi.recordValuation(accountId, payload), onSuccess: () => invalidateFor(client, 'valuation') })
}

export function useRecordHoldingsChange() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ accountId, payload }: { accountId: UUID; payload: HoldingsChangeDto }) => investmentsApi.recordHoldingsChange(accountId, payload), onSuccess: () => invalidateFor(client, 'valuation') })
}
