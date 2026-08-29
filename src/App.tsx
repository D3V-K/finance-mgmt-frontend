import { Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/routes'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { ReportsPage } from '@/pages/ReportsPage'

export default function App() {
  return (
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
  )
}
