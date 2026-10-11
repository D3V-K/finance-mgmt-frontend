import { useMemo } from 'react'
import { useAccounts } from '@/api/hooks/accounts'
import { useCategories } from '@/api/hooks/categories'

/** Names for history, including archived accounts and categories, so old rows keep their labels. */
export function useLedgerLookups() {
  const accounts = useAccounts(true)
  const categories = useCategories(true)
  const accountMap = useMemo(() => new Map((accounts.data ?? []).map((account) => [account.id, account])), [accounts.data])
  const categoryMap = useMemo(() => new Map((categories.data ?? []).map((category) => [category.id, category])), [categories.data])
  return { accounts, categories, accountMap, categoryMap, isLoading: accounts.isLoading || categories.isLoading }
}
