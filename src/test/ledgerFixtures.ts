import { http, HttpResponse } from 'msw'
import type { Account, AvailableCash, BudgetCycleSummary, CardSchedule, CashForecast, Dashboard, EntryOptions, FinancialEvent, FinancialPosition, LedgerQuality } from '@/api/types'

// Synthetic figures only; none of these represent a real person's finances.
const stamp = '2026-09-01T00:00:00'
const account = (id: string, name: string, kind: Account['kind']): Account => ({ id, user_id: 'test-user', name, kind, currency: 'JPY', archived_at: null, created_at: stamp, updated_at: stamp })

export const ledgerFixtures = {
  bank: account('acct-bank', 'Everyday Bank', 'BANK'),
  cash: account('acct-cash', 'Wallet', 'CASH'),
  card: account('acct-card', 'Rewards Card', 'CREDIT_CARD'),
  brokerage: account('acct-broker', 'Brokerage', 'BROKERAGE_CASH'),
}
export const ledgerAccounts = [ledgerFixtures.bank, ledgerFixtures.cash, ledgerFixtures.card, ledgerFixtures.brokerage]

export const entryOptionsFixture: EntryOptions = {
  local_today: '2026-09-10', timezone: 'Asia/Tokyo', currency: 'JPY', default_account_id: ledgerFixtures.card.id,
  accounts: ledgerAccounts.map(({ id, name, kind }) => ({ id, name, kind })),
  categories: [{ id: 'category-1', name: 'Groceries', type: 'expense' }, { id: 'category-salary', name: 'Salary', type: 'income' }],
  recent_category_ids: ['category-1'],
}

export function eventFixture(overrides: Partial<FinancialEvent> = {}): FinancialEvent {
  return {
    id: 'event-1', user_id: 'test-user', kind: 'EXPENSE', amount: 6000, currency: 'JPY', category_id: 'category-1', description: 'Groceries',
    occurred_on: '2026-09-10', date_basis: 'known', recorded_at: '2026-09-10T09:00:00', original_event_id: null, reverses_event_id: null,
    replaces_event_id: null, is_reversal: false, postings: [{ account_id: ledgerFixtures.card.id, delta: -6000, effective_date: '2026-09-10' }], ...overrides,
  }
}

export const budgetCycleFixture: BudgetCycleSummary = {
  start: '2026-08-25', end_exclusive: '2026-09-25', currency: 'JPY',
  budgets: [{ category_id: 'category-1', category_name: 'Groceries', planned: 40000, gross_spending: 6000, refunds: 0, net_spending: 6000, remaining: 34000 }],
  unknown_purchase_date_count: 0, coverage: 'known_dates_only',
}

export const scheduleFixture: CardSchedule = {
  id: 'schedule-1', card_id: ledgerFixtures.card.id, purchase_event_id: 'event-1', opening_obligation: null, statement_id: null, due_date: '2026-10-27',
  principal_due: 6000, paid: 0, refunded: 0, outstanding: 6000, source: 'estimate', status: 'planned', funded_reserve: 0, unfunded: 6000,
}

export const availableCashFixture: AvailableCash = {
  as_of_date: '2026-09-10', horizon: '2026-09-25', currency: 'JPY',
  accounts: [{ account_id: ledgerFixtures.bank.id, liquid_balance: 100000, funded_earmarks: 20000, unfunded_known_due: 6000, raw_available: 74000, spendable: 74000, reserve_shortfall: 6000, coverage: 'complete' }],
  remaining_discretionary_budget: 34000, discretionary_budget_basis: 'active_payday_cycle_less_actual_and_linked_bills', coverage: 'complete', warnings: [],
}

export const forecastFixture: CashForecast = {
  from: '2026-09-10', to: '2026-09-12', currency: 'JPY', scenario: 'baseline', coverage: 'partial_assumptions', warnings: [],
  assumptions: ['Same-day clearing order is unknown'],
  lowest_by_account: { [ledgerFixtures.bank.id]: { balance: 94000, date: '2026-09-11' } },
  days: [
    { account_id: ledgerFixtures.bank.id, date: '2026-09-10', start_balance: 100000, end_balance: 100000, movements: [], intraday_order_uncertain: false, shortfall: false, coverage: 'complete' },
    { account_id: ledgerFixtures.bank.id, date: '2026-09-11', start_balance: 100000, end_balance: 94000, movements: [{ amount: -6000, source: 'card_schedule', label: 'Card payment', certainty: 'estimate', id: 'schedule-1' }], intraday_order_uncertain: false, shortfall: false, coverage: 'complete' },
  ],
}

