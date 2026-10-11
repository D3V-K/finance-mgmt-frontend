import type { FinancialEventFilter, ForecastScenario, ISODate, UUID } from '@/api/types'

// Every parameter that changes the server's answer is part of its key: account,
// as-of date, cycle, horizon and scenario. Identity is handled by clearing the
// whole cache whenever the signed-in user changes (see AuthContext).
export const ledgerKeys = {
  accounts: {
    all: ['accounts'] as const,
    list: (includeArchived: boolean) => ['accounts', 'list', { includeArchived }] as const,
    detail: (id: UUID) => ['accounts', 'detail', id] as const,
    opening: (id: UUID) => ['accounts', 'opening', id] as const,
    revisions: (id: UUID) => ['accounts', 'revisions', id] as const,
    balance: (id: UUID, asOf: ISODate) => ['accounts', 'balance', id, asOf] as const,
  },
  entryOptions: { all: ['entry-options'] as const },
  settings: { all: ['finance-settings'] as const },
  events: {
    all: ['financial-events'] as const,
    list: (filters: FinancialEventFilter) => ['financial-events', 'list', filters] as const,
    detail: (id: UUID) => ['financial-events', 'detail', id] as const,
  },
  cutover: {
    all: ['ledger-cutover'] as const,
    unresolved: () => ['ledger-cutover', 'unresolved'] as const,
  },
  cards: {
    all: ['cards'] as const,
    settings: (cardId: UUID) => ['cards', 'settings', cardId] as const,
    schedules: (cardId: UUID) => ['cards', 'schedules', cardId] as const,
    statements: (cardId: UUID) => ['cards', 'statements', cardId] as const,
  },
  budgets: {
    all: ['budgets'] as const,
    cycle: (on: ISODate) => ['budgets', 'cycle', on] as const,
  },
  goals: { all: ['savings-goals'] as const },
  allocations: {
    all: ['allocations'] as const,
    summary: (asOf: ISODate) => ['allocations', 'summary', asOf] as const,
  },
  expectedFlows: { all: ['expected-cash-flows'] as const },
  forecast: {
    all: ['cash-forecast'] as const,
    range: (from: ISODate, to: ISODate, scenario: ForecastScenario) => ['cash-forecast', from, to, scenario] as const,
  },
  availableCash: {
    all: ['available-cash'] as const,
    range: (asOf: ISODate, horizon: ISODate) => ['available-cash', asOf, horizon] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    asOf: (asOf: ISODate | null) => ['dashboard', asOf ?? 'today'] as const,
  },
  position: {
    all: ['financial-position'] as const,
    asOf: (asOf: ISODate) => ['financial-position', 'as-of', asOf] as const,
    series: (from: ISODate, to: ISODate) => ['financial-position', 'series', from, to] as const,
  },
  valuations: {
    all: ['valuations'] as const,
    list: (accountId: UUID) => ['valuations', accountId] as const,
  },
  canonicalReports: {
    all: ['canonical-reports'] as const,
    monthly: (from?: ISODate, to?: ISODate) => ['canonical-reports', 'monthly', { from, to }] as const,
    byCategory: (from?: ISODate, to?: ISODate) => ['canonical-reports', 'by-category', { from, to }] as const,
  },
  reconciliations: {
    all: ['reconciliations'] as const,
    detail: (id: UUID) => ['reconciliations', 'detail', id] as const,
    statement: (accountId: UUID, from: ISODate, to: ISODate) => ['reconciliations', 'statement', accountId, from, to] as const,
  },
  quality: { all: ['ledger-quality'] as const },
}
