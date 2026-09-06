import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Category } from '@/api/types'
import { CategorySelect } from './CategorySelect'

const category = (id: string, name: string, type: Category['type'], parent_id: string | null = null): Category => ({ id, name, type, parent_id, user_id: 'user', color: null, created_at: '2026-01-01' })
const categories = [category('groceries', 'Groceries', 'expense', 'food'), category('salary', 'Salary', 'income'), category('fresh', 'Fresh produce', 'expense', 'groceries'), category('food', 'Food', 'expense'), category('bonus', 'Bonus', 'income', 'salary')]

it('groups income and expenses and puts full child paths after their parents', async () => {
  render(<CategorySelect label="Category" categories={categories} />)
  const income = within(screen.getByRole('group', { name: 'Income' }))
  expect(income.getAllByRole('option').map((option) => option.textContent)).toEqual(['Salary', 'Salary › Bonus'])
  const expenses = within(screen.getByRole('group', { name: 'Expenses' }))
  expect(expenses.getAllByRole('option').map((option) => option.textContent)).toEqual(['Food', 'Food › Groceries', 'Food › Groceries › Fresh produce'])
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'fresh')
  expect(screen.getByLabelText('Category')).toHaveValue('fresh')
})

it('keeps type filters, validation associations, and orphaned categories usable', () => {
  render(<CategorySelect label="Category" categories={[...categories, category('other', 'Other', 'expense', 'missing')]} type="expense" error="Category is required." />)
  expect(screen.queryByRole('group', { name: 'Income' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument()
  expect(screen.getByLabelText('Category')).toHaveAttribute('aria-describedby', 'category-error')
})
