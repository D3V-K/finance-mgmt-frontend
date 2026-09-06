import { expect, test, type Page } from '@playwright/test'

const category = { id: 'category-1', user_id: 'e2e-user', name: 'Groceries', type: 'expense', color: '#e11d48', parent_id: null, created_at: '2026-08-01T00:00:00Z', children: [] }

async function mockApi(page: Page) {
  const opening: Record<string, Record<string, unknown>> = {}
  let transfers: Record<string, unknown>[] = []
  let transactions: Record<string, unknown>[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.includes('/opening-balances/') && request.method() === 'PUT') {
      const account = path.split('/').pop()!
      opening[account] = { id: account, account_type: account, ...request.postDataJSON() }
      return route.fulfill({ json: opening[account] })
    }
    if (path.endsWith('/opening-balances')) return route.fulfill({ json: Object.values(opening) })
    if (path.endsWith('/reports/balance')) return route.fulfill({ json: { cash_balance: Number(opening.cash?.amount ?? 0), bank_balance: Number(opening.bank?.amount ?? 0), total_balance: Number(opening.cash?.amount ?? 0) + Number(opening.bank?.amount ?? 0) } })
    if (path.endsWith('/reports/net-worth')) return route.fulfill({ json: [{ month: '2026-09-01', net_worth: 120000 }] })
    if (path.endsWith('/transfers') && request.method() === 'POST') {
      const created = { id: 'transfer-1', user_id: 'e2e-user', created_at: new Date().toISOString(), ...request.postDataJSON() }
      transfers = [created]
      return route.fulfill({ status: 201, json: created })
    }
    if (path.includes('/transfers/') && request.method() === 'DELETE') { transfers = []; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/transfers')) return route.fulfill({ json: { items: transfers, total: transfers.length, page: 1, page_size: 20, total_pages: transfers.length ? 1 : 0 } })
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
  await dialog.getByLabel('Account', { exact: true }).selectOption('cash')
  await dialog.getByLabel('Description (optional)').fill('Smoke test purchase')
  await dialog.getByRole('button', { name: 'Create transaction' }).click()
  await expect(page.getByText('Smoke test purchase')).toBeVisible()
})


test('sets opening balances, creates and deletes a transfer, and views balance history on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('e2e@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('complementary', { name: 'Mobile menu' }).getByRole('link', { name: 'Opening balances', exact: true }).click()
  await page.getByLabel('Cash amount (JPY)').fill('20000')
  await page.getByLabel('Cash As of date').fill('2026-08-01')
  await page.getByLabel('Bank amount (JPY)').fill('100000')
  await page.getByLabel('Bank As of date').fill('2026-08-01')
  await page.getByRole('button', { name: 'Save opening balances' }).click()
  await expect(page.getByText('Cash opening balance saved.')).toBeVisible()
  await expect(page.getByText('Bank opening balance saved.')).toBeVisible()
  await page.getByRole('link', { name: 'Back to dashboard' }).click()
  await expect(page.getByText('¥120,000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Transfers', exact: true }).last().click()
  await page.getByRole('button', { name: 'New transfer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create transfer' })
  await dialog.getByLabel('Amount (JPY)').fill('5000')
  await dialog.getByLabel('Date', { exact: true }).fill('2026-09-01')
  await dialog.getByRole('button', { name: 'Create transfer' }).click()
  await expect(page.getByRole('table', { name: 'Transfer history' })).toContainText('Bank to Cash (withdrawal)')
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete transfer', exact: true }).click()
  await expect(page.getByText('No transfers yet')).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Reports', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible()
  await page.getByLabel('From', { exact: true }).fill('2026-09-01')
  await page.getByLabel('To', { exact: true }).fill('2026-09-30')
  await expect(page.getByRole('table', { name: 'Net balance values shown in the chart' })).toContainText('¥120,000')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
