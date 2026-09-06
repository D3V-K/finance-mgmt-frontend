import { apiClient } from '@/api/client'
import type { CurrentBalance } from '@/api/types'
export const balanceApi = { async current() { return (await apiClient.get<CurrentBalance>('/reports/balance')).data } }
