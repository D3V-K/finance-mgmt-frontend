import { apiClient } from '@/api/client'
import type { CardSchedule, CardScheduleCreateDto, CardScheduleUpdateDto, CardSettings, CardSettingsDto, CardStatement, CardStatementConfirmDto, CardStatementGroup, PaymentAllocationDto, RefundAllocationDto, ReserveDto, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const cardsApi = {
  /** Resolves null when the card has no settlement settings yet. */
  async settings(cardId: UUID) {
    requireFeature('cards')
    try { return (await apiClient.get<CardSettings>(`/cards/${cardId}/settings`)).data }
    catch (error) { if ((error as { kind?: string }).kind === 'not-found') return null; throw error }
  },
  async saveSettings(cardId: UUID, payload: CardSettingsDto) { requireFeature('cards'); return (await apiClient.put<CardSettingsDto>(`/cards/${cardId}/settings`, payload)).data },
  async schedules(cardId: UUID) { requireFeature('cards'); return (await apiClient.get<CardSchedule[]>(`/cards/${cardId}/schedules`)).data },
  async createSchedule(cardId: UUID, payload: CardScheduleCreateDto) { requireFeature('cards'); return (await apiClient.post<CardSchedule>(`/cards/${cardId}/schedules`, payload)).data },
  async updateSchedule(cardId: UUID, scheduleId: UUID, payload: CardScheduleUpdateDto) {
    requireFeature('cards')
    return (await apiClient.patch<CardSchedule>(`/cards/${cardId}/schedules/${scheduleId}`, payload)).data
  },
  async statements(cardId: UUID) { requireFeature('cards'); return (await apiClient.get<CardStatementGroup[]>(`/cards/${cardId}/statements`)).data },
  async confirmStatement(cardId: UUID, payload: CardStatementConfirmDto) { requireFeature('cards'); return (await apiClient.post<CardStatement>(`/cards/${cardId}/statements`, payload)).data },
  /** Links an existing repayment event to a schedule; the server releases the matching reserve once. */
  async linkPayment(cardId: UUID, scheduleId: UUID, payload: PaymentAllocationDto) {
    requireFeature('cards')
    return (await apiClient.post<CardSchedule>(`/cards/${cardId}/schedules/${scheduleId}/payments`, payload)).data
  },
  async linkRefund(cardId: UUID, scheduleId: UUID, payload: RefundAllocationDto) {
    requireFeature('cards')
    return (await apiClient.post<CardSchedule>(`/cards/${cardId}/schedules/${scheduleId}/refunds`, payload)).data
  },
  /** Earmarks existing cash for a schedule. No bank money moves. */
  async fundReserve(cardId: UUID, scheduleId: UUID, payload: ReserveDto) {
    requireFeature('cards')
    return (await apiClient.post<CardSchedule>(`/cards/${cardId}/schedules/${scheduleId}/reserve`, payload)).data
  },
}
