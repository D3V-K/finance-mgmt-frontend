import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { PropsWithChildren } from 'react'
import { normalizeApiError } from '@/api/errors'
import { useCreateAccount, useSetAccountOpening } from '@/api/hooks/accounts'
import { useConfirmCutover } from '@/api/hooks/cutover'
import { useCreateFinancialEvent, useFinancialEvents } from '@/api/hooks/events'
import { useCashForecast } from '@/api/hooks/forecast'
import { useFundBucket } from '@/api/hooks/planning'
import { useIdempotencyKey } from '@/api/idempotency'
import { invalidationMatrix } from '@/api/invalidation'
import { ledgerKeys } from '@/api/queryKeys'
import { accountsApi } from '@/api/resources/accounts'
import { categoriesApi } from '@/api/resources/categories'
import { eventsApi } from '@/api/resources/events'
import type { FinancialEventCreateDto } from '@/api/types'
import { parseFeatures, rolloutMode, setEnabledFeatures } from '@/config/features'
import { server } from '@/test/server'
import { eventFixture, ledgerFixtures } from '@/test/ledgerFixtures'

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn().mockResolvedValue({ tokens: { idToken: { toString: () => 'test-token' } } }) }))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

const seed = (client: QueryClient, keys: QueryKey[]) => keys.forEach((key) => client.setQueryData(key, {}))
const invalidated = (client: QueryClient, key: QueryKey) => client.getQueryState(key)?.isInvalidated

const families = {
  events: ['financial-events', 'list', {}], budgets: ['budgets', 'cycle', '2026-09-10'], cards: ['cards', 'schedules', 'acct-card'],
  accounts: ['accounts', 'balance', 'acct-bank', '2026-09-10'], forecast: ['cash-forecast', '2026-09-10', '2026-09-30', 'baseline'],
  available: ['available-cash', '2026-09-10', '2026-09-25'], dashboard: ['dashboard', 'today'], position: ['financial-position', 'as-of', '2026-09-10'],
  allocations: ['allocations', 'summary', '2026-09-10'], goals: ['savings-goals'], spending: ['canonical-reports', 'monthly', {}],
  legacyTransactions: ['transactions', 'list', {}], legacyBalance: ['reports', 'balance'],
} satisfies Record<string, QueryKey>

afterEach(() => setEnabledFeatures('none'))

