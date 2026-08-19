import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'

export type LoginLocationState = { from?: string }

function LoadingScreen() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-slate-50 text-slate-700"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm font-medium">Loading your financial workspace…</p>
    </main>
  )
}

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}
