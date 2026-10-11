import { apiClient } from '@/api/client'
import type { AvailableCash, CashForecast, Dashboard, ExpectedCashFlow, ExpectedCashFlowDto, ForecastScenario, ISODate, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const forecastApi = {
  async cashForecast(from: ISODate, to: ISODate, scenario: ForecastScenario = 'baseline') {
    requireFeature('forecast')
    return (await apiClient.get<CashForecast>('/reports/cash-forecast', { params: { from, to, ...(scenario === 'with_scenario' ? { scenario: true } : {}) } })).data
  },
  async availableCash(asOfDate: ISODate, horizon: ISODate) {
    requireFeature('forecast')
    return (await apiClient.get<AvailableCash>('/reports/available-cash', { params: { as_of_date: asOfDate, horizon } })).data
  },
  async expectedFlows() { requireFeature('forecast'); return (await apiClient.get<ExpectedCashFlow[]>('/expected-cash-flows')).data },
  async createExpectedFlow(payload: ExpectedCashFlowDto) { requireFeature('forecast'); return (await apiClient.post<ExpectedCashFlow>('/expected-cash-flows', payload)).data },
  async matchExpectedFlow(id: UUID, payload: { event_id: UUID; occurrence_date?: ISODate | null }) {
    requireFeature('forecast')
    return (await apiClient.post(`/expected-cash-flows/${id}/match`, payload)).data
  },
  async overrideOccurrence(id: UUID, scheduledDate: ISODate, payload: { override_date?: ISODate | null; skipped?: boolean }) {
    requireFeature('forecast')
    return (await apiClient.put(`/expected-cash-flows/${id}/occurrences/${scheduledDate}`, payload)).data
  },
}

export const dashboardApi = {
  async get(asOf?: ISODate | null) {
    requireFeature('dashboard')
    return (await apiClient.get<Dashboard>('/dashboard', { params: asOf ? { as_of: asOf } : {} })).data
  },
}
