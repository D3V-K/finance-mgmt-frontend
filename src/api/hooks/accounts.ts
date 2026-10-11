import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { accountsApi, entryOptionsApi, financeSettingsApi } from '@/api/resources/accounts'
import type { AccountCreateDto, AccountOpeningUpsertDto, AccountUpdateDto, FinanceSettingsDto, ISODate, PaydayOverrideDto, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

export function useAccounts(includeArchived = false) {
  return useQuery({ queryKey: ledgerKeys.accounts.list(includeArchived), queryFn: () => accountsApi.list(includeArchived), enabled: isFeatureEnabled('accounts') })
}

export function useAccountOpening(id: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.accounts.opening(id ?? ''), queryFn: () => accountsApi.opening(id!), enabled: isFeatureEnabled('accounts') && Boolean(id) })
}

export function useAccountOpeningRevisions(id: UUID | undefined) {
  return useQuery({ queryKey: ledgerKeys.accounts.revisions(id ?? ''), queryFn: () => accountsApi.openingRevisions(id!), enabled: isFeatureEnabled('accounts') && Boolean(id) })
}

export function useAccountBalance(id: UUID | undefined, asOf: ISODate | undefined) {
  return useQuery({ queryKey: ledgerKeys.accounts.balance(id ?? '', asOf ?? ''), queryFn: () => accountsApi.balance(id!, asOf!), enabled: isFeatureEnabled('accounts') && Boolean(id && asOf) })
}

export function useEntryOptions() {
  return useQuery({ queryKey: ledgerKeys.entryOptions.all, queryFn: entryOptionsApi.get, enabled: isFeatureEnabled('accounts') })
}

export function useFinanceSettings() {
  return useQuery({ queryKey: ledgerKeys.settings.all, queryFn: financeSettingsApi.get, enabled: isFeatureEnabled('accounts') })
}

export function useCreateAccount() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: AccountCreateDto) => accountsApi.create(payload), onSuccess: () => invalidateFor(client, 'account') })
}

export function useUpdateAccount() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: AccountUpdateDto }) => accountsApi.update(id, payload), onSuccess: () => invalidateFor(client, 'account') })
}

export function useSetAccountOpening() {
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, payload }: { id: UUID; payload: AccountOpeningUpsertDto }) => accountsApi.setOpening(id, payload), onSuccess: () => invalidateFor(client, 'opening') })
}

export function useSaveFinanceSettings() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: FinanceSettingsDto) => financeSettingsApi.update(payload), onSuccess: () => invalidateFor(client, 'settings') })
}

export function useSetPaydayOverride() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: PaydayOverrideDto) => financeSettingsApi.setPaydayOverride(payload), onSuccess: () => invalidateFor(client, 'settings') })
}
