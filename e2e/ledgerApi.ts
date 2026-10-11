import type { Page, Route } from '@playwright/test'

// A small in-memory stand-in for the ledger backend. It only implements the
// arithmetic needed to show that screens display server answers: balances are
// opening + postings, nothing more. All figures used in specs are synthetic.
type Json = Record<string, unknown>
type Account = { id: string; name: string; kind: string; currency: 'JPY'; archived_at: string | null; user_id: string; created_at: string; updated_at: string }
type Posting = { id: string; account_id: string; delta: number; effective_date: string }
type Event = Json & { id: string; kind: string; amount: number; postings: Posting[]; idempotency_key?: string }

export function createLedgerState() {
  return {
    today: '2026-09-10',
    accounts: [] as Account[],
    openings: {} as Record<string, { amount: number; as_of_date: string; revision: number }>,
    events: [] as Event[],
    settings: { timezone: 'Asia/Tokyo', currency: 'JPY', payday_day: 25, default_account_id: null as string | null },
    categories: [
      { id: 'cat-groceries', user_id: 'e2e-user', name: 'Groceries', type: 'expense', color: '#e11d48', parent_id: null, created_at: '2026-08-01T00:00:00', archived_at: null, children: [] },
      { id: 'cat-salary', user_id: 'e2e-user', name: 'Salary', type: 'income', color: '#059669', parent_id: null, created_at: '2026-08-01T00:00:00', archived_at: null, children: [] },
    ],
    legacyTransactions: [] as Array<Json & { id: string; transaction_date: string; amount: number; category_id: string }>,
    legacyTransfers: [] as Array<Json & { id: string; transfer_date: string; amount: number }>,
    cutover: null as null | { as_of_date: string; unresolved: Array<{ source_table: string; source_id: string; recorded_date: string; amount: number; category_id: string | null }>; request: string },
    counter: 0,
  }
}
export type LedgerState = ReturnType<typeof createLedgerState>

const nextId = (state: LedgerState, prefix: string) => `${prefix}-${++state.counter}`

export function balanceOf(state: LedgerState, accountId: string, asOf: string) {
  const opening = state.openings[accountId]
  if (!opening || asOf < opening.as_of_date) return null
  return opening.amount + state.events.flatMap((event) => event.postings).filter((posting) => posting.account_id === accountId && posting.effective_date >= opening.as_of_date && posting.effective_date <= asOf).reduce((sum, posting) => sum + posting.delta, 0)
}

type Handler = (route: Route, context: { state: LedgerState; path: string; method: string; body: Json; query: URLSearchParams }) => Promise<void> | void
const handlers: Array<[string, RegExp, Handler]> = []
export function on(method: string, pattern: RegExp, handler: Handler) { handlers.push([method, pattern, handler]) }

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body })

on('GET', /^\/accounts$/, (route, { state, query }) => json(route, state.accounts.filter((account) => query.get('include_archived') === 'true' || !account.archived_at)))
on('POST', /^\/accounts$/, (route, { state, body }) => {
  const account: Account = { id: nextId(state, 'acct'), user_id: 'e2e-user', name: String(body.name), kind: String(body.kind), currency: 'JPY', archived_at: null, created_at: '2026-09-10T00:00:00', updated_at: '2026-09-10T00:00:00' }
  state.accounts.push(account)
  return json(route, account, 201)
})
on('PATCH', /^\/accounts\/([^/]+)$/, (route, { state, path, body }) => {
  const account = state.accounts.find((item) => item.id === path.split('/')[2])!
  if (typeof body.name === 'string') account.name = body.name
  if (typeof body.archived === 'boolean') account.archived_at = body.archived ? '2026-09-10T00:00:00' : null
  return json(route, account)
})
on('GET', /^\/accounts\/[^/]+\/opening-balance$/, (route, { state, path }) => {
  const id = path.split('/')[2]
  const opening = state.openings[id]
  return opening ? json(route, { id: `opening-${id}`, account_id: id, ...opening, updated_at: '2026-09-10T00:00:00' }) : json(route, { detail: 'Opening balance not set' }, 404)
})
on('PUT', /^\/accounts\/[^/]+\/opening-balance$/, (route, { state, path, body }) => {
  const id = path.split('/')[2]
  state.openings[id] = { amount: Number(body.amount), as_of_date: String(body.as_of_date), revision: (state.openings[id]?.revision ?? 0) + 1 }
  return json(route, { id: `opening-${id}`, account_id: id, ...state.openings[id], updated_at: '2026-09-10T00:00:00' })
})
on('GET', /^\/accounts\/[^/]+\/opening-revisions$/, (route) => json(route, []))
on('GET', /^\/accounts\/[^/]+\/balance$/, (route, { state, path, query }) => {
  const account = state.accounts.find((item) => item.id === path.split('/')[2])!
  const asOf = query.get('as_of_date')!
  const balance = balanceOf(state, account.id, asOf)
  const card = account.kind === 'CREDIT_CARD' && balance !== null ? { amount_owed: Math.max(0, -balance), credit_balance: Math.max(0, balance) } : {}
  return json(route, { account, as_of_date: asOf, balance, status: balance === null ? 'unavailable' : 'complete', opening_as_of_date: state.openings[account.id]?.as_of_date ?? null, ...card })
})
on('GET', /^\/finance-settings$/, (route, { state }) => json(route, state.settings))
on('PUT', /^\/finance-settings$/, (route, { state, body }) => { Object.assign(state.settings, body); return json(route, state.settings) })
on('GET', /^\/entry-options$/, (route, { state }) => json(route, {
  local_today: state.today, timezone: state.settings.timezone, currency: 'JPY', default_account_id: state.settings.default_account_id,
  accounts: state.accounts.filter((account) => !account.archived_at).map(({ id, name, kind }) => ({ id, name, kind })),
  categories: state.categories.filter((category) => !category.archived_at).map(({ id, name, type }) => ({ id, name, type })), recent_category_ids: [],
}))
on('GET', /^\/ledger-cutovers\/unresolved$/, (route, { state }) => state.cutover
  ? json(route, { as_of_date: state.cutover.as_of_date, count: state.cutover.unresolved.length, records: state.cutover.unresolved })
  : json(route, { detail: 'Confirm cutover first' }, 404))
