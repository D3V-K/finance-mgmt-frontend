import { apiClient } from '@/api/client'
import type { FinancialPosition, HoldingsChange, HoldingsChangeDto, ISODate, UUID, Valuation, ValuationDto } from '@/api/types'
import { requireFeature } from '@/config/features'

export const investmentsApi = {
  async valuations(accountId: UUID) { requireFeature('investments'); return (await apiClient.get<Valuation[]>(`/investments/${accountId}/valuations`)).data },
  /** Manual, securities-only snapshot. Existing snapshots are history and are never overwritten. */
  async recordValuation(accountId: UUID, payload: ValuationDto) {
    requireFeature('investments')
    return (await apiClient.post<Valuation>(`/investments/${accountId}/valuations`, { scope: 'securities_only', source: 'manual', ...payload })).data
  },
  /** Records that holdings changed (a trade happened elsewhere). Nothing is executed. */
  async recordHoldingsChange(accountId: UUID, payload: HoldingsChangeDto) {
    requireFeature('investments')
    return (await apiClient.post<HoldingsChange>(`/investments/${accountId}/holdings-changes`, payload)).data
  },
  async position(asOfDate: ISODate) { requireFeature('investments'); return (await apiClient.get<FinancialPosition>('/reports/financial-position', { params: { as_of_date: asOfDate } })).data },
  async positionSeries(from: ISODate, to: ISODate) {
    requireFeature('investments')
    return (await apiClient.get<FinancialPosition[]>('/reports/financial-position/series', { params: { from, to } })).data
  },
}
