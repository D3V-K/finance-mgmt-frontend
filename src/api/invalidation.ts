import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { ledgerKeys as k } from '@/api/queryKeys'

// Legacy families keep their original prefixes so deployed screens are unchanged.
const legacy = {
  transactions: ['transactions'],
  transfers: ['transfers'],
  openingBalances: ['opening-balances'],
  categories: ['categories'],
  reports: ['reports'],
  balance: ['reports', 'balance'],
  netBalance: ['reports', 'net-worth'],
} satisfies Record<string, QueryKey>

/** Everything derived from account balances or reserved cash. */
const cashViews = [k.accounts.all, k.allocations.all, k.availableCash.all, k.forecast.all, k.dashboard.all, k.position.all, k.reconciliations.all, k.quality.all]

export type LedgerMutation =
  | 'purchase' | 'income' | 'refund' | 'correction' | 'repayment' | 'transfer' | 'adjustment'
  | 'account' | 'opening' | 'settings' | 'cutover'
  | 'category'
  | 'card-settings' | 'card-schedule' | 'card-reserve'
  | 'budget' | 'goal' | 'bucket' | 'expected-flow'
  | 'valuation' | 'reconciliation'
  | 'legacy-transaction' | 'legacy-transfer' | 'legacy-opening'

/**
 * Which query families must refetch after each successful write. Screens always
 * refetch confirmed server results instead of patching balances optimistically.
 */
export const invalidationMatrix: Record<LedgerMutation, readonly QueryKey[]> = {
  // Spending events consume budget and change debt or cash on their account.
  purchase: [k.events.all, k.budgets.all, k.cards.all, k.canonicalReports.all, k.entryOptions.all, ...cashViews],
  refund: [k.events.all, k.budgets.all, k.cards.all, k.canonicalReports.all, ...cashViews],
  correction: [k.events.all, k.budgets.all, k.cards.all, k.canonicalReports.all, k.expectedFlows.all, ...cashViews],
  income: [k.events.all, k.canonicalReports.all, k.expectedFlows.all, ...cashViews],
  // Repayments and transfers move money between accounts; they are never spending.
  repayment: [k.events.all, k.cards.all, k.expectedFlows.all, ...cashViews],
  transfer: [k.events.all, k.expectedFlows.all, ...cashViews],
  adjustment: [k.events.all, ...cashViews],
  account: [k.entryOptions.all, k.settings.all, k.cutover.all, k.cards.all, k.valuations.all, ...cashViews],
  opening: [k.cutover.all, k.cards.all, ...cashViews],
  settings: [k.settings.all, k.entryOptions.all, k.budgets.all, ...cashViews],
  cutover: [k.cutover.all, k.events.all, k.entryOptions.all, k.cards.all, k.budgets.all, k.canonicalReports.all, ...cashViews],
  category: [legacy.categories, legacy.transactions, legacy.reports, k.entryOptions.all, k.events.all, k.budgets.all, k.canonicalReports.all],
  'card-settings': [k.cards.all, k.forecast.all, k.availableCash.all, k.dashboard.all, k.quality.all],
  'card-schedule': [k.cards.all, k.forecast.all, k.availableCash.all, k.dashboard.all, k.quality.all],
  'card-reserve': [k.cards.all, k.allocations.all, k.availableCash.all, k.dashboard.all, k.quality.all],
  budget: [k.budgets.all, k.availableCash.all, k.forecast.all, k.dashboard.all],
  goal: [k.goals.all, k.allocations.all, k.dashboard.all],
  bucket: [k.allocations.all, k.goals.all, k.availableCash.all, k.dashboard.all],
  'expected-flow': [k.expectedFlows.all, k.forecast.all, k.availableCash.all, k.dashboard.all],
  valuation: [k.valuations.all, k.position.all, k.dashboard.all, k.quality.all],
  reconciliation: [k.reconciliations.all, k.quality.all, k.dashboard.all],
  // Legacy writes keep their original refresh scope, plus cutover status for migration.
  'legacy-transaction': [legacy.transactions, legacy.reports, k.cutover.all, k.quality.all],
  'legacy-transfer': [legacy.transfers, legacy.balance, legacy.netBalance, k.cutover.all, k.quality.all],
  'legacy-opening': [legacy.openingBalances, legacy.balance, legacy.netBalance],
}

export function invalidateFor(client: QueryClient, mutation: LedgerMutation) {
  return Promise.all(invalidationMatrix[mutation].map((queryKey) => client.invalidateQueries({ queryKey })))
}
