import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { dashboardApi, forecastApi } from '@/api/resources/forecast'
import type { ExpectedCashFlowDto, ForecastScenario, ISODate, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

export function useCashForecast(from: ISODate | undefined, to: ISODate | undefined, scenario: ForecastScenario = 'baseline') {
  return useQuery({ queryKey: ledgerKeys.forecast.range(from ?? '', to ?? '', scenario), queryFn: () => forecastApi.cashForecast(from!, to!, scenario), enabled: isFeatureEnabled('forecast') && Boolean(from && to) })
}

export function useAvailableCash(asOf: ISODate | undefined, horizon: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.availableCash.range(asOf ?? '', horizon ?? ''), queryFn: () => forecastApi.availableCash(asOf!, horizon!), enabled: isFeatureEnabled('forecast') && Boolean(asOf && horizon) })
}

export function useExpectedFlows() {
  return useQuery({ queryKey: ledgerKeys.expectedFlows.all, queryFn: forecastApi.expectedFlows, enabled: isFeatureEnabled('forecast') })
}

export function useCreateExpectedFlow() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: ExpectedCashFlowDto) => forecastApi.createExpectedFlow(payload), onSuccess: () => invalidateFor(client, 'expected-flow') })
}

export function useMatchExpectedFlow() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: { event_id: UUID; occurrence_date?: ISODate | null } }) => forecastApi.matchExpectedFlow(id, payload), onSuccess: () => invalidateFor(client, 'expected-flow') })
}

export function useDashboard(asOf: ISODate | null = null) {
  return useQuery({ queryKey: ledgerKeys.dashboard.asOf(asOf), queryFn: () => dashboardApi.get(asOf), enabled: isFeatureEnabled('dashboard') })
}
