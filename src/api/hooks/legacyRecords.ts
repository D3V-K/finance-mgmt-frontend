import { useQuery } from '@tanstack/react-query'
import { transactionsApi } from '@/api/resources/transactions'
import { transfersApi } from '@/api/resources/transfers'
import type { ISODate, PaginatedResponse } from '@/api/types'

const PAGE_SIZE = 100

async function allPages<T>(load: (page: number) => Promise<PaginatedResponse<T>>) {
  const first = await load(1)
  const items = [...first.items]
  for (let page = 2; page <= first.total_pages; page += 1) items.push(...(await load(page)).items)
  return items
}

/**
 * Every legacy Cash/Bank record dated on or after a cutover date. Migration
 * mapping needs the complete set, so this walks all pages instead of trusting
 * one page of results.
 */
export function useLegacyRecordsSince(from: ISODate | undefined) {
  return useQuery({
    // Legacy prefixes keep these fresh when legacy records change.
    queryKey: ['transactions', 'since', from],
    enabled: Boolean(from),
    queryFn: async () => {
      const [transactions, transfers] = await Promise.all([
        allPages((page) => transactionsApi.list({ from, page, page_size: PAGE_SIZE })),
        allPages((page) => transfersApi.list({ from, page, page_size: PAGE_SIZE })),
      ])
      return { transactions, transfers }
    },
  })
}