function cutoverReport(state: LedgerState, body: Json) {
  const asOf = String(body.as_of_date)
  const mapped = new Set([...(body.transactions as Json[] ?? []).map((row) => row.transaction_id), ...(body.transfers as Json[] ?? []).map((row) => row.transfer_id)])
  const unresolvedTx = state.legacyTransactions.filter((row) => row.transaction_date >= asOf && !mapped.has(row.id))
  const unresolvedTransfers = state.legacyTransfers.filter((row) => row.transfer_date >= asOf && !mapped.has(row.id))
  const sums: Record<string, number> = {}
  for (const row of state.legacyTransactions) sums[row.category_id] = (sums[row.category_id] ?? 0) + row.amount
  return {
    as_of_date: asOf, legacy_transaction_count: state.legacyTransactions.length, legacy_transfer_count: state.legacyTransfers.length, category_sums: sums,
    legacy_date_min: state.legacyTransactions[0]?.transaction_date ?? null, legacy_date_max: state.legacyTransactions.at(-1)?.transaction_date ?? null,
    unresolved_transaction_ids: unresolvedTx.map((row) => row.id), unresolved_transfer_ids: unresolvedTransfers.map((row) => row.id),
    unresolved_count: unresolvedTx.length + unresolvedTransfers.length, mapped_count: mapped.size,
    opening_total: (body.openings as Json[]).reduce((sum, row) => sum + Number(row.amount), 0), legacy_account_type_is_unverified: true, purchase_date_basis: 'unknown_unless_confirmed',
    unresolved: [...unresolvedTx.map((row) => ({ source_table: 'transactions', source_id: row.id, recorded_date: row.transaction_date, amount: row.amount, category_id: row.category_id })), ...unresolvedTransfers.map((row) => ({ source_table: 'transfers', source_id: row.id, recorded_date: row.transfer_date, amount: row.amount, category_id: null }))],
  }
}
on('POST', /^\/ledger-cutovers\/preview$/, (route, { state, body }) => { const report: Partial<ReturnType<typeof cutoverReport>> = cutoverReport(state, body); delete report.unresolved; return json(route, report) })
on('POST', /^\/ledger-cutovers\/confirm$/, (route, { state, body }) => {
  const request = JSON.stringify(body)
  if (state.cutover) return state.cutover.request === request ? json(route, { id: 'cutover-1', as_of_date: state.cutover.as_of_date, unresolved_count: state.cutover.unresolved.length, status: 'confirmed' }) : json(route, { detail: 'Cutover already confirmed with different data' }, 409)
  const report = cutoverReport(state, body)
  for (const opening of body.openings as Json[]) state.openings[String(opening.account_id)] = { amount: Number(opening.amount), as_of_date: report.as_of_date, revision: 1 }
  for (const mapping of body.transactions as Json[] ?? []) {
    const row = state.legacyTransactions.find((item) => item.id === mapping.transaction_id)!
    const income = state.categories.find((category) => category.id === row.category_id)?.type === 'income'
    state.events.push({ id: nextId(state, 'event'), kind: income ? 'INCOME' : 'EXPENSE', amount: row.amount, category_id: row.category_id, occurred_on: mapping.occurred_on ?? null, date_basis: mapping.occurred_on ? 'confirmed_purchase_date' : 'legacy_recorded_date', postings: [{ id: nextId(state, 'posting'), account_id: String(mapping.account_id), delta: income ? row.amount : -row.amount, effective_date: String(mapping.effective_date) }] })
  }
  state.cutover = { as_of_date: report.as_of_date, unresolved: report.unresolved, request }
  return json(route, { id: 'cutover-1', as_of_date: report.as_of_date, unresolved_count: report.unresolved.length, status: 'confirmed' })
})
on('GET', /^\/categories(\/tree)?$/, (route, { state, path }) => json(route, path.endsWith('tree') ? state.categories : { items: state.categories, total: state.categories.length, page: 1, page_size: 100, total_pages: 1 }))