export const positionFixture: FinancialPosition = {
  as_of_date: '2026-09-10', currency: 'JPY', liquid_cash: 100000, brokerage_cash: 10000, securities_value: 50000, signed_card_balances: -20000, net_worth: 140000,
  coverage: 'complete', cumulative_contributions: 60000, cumulative_withdrawals: 0, user_entered_realized_gain: 0, investment_return: null, valuation_change: null,
  valuation_change_basis: 'latest_vs_previous_securities_snapshot_not_investment_return', assumptions: ['Securities-only manual values exclude brokerage cash'],
  accounts: [
    { account_id: ledgerFixtures.bank.id, name: 'Everyday Bank', kind: 'BANK', balance: 100000, status: 'complete', securities: null },
    { account_id: ledgerFixtures.brokerage.id, name: 'Brokerage', kind: 'BROKERAGE_CASH', balance: 10000, status: 'complete', securities: { value: 50000, as_of_date: '2026-09-01', scope: 'securities_only', status: 'recorded' } },
    { account_id: ledgerFixtures.card.id, name: 'Rewards Card', kind: 'CREDIT_CARD', balance: -20000, status: 'complete', securities: null },
  ],
}

export const qualityFixture: LedgerQuality = {
  unknown_purchase_dates: 0, unresolved_legacy_records: 0, missing_openings: [], stale_or_missing_valuations: [], unreconciled_sessions: [],
  accounts_without_confirmed_statement: [], reserve_shortfall: 0, schedule_debt_mismatch: [], balance_adjustments: 0,
}

export const dashboardFixture: Dashboard = {
  as_of_date: '2026-09-10', currency: 'JPY', basis: 'canonical_accounts_only', cycle: { start: '2026-08-25', end_exclusive: '2026-09-25' },
  cash_by_account: availableCashFixture.accounts, available_cash: availableCashFixture, living_budget: budgetCycleFixture,
  upcoming_withdrawals: [{ account_id: ledgerFixtures.bank.id, date: '2026-09-11', amount: -6000, source: 'card_schedule', label: 'Card payment', certainty: 'estimate', id: 'schedule-1' }],
  lowest_projected_balance_by_account: forecastFixture.lowest_by_account, forecast_assumptions: forecastFixture.assumptions, forecast_coverage: 'partial_assumptions',
  buckets: [{ id: 'bucket-1', name: 'Emergency fund', target: 300000, funded: 20000, shortfall: 280000, goal_id: 'goal-1' }],
  reserve_funding_shortfall: 6000, financial_position: positionFixture, data_quality: qualityFixture, warnings: [],
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 20 })

