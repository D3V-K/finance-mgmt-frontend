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
on('GET', /^\/ledger-cutovers\/unresolved$/, (route) => json(route, { detail: 'Confirm cutover first' }, 404))
on('GET', /^\/categories(\/tree)?$/, (route, { state, path }) => json(route, path.endsWith('tree') ? state.categories : { items: state.categories, total: state.categories.length, page: 1, page_size: 100, total_pages: 1 }))

// Legacy screens still render on a full-ledger deployment.
on('GET', /^\/opening-balances$/, (route) => json(route, []))
on('GET', /^\/reports\/balance$/, (route) => json(route, { cash_balance: 0, bank_balance: 0, total_balance: 0 }))
on('GET', /^\/reports\/(monthly|by-category|net-worth)$/, (route) => json(route, []))
on('GET', /^\/(transactions|transfers)$/, (route) => json(route, { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }))

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
