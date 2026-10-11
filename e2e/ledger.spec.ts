import { expect, test } from '@playwright/test'
import { mockLedgerApi, signIn } from './ledgerApi'

test.beforeEach(({ page }) => { page.on('pageerror', (error) => console.error(`Browser error: ${error.message}`)) })

test('sets up named accounts with independent opening balances', async ({ page }) => {
  const state = await mockLedgerApi(page)
  await signIn(page)
  await page.getByRole('link', { name: 'Accounts' }).first().click()
  await expect(page.getByRole('heading', { name: 'No accounts yet' })).toBeVisible()

  for (const [name, kind] of [['Everyday Bank', 'BANK'], ['Rewards Card', 'CREDIT_CARD']]) {
    await page.getByRole('button', { name: 'Add account' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Account name').fill(name)
    await dialog.getByLabel('Account type').selectOption(kind)
    await dialog.getByRole('button', { name: 'Add account' }).click()
    await expect(dialog).toBeHidden()
  }
  await expect(page.getByText('Opening balance needed')).toHaveCount(2)

  await page.getByRole('button', { name: 'Set opening balance for Everyday Bank' }).click()
  await page.getByRole('dialog').getByLabel('Date').fill('2026-09-01')
  await page.getByRole('dialog').getByLabel('Balance (JPY)').fill('100000')
  await page.getByRole('dialog').getByRole('button', { name: 'Save opening balance' }).click()

  await page.getByRole('button', { name: 'Set opening balance for Rewards Card' }).click()
  await page.getByRole('dialog').getByLabel('Date').fill('2026-09-01')
  await page.getByRole('dialog').getByLabel('Amount owed (JPY)').fill('20000')
  await page.getByRole('dialog').getByRole('button', { name: 'Save opening balance' }).click()

  await expect(page.getByText('¥100,000')).toBeVisible()
  await expect(page.getByText('Amount owed ¥20,000')).toBeVisible()
  expect(state.openings[state.accounts[1].id].amount).toBe(-20000)
})

test('migrates payment-date history to purchase-date tracking without rewriting it', async ({ page }) => {
  const state = await mockLedgerApi(page)
  state.accounts.push(
    { id: 'acct-bank', user_id: 'e2e-user', name: 'Everyday Bank', kind: 'BANK', currency: 'JPY', archived_at: null, created_at: '', updated_at: '' },
    { id: 'acct-card', user_id: 'e2e-user', name: 'Rewards Card', kind: 'CREDIT_CARD', currency: 'JPY', archived_at: null, created_at: '', updated_at: '' },
  )
  state.legacyTransactions.push(
    { id: 'tx-old', account_type: 'bank', amount: 18000, description: 'August card bill', category_id: 'cat-groceries', transaction_date: '2026-08-27' },
    { id: 'tx-new', account_type: 'bank', amount: 4000, description: 'Pharmacy', category_id: 'cat-groceries', transaction_date: '2026-09-03' },
  )
  await signIn(page)
  await page.getByRole('link', { name: 'Start setup' }).click()
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByLabel('Records labelled Bank').selectOption('acct-bank')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Start tracking purchases on').fill('2026-09-01')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Everyday Bank balance (JPY)').fill('100000')
  await page.getByLabel('Rewards Card amount owed (JPY)').fill('20000')
  await page.getByRole('button', { name: 'Save balances and continue' }).click()
  await expect(page.getByRole('cell', { name: 'Pharmacy Groceries · Expense' })).toBeVisible()
  await expect(page.getByText('August card bill')).toHaveCount(0)
  await page.getByRole('button', { name: 'Preview migration' }).click()
  await expect(page.getByText('This preview did not change anything.')).toBeVisible()
  expect(state.cutover).toBeNull()
  await page.getByLabel(/I understand that records before/).check()
  await page.getByRole('button', { name: 'Confirm migration' }).click()
  await expect(page.getByRole('heading', { name: /Purchase-date tracking started/ })).toBeVisible()
  await expect(page.getByText('Every record after the start date is assigned to an account.')).toBeVisible()
  expect(state.events).toHaveLength(1)
  expect(state.events[0]).toMatchObject({ occurred_on: null, date_basis: 'legacy_recorded_date' })
  expect(state.openings['acct-card'].amount).toBe(-20000)
})
