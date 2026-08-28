import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Hub } from 'aws-amplify/utils'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import App from '@/App'
import { AuthProvider } from '@/auth/AuthContext'

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('aws-amplify/auth', () => authMocks)
vi.mock('@/api/hooks/transactions', () => ({
  useTransactions: () => ({ data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/api/hooks/categories', () => ({ useCategories: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }) }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('authentication routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state while restoring the session', () => {
    authMocks.getCurrentUser.mockReturnValue(new Promise(() => undefined))
    renderApp()
    expect(screen.getByText(/loading your financial workspace/i)).toBeInTheDocument()
  })

  it('redirects unauthenticated visitors to login', async () => {
    authMocks.getCurrentUser.mockRejectedValue(new Error('No current user'))
    renderApp('/?period=month')

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('restores an existing authenticated session', async () => {
    authMocks.getCurrentUser.mockResolvedValue({ username: 'user@example.com' })
    renderApp()

    expect(await screen.findByRole('heading', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument()
  })

  it('validates credentials before submitting', async () => {
    authMocks.getCurrentUser.mockRejectedValue(new Error('No current user'))
    renderApp('/login')
    fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(authMocks.signIn).not.toHaveBeenCalled()
  })

  it('signs in and returns to the requested URL', async () => {
    authMocks.getCurrentUser
      .mockRejectedValueOnce(new Error('No current user'))
      .mockResolvedValueOnce({ username: 'user@example.com' })
    authMocks.signIn.mockResolvedValue({ isSignedIn: true })
    renderApp('/?period=month')

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?period=month'))
    expect(authMocks.signIn).toHaveBeenCalledWith({ username: 'user@example.com', password: 'password' })
  })

  it('shows a safe message for invalid credentials', async () => {
    authMocks.getCurrentUser.mockRejectedValue(new Error('No current user'))
    const error = new Error('Sensitive provider response')
    error.name = 'NotAuthorizedException'
    authMocks.signIn.mockRejectedValue(error)
    renderApp('/login')

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.queryByText(/sensitive provider response/i)).not.toBeInTheDocument()
  })

  it('signs out and returns to login', async () => {
    authMocks.getCurrentUser.mockResolvedValue({ username: 'user@example.com' })
    authMocks.signOut.mockResolvedValue(undefined)
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: /sign out/i }))
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(authMocks.signOut).toHaveBeenCalledOnce()
  })

  it('redirects to login when the session expires in the background', async () => {
    authMocks.getCurrentUser.mockResolvedValue({ username: 'user@example.com' })
    renderApp()

    expect(await screen.findByRole('heading', { name: /overview/i })).toBeInTheDocument()

    Hub.dispatch('auth', { event: 'tokenRefresh_failure' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('navigates between primary pages and indicates the active page', async () => {
    authMocks.getCurrentUser.mockResolvedValue({ username: 'user@example.com' })
    renderApp()

    const transactionsLinks = await screen.findAllByRole('link', { name: 'Transactions' })
    fireEvent.click(transactionsLinks[0])

    expect(await screen.findByRole('heading', { name: 'Transactions', level: 2 })).toBeInTheDocument()
    expect(transactionsLinks[0]).toHaveClass('text-indigo-700')
    expect(screen.getByTestId('location')).toHaveTextContent('/transactions')
  })

  it('shows a not-found experience without leaving the authenticated shell', async () => {
    authMocks.getCurrentUser.mockResolvedValue({ username: 'user@example.com' })
    renderApp('/missing-page')

    expect(await screen.findByRole('heading', { name: /page not found/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument()
  })
})