describe('rollout gating', () => {
  it('parses deployment flags into legacy, partial and full modes', () => {
    expect([...parseFeatures(undefined)]).toEqual([])
    expect([...parseFeatures(' accounts, events ,unknown')]).toEqual(['accounts', 'events'])
    expect(parseFeatures('all').size).toBe(10)
    setEnabledFeatures('none'); expect(rolloutMode()).toBe('legacy')
    setEnabledFeatures(['accounts']); expect(rolloutMode()).toBe('partial')
    setEnabledFeatures('all'); expect(rolloutMode()).toBe('full')
  })

  it('never requests a new endpoint while its feature is disabled', async () => {
    const requests: string[] = []
    server.events.on('request:start', ({ request }) => { requests.push(new URL(request.url).pathname) })
    setEnabledFeatures(['accounts'])
    await expect(eventsApi.list()).rejects.toMatchObject({ name: 'FeatureDisabledError', feature: 'events' })
    expect(normalizeApiError(await eventsApi.create({ kind: 'EXPENSE', amount: 1 }).catch((error: unknown) => error)).kind).toBe('disabled')
    const { wrapper } = setup()
    const { result } = renderHook(() => useFinancialEvents(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    await expect(accountsApi.list()).resolves.toHaveLength(4)
    expect(requests).toEqual(['/api/accounts'])
    server.events.removeAllListeners()
  })
})

describe('query keys', () => {
  it('separate account, as-of date, cycle, horizon and scenario variants', () => {
    expect(ledgerKeys.accounts.balance('a', '2026-09-01')).not.toEqual(ledgerKeys.accounts.balance('b', '2026-09-01'))
    expect(ledgerKeys.accounts.balance('a', '2026-09-01')).not.toEqual(ledgerKeys.accounts.balance('a', '2026-09-02'))
    expect(ledgerKeys.budgets.cycle('2026-08-25')).not.toEqual(ledgerKeys.budgets.cycle('2026-09-25'))
    expect(ledgerKeys.forecast.range('2026-09-01', '2026-09-30', 'baseline')).not.toEqual(ledgerKeys.forecast.range('2026-09-01', '2026-09-30', 'with_scenario'))
    expect(ledgerKeys.events.list({ kind: 'EXPENSE' })).not.toEqual(ledgerKeys.events.list({ kind: 'REFUND' }))
  })

  it('requests a scenario forecast only for the explicit scenario key', async () => {
    setEnabledFeatures(['forecast'])
    const scenarios: Array<string | null> = []
    server.use(http.get('*/reports/cash-forecast', ({ request }) => { scenarios.push(new URL(request.url).searchParams.get('scenario')); return HttpResponse.json({ days: [] }) }))
    const { wrapper } = setup()
    const baseline = renderHook(() => useCashForecast('2026-09-01', '2026-09-30'), { wrapper })
    await waitFor(() => expect(baseline.result.current.isSuccess).toBe(true))
    const scenario = renderHook(() => useCashForecast('2026-09-01', '2026-09-30', 'with_scenario'), { wrapper })
    await waitFor(() => expect(scenario.result.current.isSuccess).toBe(true))
    expect(scenarios).toEqual([null, 'true'])
  })
})

describe('mutation invalidation matrix', () => {
  beforeEach(() => setEnabledFeatures('all'))

  it('a card purchase refreshes spending, debt, commitments and position', async () => {
    const { client, wrapper } = setup()
    seed(client, Object.values(families))
    const { result } = renderHook(() => useCreateFinancialEvent(), { wrapper })
    await act(() => result.current.mutateAsync({ kind: 'EXPENSE', amount: 6000, account_id: ledgerFixtures.card.id, category_id: 'category-1', idempotency_key: 'k1' }))
    for (const key of [families.events, families.budgets, families.cards, families.forecast, families.available, families.dashboard, families.position, families.spending]) expect(invalidated(client, key)).toBe(true)
    expect(invalidated(client, families.goals)).toBe(false)
    expect(invalidated(client, families.legacyTransactions)).toBe(false)
  })

  it('a repayment refreshes bank, card and forecast but never budgets or spending', async () => {
    server.use(http.post('*/financial-events', () => HttpResponse.json(eventFixture({ kind: 'CARD_REPAYMENT', category_id: null }), { status: 201 })))
    const { client, wrapper } = setup()
    seed(client, Object.values(families))
    const { result } = renderHook(() => useCreateFinancialEvent(), { wrapper })
    await act(() => result.current.mutateAsync({ kind: 'CARD_REPAYMENT', amount: 6000, account_id: 'acct-bank', destination_account_id: 'acct-card', occurred_on: '2026-10-27', effective_date: '2026-10-27', idempotency_key: 'k2' }))
    for (const key of [families.events, families.accounts, families.cards, families.forecast, families.available, families.dashboard, families.position]) expect(invalidated(client, key)).toBe(true)
    expect(invalidated(client, families.budgets)).toBe(false)
    expect(invalidated(client, families.spending)).toBe(false)
  })

  type Wrapper = ReturnType<typeof setup>['wrapper']
  const writes = {
    opening: async (wrapper: Wrapper) => {
      const { result } = renderHook(() => useSetAccountOpening(), { wrapper })
      await act(() => result.current.mutateAsync({ id: 'acct-bank', payload: { amount: 0, as_of_date: '2026-09-01' } }))
    },
    cutover: async (wrapper: Wrapper) => {
      const { result } = renderHook(() => useConfirmCutover(), { wrapper })
      await act(() => result.current.mutateAsync({ as_of_date: '2026-09-01', openings: [{ account_id: 'acct-bank', amount: 0 }] }))
    },
  }

  it.each(['opening', 'cutover'] as const)('%s refreshes every balance and date view', async (name) => {
    server.use(http.post('*/ledger-cutovers/confirm', () => HttpResponse.json({ id: 'cutover-1', as_of_date: '2026-09-01', unresolved_count: 0, status: 'confirmed' })))
    const { client, wrapper } = setup()
    seed(client, Object.values(families))
    await writes[name](wrapper)
    for (const key of [families.accounts, families.allocations, families.forecast, families.available, families.dashboard, families.position]) expect(invalidated(client, key)).toBe(true)
    if (name === 'cutover') expect(invalidated(client, families.events)).toBe(true)
  })

  it('a bucket allocation refreshes available cash and goals, not spending or balances', async () => {
    server.use(http.post('*/allocations/buckets/:id/fund', () => HttpResponse.json({ bucket_id: 'bucket-1', target: 300000, funded: 30000, shortfall: 270000 })))
    const { client, wrapper } = setup()
    seed(client, Object.values(families))
    const { result } = renderHook(() => useFundBucket(), { wrapper })
    await act(() => result.current.mutateAsync({ id: 'bucket-1', payload: { account_id: 'acct-bank', amount: 10000, as_of_date: '2026-09-10' } }))
    for (const key of [families.allocations, families.available, families.goals, families.dashboard]) expect(invalidated(client, key)).toBe(true)
    for (const key of [families.events, families.budgets, families.spending, families.accounts]) expect(invalidated(client, key)).toBe(false)
  })

  it('account changes refresh entry options and position', async () => {
    const { client, wrapper } = setup()
    seed(client, [['entry-options'], families.position, families.budgets])
    const { result } = renderHook(() => useCreateAccount(), { wrapper })
    await act(() => result.current.mutateAsync({ name: 'Second bank', kind: 'BANK' }))
    expect(invalidated(client, ['entry-options'])).toBe(true)
    expect(invalidated(client, families.position)).toBe(true)
    expect(invalidated(client, families.budgets)).toBe(false)
  })

  it('keeps legacy transfer writes away from income/expense reports', () => {
    const keys = invalidationMatrix['legacy-transfer'].map((key) => JSON.stringify(key))
    expect(keys).toContain(JSON.stringify(['reports', 'balance']))
    expect(keys).not.toContain(JSON.stringify(['reports']))
  })
})

describe('idempotent writes', () => {
  beforeEach(() => setEnabledFeatures('all'))

  it('a retried purchase after a lost response creates one event', async () => {
    const stored = new Map<string, ReturnType<typeof eventFixture>>()
    let attempts = 0
    server.use(http.post('*/financial-events', async ({ request }) => {
      attempts += 1
      const body = await request.json() as FinancialEventCreateDto
      const key = body.idempotency_key!
      if (!stored.has(key)) stored.set(key, eventFixture({ id: `event-${stored.size + 1}` }))
      // The first response is lost after the server committed the event.
      return attempts === 1 ? HttpResponse.error() : HttpResponse.json(stored.get(key), { status: 201 })
    }))
    const { wrapper } = setup()
    const { result } = renderHook(() => ({ key: useIdempotencyKey(), create: useCreateFinancialEvent() }), { wrapper })
    const input = { kind: 'EXPENSE' as const, amount: 6000, account_id: ledgerFixtures.card.id, category_id: 'category-1', occurred_on: '2026-09-10' }
    const submit = () => result.current.create.mutateAsync({ ...input, idempotency_key: result.current.key.keyFor(input) })
    await act(async () => { await expect(submit()).rejects.toMatchObject({ kind: 'network' }) })
    await act(async () => { await expect(submit()).resolves.toMatchObject({ id: 'event-1' }) })
    expect(attempts).toBe(2)
    expect(stored.size).toBe(1)
  })

  it('uses a new key when the input changes and after a completed write', () => {
    const { result } = renderHook(() => useIdempotencyKey())
    const first = result.current.keyFor({ amount: 6000, category_id: 'a' })
    expect(result.current.keyFor({ category_id: 'a', amount: 6000 })).toBe(first)
    const edited = result.current.keyFor({ amount: 6500, category_id: 'a' })
    expect(edited).not.toBe(first)
    result.current.reset()
    expect(result.current.keyFor({ amount: 6500, category_id: 'a' })).not.toBe(edited)
  })

  it('classifies 409 as a conflict distinct from validation', async () => {
    server.use(http.post('*/financial-events', () => HttpResponse.json({ detail: 'Idempotency key used for a different payload' }, { status: 409 })))
    const error = await eventsApi.create({ kind: 'EXPENSE', amount: 1, idempotency_key: 'k' }).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ kind: 'conflict', status: 409, message: 'Idempotency key used for a different payload' })
  })
})

describe('wire shapes', () => {
  it('reads every category page instead of only the first', async () => {
    const pages: string[] = []
    server.use(http.get('*/categories', ({ request }) => {
      const params = new URL(request.url).searchParams
      pages.push(`${params.get('page')}:${params.get('page_size')}:${params.get('include_archived')}`)
      const page = Number(params.get('page'))
      return HttpResponse.json({ items: [{ id: `category-${page}` }], total: 2, page, page_size: 100, total_pages: 2 })
    }))
    await expect(categoriesApi.list()).resolves.toEqual([{ id: 'category-1' }, { id: 'category-2' }])
    expect(pages).toEqual(['1:100:null', '2:100:null'])
  })

  it('treats a missing account opening as unknown rather than zero', async () => {
    setEnabledFeatures(['accounts'])
    await expect(accountsApi.opening('acct-bank')).resolves.toBeNull()
  })
})
