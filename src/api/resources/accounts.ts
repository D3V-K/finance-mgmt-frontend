import { apiClient } from '@/api/client'
import type { Account, AccountCreateDto, AccountOpening, AccountOpeningRevision, AccountOpeningUpsertDto, AccountUpdateDto, EntryOptions, FinanceSettings, FinanceSettingsDto, ISODate, NamedAccountBalance, PaydayOverrideDto, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

export const accountsApi = {
  async list(includeArchived = false) {
    requireFeature('accounts')
    return (await apiClient.get<Account[]>('/accounts', { params: includeArchived ? { include_archived: true } : {} })).data
  },
  async get(id: UUID) { requireFeature('accounts'); return (await apiClient.get<Account>(`/accounts/${id}`)).data },
  async create(payload: AccountCreateDto) { requireFeature('accounts'); return (await apiClient.post<Account>('/accounts', { currency: 'JPY', ...payload })).data },
  async update(id: UUID, payload: AccountUpdateDto) { requireFeature('accounts'); return (await apiClient.patch<Account>(`/accounts/${id}`, payload)).data },
  /** Resolves null when the server reports that no opening has been set (404), so "unset" never reads as zero. */
  async opening(id: UUID) {
    requireFeature('accounts')
    try { return (await apiClient.get<AccountOpening>(`/accounts/${id}/opening-balance`)).data }
    catch (error) { if ((error as { kind?: string }).kind === 'not-found') return null; throw error }
  },
  async setOpening(id: UUID, payload: AccountOpeningUpsertDto) {
    requireFeature('accounts')
    return (await apiClient.put<AccountOpening>(`/accounts/${id}/opening-balance`, payload)).data
  },
  async openingRevisions(id: UUID) { requireFeature('accounts'); return (await apiClient.get<AccountOpeningRevision[]>(`/accounts/${id}/opening-revisions`)).data },
  async balance(id: UUID, asOfDate: ISODate) {
    requireFeature('accounts')
    return (await apiClient.get<NamedAccountBalance>(`/accounts/${id}/balance`, { params: { as_of_date: asOfDate } })).data
  },
}

export const financeSettingsApi = {
  async get() { requireFeature('accounts'); return (await apiClient.get<FinanceSettings>('/finance-settings')).data },
  async update(payload: FinanceSettingsDto) { requireFeature('accounts'); return (await apiClient.put<FinanceSettings>('/finance-settings', { currency: 'JPY', ...payload })).data },
  async setPaydayOverride(payload: PaydayOverrideDto) {
    requireFeature('budgets')
    return (await apiClient.put<PaydayOverrideDto>('/finance-settings/payday-overrides', payload)).data
  },
}

export const entryOptionsApi = {
  async get() { requireFeature('accounts'); return (await apiClient.get<EntryOptions>('/entry-options')).data },
}
