import { Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/routes'
import { AppShell } from '@/components/layout/AppShell'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="transactions" element={<PlaceholderPage title="Transactions" description="Review and manage money moving in and out." />} />
          <Route path="categories" element={<PlaceholderPage title="Categories" description="Organize transactions into meaningful groups." />} />
          <Route path="reports" element={<PlaceholderPage title="Reports" description="Understand trends across your finances." />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
