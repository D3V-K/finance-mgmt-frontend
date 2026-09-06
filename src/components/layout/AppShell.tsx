import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { useUiStore } from '@/store/uiStore'

type IconName = 'dashboard' | 'transactions' | 'categories' | 'reports'
const paths: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/transfers', label: 'Transfers', icon: 'transactions' },
  { to: '/opening-balances', label: 'Opening balances', icon: 'dashboard' },
  { to: '/categories', label: 'Categories', icon: 'categories' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
]

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const pathsByName: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    transactions: <><path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3"/></>,
    categories: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10l2 2h5.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/></>,
    reports: <><path d="M4 20V10m5 10V4m6 16v-7m5 7V7"/></>,
  }
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true" {...common}>{pathsByName[name]}</svg>
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return <nav aria-label="Primary navigation" className="mt-7 space-y-1 px-3">{paths.map(({ to, label, icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}><Icon name={icon}/>{label}</NavLink>)}</nav>
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const { isMobileNavOpen, openMobileNav, closeMobileNav } = useUiStore()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const identity = user?.signInDetails?.loginId ?? user?.username ?? 'Account'
  const title = paths.find((item) => item.to === location.pathname)?.label ?? 'Page not found'

  useEffect(() => { closeMobileNav() }, [closeMobileNav, location.pathname])
  useEffect(() => {
    if (!isMobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { closeMobileNav(); menuButtonRef.current?.focus() } }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeMobileNav, isMobileNavOpen])

  const closeAndRestoreFocus = () => { closeMobileNav(); menuButtonRef.current?.focus() }
  const handleSignOut = async () => {
    setSigningOut(true); setSignOutError('')
    try { await signOut() } catch { setSignOutError('Could not sign out. Please try again.'); setSigningOut(false) }
  }

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <a href="#main-content" className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white focus:translate-y-0">Skip to content</a>
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6"><span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 font-bold text-white">F</span><span className="font-bold tracking-tight">Finance</span></div>
      <Navigation />
      <div className="mt-auto border-t border-slate-200 p-4"><p className="truncate px-2 text-sm font-medium">{identity}</p><p className="px-2 text-xs text-slate-500">Signed in</p>{signOutError && <p role="alert" className="mt-2 text-xs text-red-700">{signOutError}</p>}<Button variant="ghost" loading={signingOut} onClick={handleSignOut} className="mt-2 w-full justify-start">Sign out</Button></div>
    </aside>
    {isMobileNavOpen && <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" aria-hidden="true" onClick={closeAndRestoreFocus} />}
    {isMobileNavOpen && <aside aria-label="Mobile menu" className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl lg:hidden">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5"><span className="font-bold">Finance</span><Button variant="ghost" className="px-3" onClick={closeAndRestoreFocus} aria-label="Close navigation">×</Button></div><Navigation onNavigate={closeAndRestoreFocus}/><div className="mt-auto border-t border-slate-200 p-4"><p className="truncate px-2 text-sm font-medium">{identity}</p><Button variant="ghost" loading={signingOut} onClick={handleSignOut} className="mt-2 w-full justify-start">Sign out</Button></div>
    </aside>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8"><button ref={menuButtonRef} type="button" onClick={openMobileNav} className="mr-3 grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 lg:hidden" aria-label="Open navigation" aria-expanded={isMobileNavOpen}><span aria-hidden="true">☰</span></button><h1 className="text-lg font-semibold">{title}</h1><div className="ml-auto hidden max-w-xs truncate text-sm text-slate-600 sm:block">{identity}</div></header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl p-4 outline-none sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  </div>
}
