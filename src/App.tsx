import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/routes'
import { AppShell } from '@/components/layout/AppShell'
import { FeatureRoute } from '@/components/layout/FeatureGate'
import { Spinner } from '@/components/ui/Feedback'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage').then((module) => ({ default: module.CategoriesPage })))
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })))
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((module) => ({ default: module.ReportsPage })))

const TransfersPage = lazy(() => import('@/pages/TransfersPage').then((module) => ({ default: module.TransfersPage })))
const OpeningBalancesPage = lazy(() => import('@/pages/OpeningBalancesPage').then((module) => ({ default: module.OpeningBalancesPage })))
const AccountsPage = lazy(() => import('@/pages/AccountsPage').then((module) => ({ default: module.AccountsPage })))
const CardsPage = lazy(() => import('@/pages/CardsPage').then((module) => ({ default: module.CardsPage })))
const BudgetPage = lazy(() => import('@/pages/BudgetPage').then((module) => ({ default: module.BudgetPage })))
const SavingsPage = lazy(() => import('@/pages/SavingsPage').then((module) => ({ default: module.SavingsPage })))
const InvestmentsPage = lazy(() => import('@/pages/InvestmentsPage').then((module) => ({ default: module.InvestmentsPage })))
const ReviewPage = lazy(() => import('@/pages/ReviewPage').then((module) => ({ default: module.ReviewPage })))
const MigrationPage = lazy(() => import('@/pages/MigrationPage').then((module) => ({ default: module.MigrationPage })))

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
            <Route path="transfers" element={<TransfersPage />} />
            <Route path="opening-balances" element={<OpeningBalancesPage />} />
            <Route path="accounts" element={<FeatureRoute feature="accounts"><AccountsPage /></FeatureRoute>} />
            <Route path="cards" element={<FeatureRoute feature="cards"><CardsPage /></FeatureRoute>} />
            <Route path="cards/:cardId" element={<FeatureRoute feature="cards"><CardsPage /></FeatureRoute>} />
            <Route path="budget" element={<FeatureRoute feature="budgets"><BudgetPage /></FeatureRoute>} />
            <Route path="savings" element={<FeatureRoute feature="budgets"><SavingsPage /></FeatureRoute>} />
            <Route path="investments" element={<FeatureRoute feature="investments"><InvestmentsPage /></FeatureRoute>} />
            <Route path="review" element={<FeatureRoute feature="reconciliation"><ReviewPage /></FeatureRoute>} />
            <Route path="setup/migration" element={<FeatureRoute feature="cutover"><FeatureRoute feature="accounts"><MigrationPage /></FeatureRoute></FeatureRoute>} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
