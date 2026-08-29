import { expect, test, type Page } from '@playwright/test'

const category = { id: 'category-1', user_id: 'e2e-user', name: 'Groceries', type: 'expense', color: '#e11d48', parent_id: null, created_at: '2026-08-01T00:00:00Z', children: [] }

async function mockApi(page: Page) {
  let transactions: Record<string, unknown>[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.endsWith('/categories/tree') || path.endsWith('/categories')) return route.fulfill({ json: [category] })
    if (path.endsWith('/reports/monthly') || path.endsWith('/reports/by-category')) return route.fulfill({ json: [] })
    if (path.endsWith('/transactions') && request.method() === 'POST') {
      const created = { id: 'transaction-1', user_id: 'e2e-user', created_at: new Date().toISOString(), ...request.postDataJSON() }
      transactions = [created]
      return route.fulfill({ status: 201, json: created })
    }
    if (path.endsWith('/transactions')) return route.fulfill({ json: { items: transactions, total: transactions.length, page: 1, page_size: 20, total_pages: transactions.length ? 1 : 0 } })
    return route.fulfill({ status: 404, json: { detail: 'Unhandled test request' } })
  })
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.error(`Browser error: ${error.message}`))
  await mockApi(page)
})

test('redirects to login, signs in, and navigates', async ({ page }) => {
  await page.goto('/transactions')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
  await page.getByRole('link', { name: 'Categories' }).first().click()
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible()
})

test('creates a representative transaction', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Transactions' }).first().click()
  await page.getByRole('button', { name: 'New transaction' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create transaction' })
  await dialog.getByLabel('Amount (JPY)').fill('2500')
  await dialog.getByLabel('Category').selectOption(category.id)
  await dialog.getByLabel('Description (optional)').fill('Smoke test purchase')
  await dialog.getByRole('button', { name: 'Create transaction' }).click()
  await expect(page.getByText('Smoke test purchase')).toBeVisible()
})
