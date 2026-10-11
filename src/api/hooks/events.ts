import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor, type LedgerMutation } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { canonicalReportsApi, eventsApi } from '@/api/resources/events'
import type { DateRangeFilter, EventKind, FinancialEventCreateDto, FinancialEventFilter, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

const mutationForKind: Record<EventKind, LedgerMutation> = {
  EXPENSE: 'purchase', INCOME: 'income', REFUND: 'refund', CARD_REPAYMENT: 'repayment', TRANSFER: 'transfer', BALANCE_ADJUSTMENT: 'adjustment',
}

export function useFinancialEvents(filters: FinancialEventFilter = {}, enabled = true) {
  return useQuery({ queryKey: ledgerKeys.events.list(filters), queryFn: () => eventsApi.list(filters), enabled: isFeatureEnabled('events') && enabled })
}

export function useFinancialEvent(id: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.events.detail(id ?? ''), queryFn: () => eventsApi.get(id!), enabled: isFeatureEnabled('events') && Boolean(id) })
}

/** Refreshes exactly the views affected by the event kind; repayments never refresh spending. */
export function useCreateFinancialEvent() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: FinancialEventCreateDto) => eventsApi.create(payload), onSuccess: (event) => invalidateFor(client, mutationForKind[event.kind]) })
}

export function useReverseFinancialEvent() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => eventsApi.reverse(id), onSuccess: () => invalidateFor(client, 'correction') })
}

export function useReplaceFinancialEvent() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: FinancialEventCreateDto & { idempotency_key: string } }) => eventsApi.replace(id, payload),
    onSuccess: () => invalidateFor(client, 'correction'),
  })
}

export function useCanonicalMonthlyReport(filters: DateRangeFilter = {}, enabled = true) {
  return useQuery({ queryKey: ledgerKeys.canonicalReports.monthly(filters.from, filters.to), queryFn: () => canonicalReportsApi.monthly(filters), enabled: isFeatureEnabled('events') && enabled })
}

export function useCanonicalCategoryReport(filters: DateRangeFilter = {}, enabled = true) {
  return useQuery({ queryKey: ledgerKeys.canonicalReports.byCategory(filters.from, filters.to), queryFn: () => canonicalReportsApi.byCategory(filters), enabled: isFeatureEnabled('events') && enabled })
}
