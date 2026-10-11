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
