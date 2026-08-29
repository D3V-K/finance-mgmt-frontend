import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/routes'
import { AppShell } from '@/components/layout/AppShell'
import { Spinner } from '@/components/ui/Feedback'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage').then((module) => ({ default: module.CategoriesPage })))
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((module) => ({ default: module.ReportsPage })))

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner label="Loading page…" /></div>}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
