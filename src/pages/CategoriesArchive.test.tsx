import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Category, CategoryTree } from '@/api/types'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { setEnabledFeatures } from '@/config/features'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { renderWithClient } from '@/test/render'
import { server } from '@/test/server'

const node = (id: string, name: string, extra: Partial<CategoryTree> = {}): CategoryTree => ({ id, user_id: 'u', name, type: 'expense', color: '#e11d48', parent_id: null, created_at: '2026-01-01T00:00:00', archived_at: null, children: [], ...extra })
const rent = node('rent', 'Rent', { parent_id: 'housing' })
const housing = node('housing', 'Housing', { children: [rent] })
const hobby = node('hobby', 'Old hobby', { archived_at: '2026-09-01T00:00:00' })

function api() {
  const calls: string[] = []
  server.use(
    http.get('*/categories/tree', ({ request }) => {
      calls.push(`tree:${new URL(request.url).searchParams.get('include_archived')}`)
      return HttpResponse.json(new URL(request.url).searchParams.get('include_archived') ? [housing, hobby] : [housing])
    }),
    http.get('*/categories', () => HttpResponse.json({ items: [housing, rent], total: 2, page: 1, page_size: 100, total_pages: 1 })),
    http.delete('*/categories/:id', ({ params }) => { calls.push(`delete:${params.id}`); return HttpResponse.json({ detail: 'Archive categories with transactions or children instead' }, { status: 409 }) }),
    http.post('*/categories/:id/archive', ({ params }) => { calls.push(`archive:${params.id}`); return HttpResponse.json({ ...rent, archived_at: '2026-09-10T00:00:00' }) }),
    http.post('*/categories/:id/restore', ({ params }) => { calls.push(`restore:${params.id}`); return HttpResponse.json({ ...hobby, archived_at: null }) }),
    http.put('*/categories/:id', () => HttpResponse.json({ detail: 'Cannot change type of a used category' }, { status: 409 })),
  )
  return calls
}

const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^(Archive|Restore) ${name}$`) }).closest('div') as HTMLElement

beforeEach(() => setEnabledFeatures(['category-archive']))
afterEach(() => setEnabledFeatures('none'))

it('makes archive the normal action and only offers delete for leaves', async () => {
  api()
  renderWithClient(<CategoriesPage />)
  await screen.findByRole('button', { name: 'Archive Housing' })
  expect(within(row('Housing')).getByRole('button', { name: 'Archive Housing' })).toBeInTheDocument()
  expect(within(row('Housing')).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  expect(within(row('Rent')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
})

it('turns a used-category delete conflict into an archive that keeps history', async () => {
  const calls = api()
  const user = userEvent.setup()
  renderWithClient(<CategoriesPage />)
  await user.click(within(await screen.findByRole('button', { name: 'Archive Rent' }).then((el) => el.closest('div') as HTMLElement)).getByRole('button', { name: 'Delete' }))
  expect(screen.getByText(/Deleting a category never deletes any entries/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete category' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('can’t be deleted. Archive it instead')
  await user.click(screen.getByRole('button', { name: 'Archive instead' }))
  const dialog = screen.getByRole('dialog', { name: 'Archive Rent?' })
  expect(within(dialog).getByText(/Keep past entries; hide from new purchases/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Archive category' }))
  expect(await screen.findByText('Rent archived. Past entries and reports keep it.')).toBeInTheDocument()
  expect(calls.filter((call) => !call.startsWith('tree'))).toEqual(['delete:rent', 'archive:rent'])
})

it('keeps the form and explains when the server refuses a type change', async () => {
  api()
  const user = userEvent.setup()
  renderWithClient(<CategoriesPage />)
  await user.click(within(await screen.findByRole('button', { name: 'Archive Rent' }).then((el) => el.closest('div') as HTMLElement)).getByRole('button', { name: 'Edit' }))
  const dialog = screen.getByRole('dialog')
  await user.clear(within(dialog).getByLabelText('Name'))
  await user.type(within(dialog).getByLabelText('Name'), 'Rent & fees')
  await user.selectOptions(within(dialog).getByLabelText('Type'), 'income')
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('already used by past entries, so its type can’t change')
  expect(within(dialog).getByLabelText('Name')).toHaveValue('Rent & fees')
  expect(within(dialog).getByLabelText('Type')).toHaveValue('income')
})

it('reviews archived categories and restores one', async () => {
  const calls = api()
  const user = userEvent.setup()
  renderWithClient(<CategoriesPage />)
  await screen.findByRole('button', { name: 'Archive Housing' })
  expect(screen.queryByRole('button', { name: 'Restore Old hobby' })).not.toBeInTheDocument()
  await user.click(screen.getByLabelText('Show archived categories'))
  expect(await screen.findByRole('button', { name: 'Restore Old hobby' })).toBeInTheDocument()
  expect(within(row('Old hobby')).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  await user.click(within(row('Old hobby')).getByRole('button', { name: 'Restore Old hobby' }))
  expect(await screen.findByText('Old hobby restored and available for new entries.')).toBeInTheDocument()
  expect(calls).toContain('tree:true')
  expect(calls).toContain('restore:hobby')
})

it('hides archived categories from new entry but keeps an existing entry’s category', async () => {
  const categories: Category[] = [node('food', 'Food'), hobby]
  const first = render(<CategorySelect label="Category" categories={categories} />)
  expect(screen.queryByRole('option', { name: /Old hobby/ })).not.toBeInTheDocument()
  first.unmount()
  const second = render(<CategorySelect label="Category" categories={categories} keepId="hobby" defaultValue="hobby" />)
  expect(screen.getByRole('option', { name: 'Old hobby (archived)' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('hobby'))
  second.unmount()
  render(<CategorySelect label="Category" categories={categories} showArchived />)
  expect(screen.getByRole('option', { name: 'Old hobby (archived)' })).toBeInTheDocument()
})