const LIQUID = ['CASH', 'BANK', 'BROKERAGE_CASH']
on('POST', /^\/financial-events$/, (route, { state, body }) => {
  const existing = state.events.find((event) => body.idempotency_key && event.idempotency_key === body.idempotency_key)
  if (existing) return json(route, existing, 201)
  const kind = String(body.kind)
  const amount = Number(body.amount)
  const occurred = (body.occurred_on as string | null) ?? state.today
  const effective = (body.effective_date as string | null) ?? occurred
  const source = state.accounts.find((account) => account.id === body.account_id)!
  if (kind === 'CARD_REPAYMENT' && !LIQUID.includes(source.kind)) return json(route, { detail: 'Repayment must move liquid funds to a card' }, 422)
  const postings: Posting[] = [{ id: nextId(state, 'posting'), account_id: source.id, delta: kind === 'INCOME' || kind === 'REFUND' ? amount : -amount, effective_date: effective }]
  if (body.destination_account_id) postings.push({ id: nextId(state, 'posting'), account_id: String(body.destination_account_id), delta: amount, effective_date: effective })
  const event: Event = { id: nextId(state, 'event'), user_id: 'e2e-user', kind, amount, currency: 'JPY', category_id: (body.category_id as string | undefined) ?? null, description: (body.description as string | null) ?? null, occurred_on: occurred, date_basis: 'known', recorded_at: `${state.today}T12:00:${String(state.counter).padStart(2, '0')}`, original_event_id: (body.original_event_id as string | undefined) ?? null, reverses_event_id: null, replaces_event_id: null, is_reversal: false, postings, idempotency_key: body.idempotency_key as string }
  state.events.push(event)
  return json(route, event, 201)
})
on('GET', /^\/financial-events$/, (route, { state, query }) => {
  const items = state.events.filter((event) => (!query.get('kind') || event.kind === query.get('kind')) && (!query.get('account_id') || event.postings.some((posting) => posting.account_id === query.get('account_id')))).slice().reverse()
  return json(route, { items, total: items.length, page: 1, page_size: 20 })
})
on('GET', /^\/reports\/canonical-(monthly|by-category)$/, (route, { state, path }) => {
  const spending = state.events.filter((event) => event.kind === 'EXPENSE').reduce((sum, event) => sum + event.amount, 0)
  return json(route, path.endsWith('monthly') ? [{ month: '2026-09-01', income: 0, gross_spending: spending, refunds: 0, net_spending: spending, date_basis: 'known_only' }] : [])
})

// Legacy screens still render on a full-ledger deployment.
on('GET', /^\/opening-balances$/, (route) => json(route, []))
on('GET', /^\/reports\/balance$/, (route) => json(route, { cash_balance: 0, bank_balance: 0, total_balance: 0 }))
on('GET', /^\/reports\/(monthly|by-category|net-worth)$/, (route) => json(route, []))
on('GET', /^\/(transactions|transfers)$/, (route, { state, path, query }) => {
  const from = query.get('from') ?? ''
  const rows = path === '/transactions' ? state.legacyTransactions.filter((row) => row.transaction_date >= from) : state.legacyTransfers.filter((row) => row.transfer_date >= from)
  return json(route, { items: rows, total: rows.length, page: 1, page_size: 100, total_pages: rows.length ? 1 : 0 })
})

export async function mockLedgerApi(page: Page, state = createLedgerState()) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const path = url.pathname.slice(4)
    const method = request.method()
    const match = handlers.find(([verb, pattern]) => verb === method && pattern.test(path))
    if (!match) return route.fulfill({ status: 404, json: { detail: `Unhandled ${method} ${path}` } })
    const body = (request.postData() ? request.postDataJSON() : {}) as Json
    return match[2](route, { state, path, method, body, query: url.searchParams })
  })
  return state
}

export async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}