export const ledgerHandlers = [
  http.get('*/accounts', () => HttpResponse.json(ledgerAccounts)),
  http.post('*/accounts', async ({ request }) => HttpResponse.json({ ...account('acct-new', 'New account', 'BANK'), ...await request.json() as object }, { status: 201 })),
  http.patch('*/accounts/:id', async ({ params, request }) => HttpResponse.json({ ...ledgerAccounts.find((item) => item.id === params.id) ?? ledgerFixtures.bank, ...await request.json() as object })),
  http.get('*/accounts/:id/opening-balance', () => HttpResponse.json({ detail: 'Opening balance not set' }, { status: 404 })),
  http.put('*/accounts/:id/opening-balance', async ({ params, request }) => HttpResponse.json({ id: `opening-${params.id}`, account_id: params.id, revision: 1, updated_at: stamp, ...await request.json() as object })),
  http.get('*/accounts/:id/opening-revisions', () => HttpResponse.json([])),
  http.get('*/accounts/:id/balance', ({ params, request }) => {
    const found = ledgerAccounts.find((item) => item.id === params.id) ?? ledgerFixtures.bank
    return HttpResponse.json({ account: found, as_of_date: new URL(request.url).searchParams.get('as_of_date'), balance: null, status: 'unavailable', opening_as_of_date: null })
  }),
  http.get('*/entry-options', () => HttpResponse.json(entryOptionsFixture)),
  http.get('*/finance-settings', () => HttpResponse.json({ timezone: 'Asia/Tokyo', currency: 'JPY', payday_day: 25, default_account_id: ledgerFixtures.card.id })),
  http.put('*/finance-settings', async ({ request }) => HttpResponse.json(await request.json())),
  http.get('*/financial-events', () => HttpResponse.json(page([eventFixture()]))),
  http.post('*/financial-events', async ({ request }) => {
    const body = await request.json() as Partial<FinancialEvent> & { account_id?: string; amount: number }
    return HttpResponse.json(eventFixture({ ...body, id: 'event-new', postings: [{ account_id: body.account_id ?? ledgerFixtures.card.id, delta: -body.amount, effective_date: body.occurred_on ?? '2026-09-10' }] }), { status: 201 })
  }),
  http.post('*/financial-events/:id/reverse', ({ params }) => HttpResponse.json(eventFixture({ id: 'event-reversal', reverses_event_id: String(params.id), is_reversal: true, description: 'Reversal' }), { status: 201 })),
  http.post('*/financial-events/:id/replace', async ({ params, request }) => HttpResponse.json(eventFixture({ ...await request.json() as object, id: 'event-replacement', replaces_event_id: String(params.id) }), { status: 201 })),
  http.get('*/reports/canonical-monthly', () => HttpResponse.json([{ month: '2026-09-01', income: 300000, gross_spending: 6000, refunds: 0, net_spending: 6000, date_basis: 'known_only' }])),
  http.get('*/reports/canonical-by-category', () => HttpResponse.json([{ category_id: 'category-1', category_name: 'Groceries', gross_spending: 6000, refunds: 0, net_spending: 6000, date_basis: 'known_only' }])),
  http.get('*/ledger-cutovers/unresolved', () => HttpResponse.json({ detail: 'Confirm cutover first' }, { status: 404 })),
  http.get('*/cards/:id/settings', ({ params }) => HttpResponse.json({ card_id: params.id, settlement_account_id: ledgerFixtures.bank.id, closing_day: 15, payment_day: 27 })),
  http.get('*/cards/:id/schedules', () => HttpResponse.json([scheduleFixture])),
  http.get('*/cards/:id/statements', () => HttpResponse.json([{ due_date: scheduleFixture.due_date, principal_due: 6000, outstanding: 6000, funded_reserve: 0, schedule_ids: [scheduleFixture.id], source: 'estimate', statement_id: null, closing_on: null }])),
  http.get('*/budget-cycles/:on/summary', () => HttpResponse.json(budgetCycleFixture)),
  http.get('*/savings-goals', () => HttpResponse.json([{ id: 'goal-1', name: 'Emergency fund', target: 300000, target_date: null }])),
  http.get('*/allocations', ({ request }) => HttpResponse.json({ currency: 'JPY', as_of_date: new URL(request.url).searchParams.get('as_of_date'), accounts: [{ account_id: ledgerFixtures.bank.id, balance: 100000, funded: 20000, allocatable: 80000, underfunded: false, status: 'complete' }], buckets: dashboardFixture.buckets })),
  http.get('*/expected-cash-flows', () => HttpResponse.json([])),
  http.get('*/reports/cash-forecast', () => HttpResponse.json(forecastFixture)),
  http.get('*/reports/available-cash', () => HttpResponse.json(availableCashFixture)),
  http.get('*/dashboard', () => HttpResponse.json(dashboardFixture)),
  http.get('*/investments/:id/valuations', () => HttpResponse.json([{ id: 'valuation-1', as_of_date: '2026-09-01', market_value: 50000, scope: 'securities_only', source: 'manual' }])),
  http.get('*/reports/financial-position', () => HttpResponse.json(positionFixture)),
  http.get('*/reports/financial-position/series', () => HttpResponse.json([positionFixture])),
  http.get('*/ledger-quality', () => HttpResponse.json(qualityFixture)),
]
