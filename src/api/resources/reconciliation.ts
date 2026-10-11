import { apiClient } from '@/api/client'
import type { ISODate, LedgerExport, LedgerQuality, Reconciliation, ReconciliationDto, StatementBalance, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const reconciliationApi = {
  async statementBalance(accountId: UUID, from: ISODate, to: ISODate) {
    requireFeature('reconciliation')
    return (await apiClient.get<StatementBalance>(`/accounts/${accountId}/statement-balance`, { params: { from_: from, to } })).data
  },
  async draft(payload: ReconciliationDto) { requireFeature('reconciliation'); return (await apiClient.post<Reconciliation>('/reconciliations', payload)).data },
  async get(id: UUID) { requireFeature('reconciliation'); return (await apiClient.get<Reconciliation>(`/reconciliations/${id}`)).data },
  async reopen(id: UUID) { requireFeature('reconciliation'); return (await apiClient.post<Reconciliation>(`/reconciliations/${id}/reopen`)).data },
  async include(id: UUID, postingId: UUID) { requireFeature('reconciliation'); return (await apiClient.post<Reconciliation>(`/reconciliations/${id}/include/${postingId}`)).data },
  /** The server refuses confirmation while any unexplained difference remains. */
  async confirm(id: UUID) { requireFeature('reconciliation'); return (await apiClient.post<Reconciliation>(`/reconciliations/${id}/confirm`)).data },
  async quality() { requireFeature('reconciliation'); return (await apiClient.get<LedgerQuality>('/ledger-quality')).data },
  async exportLedger() { requireFeature('reconciliation'); return (await apiClient.get<LedgerExport>('/ledger-export')).data },
}
