import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'

export function HomePage() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Failed to sign out', error)
      setSigningOut(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-900">
      <section className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
          Finance
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Your financial workspace is ready.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Transactions, budgets, and reports will appear here as they are added.
        </p>
        <p className="mt-6 text-sm text-slate-500">Signed in as {user?.signInDetails?.loginId ?? user?.username}</p>
        <button type="button" onClick={handleSignOut} disabled={signingOut} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </main>
  )
}
