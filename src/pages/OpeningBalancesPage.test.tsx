import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse, delay } from 'msw'
import { server } from '@/test/server'
import { OpeningBalancesPage } from '@/pages/OpeningBalancesPage'

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(['reports', 'balance'], {})
  client.setQueryData(['reports', 'net-worth', {}], [])
  render(<QueryClientProvider client={client}><MemoryRouter><OpeningBalancesPage /></MemoryRouter></QueryClientProvider>)
  return client
}
const cash = { id: 'cash', user_id: 'user', account_type: 'cash', amount: 100, as_of_date: '2026-01-01', created_at: '', updated_at: '' }
const bank = { ...cash, id: 'bank', account_type: 'bank', amount: 200, as_of_date: '2026-02-01' }
function enter(account: string, amount: string, date: string) {
  fireEvent.change(screen.getByLabelText(`${account} amount (JPY)`), { target: { value: amount } })
  fireEvent.change(screen.getByLabelText(`${account} As of date`), { target: { value: date } })
}

it('loads empty setup, validates JPY and dates, and accepts saving zero for one account', async () => {
  const saves: unknown[] = []
  server.use(http.get('*/opening-balances', () => HttpResponse.json([])), http.put('*/opening-balances/cash', async ({ request }) => { saves.push(await request.json()); return HttpResponse.json(cash) }))
  const client = mount()
  await screen.findByLabelText('Cash amount (JPY)')
  enter('Cash', '-1.5', '')
  fireEvent.click(screen.getByRole('button', { name: 'Save opening balances' }))
  expect(screen.getByText(/Cash amount must be zero/)).toBeInTheDocument()
  expect(screen.getByText(/Cash As of date must/)).toBeInTheDocument()
  expect(saves).toHaveLength(0)
  enter('Cash', '0', '2026-01-01')
  fireEvent.click(screen.getByRole('button', { name: 'Save opening balances' }))
  await screen.findByText('Cash opening balance saved.')
  expect(saves).toEqual([{ amount: 0, as_of_date: '2026-01-01' }])
  expect(client.getQueryState(['reports', 'balance'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['reports', 'net-worth', {}])?.isInvalidated).toBe(true)
})

it.each([[cash], [cash, bank]])('prefills configured accounts and permits corrections', async (...rows) => {
  const balances = rows.flat()
  server.use(http.get('*/opening-balances', () => HttpResponse.json(balances)), http.put('*/opening-balances/:account', () => HttpResponse.json(cash)))
  mount()
  expect(await screen.findByLabelText('Cash amount (JPY)')).toHaveValue('100')
  expect(screen.getByLabelText('Cash As of date')).toHaveValue('2026-01-01')
  enter('Cash', '999', '2025-12-31')
  fireEvent.click(screen.getByRole('button', { name: 'Save opening balances' }))
  await screen.findByText('Cash opening balance saved.')
  expect(screen.getByLabelText('Cash amount (JPY)')).toHaveValue('999')
})

it('identifies partial failures, preserves entered values, and prevents duplicate submissions', async () => {
  let requests = 0
  server.use(http.get('*/opening-balances', () => HttpResponse.json([])), http.put('*/opening-balances/:account', async ({ params }) => {
    requests++; await delay(80)
    return params.account === 'cash' ? HttpResponse.json(cash) : HttpResponse.json({ detail: 'Unavailable' }, { status: 500 })
  }))
  mount()
  await screen.findByLabelText('Cash amount (JPY)')
  enter('Cash', '100', '2026-01-01'); enter('Bank', '200', '2026-01-02')
  fireEvent.click(screen.getByRole('button', { name: 'Save opening balances' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await screen.findByText('Cash opening balance saved.')
  expect(screen.getByText(/Bank was not updated/)).toBeInTheDocument()
  expect(screen.getByLabelText('Bank amount (JPY)')).toHaveValue('200')
  expect(requests).toBe(2)
})

it('shows loading and recoverable API error states', async () => {
  server.use(http.get('*/opening-balances', async () => { await delay(30); return HttpResponse.json({}, { status: 500 }) }))
  mount()
  expect(screen.getByText('Loading opening balances…')).toBeInTheDocument()
  await screen.findByText(/Could not load opening balances/)
  server.use(http.get('*/opening-balances', () => HttpResponse.json([])))
  fireEvent.click(screen.getByRole('button', { name: 'Retry opening balances' }))
  await waitFor(() => expect(screen.getByLabelText('Cash amount (JPY)')).toBeInTheDocument())
})
