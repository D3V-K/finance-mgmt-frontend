import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { axe } from 'jest-axe'
import { TransfersPage } from '@/pages/TransfersPage'

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), filters: [] as unknown[], enabled: true, loading: false, error: false, empty: false }))
const transfer = { id: 'transfer-1', from_account: 'bank', to_account: 'cash', amount: 5000, transfer_date: '2026-09-01', description: 'Cash withdrawal' }
vi.mock('@/api/hooks/transfers', () => ({
  useTransfers: (filters: unknown, enabled: boolean) => { mocks.enabled = enabled; mocks.filters.push(filters); return { data: { items: mocks.empty ? [] : [transfer], total: 21, total_pages: 2 }, isLoading: mocks.loading, isError: mocks.error, error: new Error('Offline'), refetch: vi.fn() } },
  useCreateTransfer: () => ({ mutateAsync: mocks.create, isPending: false }),
  useDeleteTransfer: () => ({ mutateAsync: mocks.remove, isPending: false }),
}))
function Location() { return <output data-testid="location">{useLocation().search}</output> }
function renderPage(path = '/transfers') { return render(<MemoryRouter initialEntries={[path]}><TransfersPage/><Location/></MemoryRouter>) }
function form() { return screen.getByRole('button', { name: 'Create transfer' }).closest('form')! }
function fill() {
  fireEvent.change(screen.getByLabelText('Amount (JPY)'), { target: { value: '5000' } })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-01' } })
}
describe('TransfersPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.filters.length = 0; mocks.loading = false; mocks.error = false; mocks.empty = false })
  it.each(['bank', 'cash'])('creates %s transfers with explicit opposite accounts', async (from) => {
    mocks.create.mockResolvedValue({})
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New transfer' }))
    fill()
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: from } })
    fireEvent.submit(form())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ amount: 5000, from_account: from, to_account: from === 'bank' ? 'cash' : 'bank', transfer_date: '2026-09-01', description: null }))
    expect(await screen.findByText('Transfer created.')).toBeInTheDocument()
  })
  it('rejects zero and fractional JPY and prevents duplicate pending submissions', async () => {
    let resolve!: (value: unknown) => void
    mocks.create.mockImplementation(() => new Promise((done) => { resolve = done }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New transfer' }))
    fireEvent.submit(form())
    expect(await screen.findByText('Amount must be greater than zero.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Amount (JPY)'), { target: { value: '1.5' } })
    fireEvent.submit(form())
    expect(await screen.findByText('Amount must be a whole number.')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
    fill()
    fireEvent.submit(form()); fireEvent.submit(form())
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    resolve({})
    await screen.findByText('Transfer created.')
  })
  it('surfaces backend validation errors', async () => {
    mocks.create.mockRejectedValue(new Error('Transfer rejected'))
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'New transfer' })); fill(); fireEvent.submit(form())
    expect(await screen.findByText('Transfer rejected')).toBeInTheDocument()
  })
  it('preserves date filters during pagination and resets page when filters change', async () => {
    renderPage('/transfers?from=2026-08-01&to=2026-09-01')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mocks.filters.at(-1)).toMatchObject({ from: '2026-08-01', to: '2026-09-01', page: 2, page_size: 20 })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-02' } })
    expect(screen.getByTestId('location')).not.toHaveTextContent('page=')
    expect(mocks.filters.at(-1)).toMatchObject({ from: '2026-08-02', page: 1 })
  })
  it.each(['/transfers?from=bad', '/transfers?from=2026-09-02&to=2026-09-01'])('blocks invalid date filters: %s', (path) => {
    renderPage(path)
    expect(mocks.enabled).toBe(false)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
  it('requires delete confirmation and handles errors then success', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('Cannot delete')).mockResolvedValue(undefined)
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mocks.remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete transfer' }))
    expect(await screen.findByText('Cannot delete')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete transfer' }))
    expect(await screen.findByText('Transfer deleted.')).toBeInTheDocument()
    expect(mocks.remove).toHaveBeenCalledWith('transfer-1')
  })
  it.each(['loading', 'error', 'empty'] as const)('renders %s state', (state) => {
    mocks[state] = true; renderPage()
    if (state === 'loading') expect(screen.getByLabelText('Loading transfers')).toBeInTheDocument()
    if (state === 'error') expect(screen.getByText(/Could not load transfers/)).toBeInTheDocument()
    if (state === 'empty') expect(screen.getByText('No transfers yet')).toBeInTheDocument()
  })
  it('has accessible table and dialog with readable direction and scrollable narrow layout', async () => {
    const { container } = renderPage()
    expect(screen.getByText('Bank to Cash (withdrawal)')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Transfer history' }).parentElement).toHaveClass('overflow-x-auto')
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('button', { name: 'New transfer' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
