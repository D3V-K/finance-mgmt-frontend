import { http, HttpResponse } from 'msw'

export const categoryFixture = {
  id: 'category-1', user_id: 'test-user', name: 'Groceries', type: 'expense' as const,
  color: '#e11d48', parent_id: null, created_at: '2026-08-01T00:00:00Z', children: [],
}

export const transactionFixture = {
  id: 'transaction-1', user_id: 'test-user', amount: 2500, description: 'Weekly shop',
  category_id: categoryFixture.id, transaction_date: '2026-08-20', created_at: '2026-08-20T00:00:00Z',
}

export const handlers = [
  http.get('*/categories', () => HttpResponse.json([categoryFixture])),
  http.get('*/categories/tree', () => HttpResponse.json([categoryFixture])),
  http.get('*/transactions', () => HttpResponse.json({ items: [transactionFixture], total: 1, page: 1, page_size: 20, total_pages: 1 })),
  http.post('*/transactions', async ({ request }) => HttpResponse.json({ ...transactionFixture, ...await request.json() as Record<string, unknown> }, { status: 201 })),
  http.put('*/transactions/:id', async ({ request }) => HttpResponse.json({ ...transactionFixture, ...await request.json() as Record<string, unknown> })),
  http.delete('*/transactions/:id', () => new HttpResponse(null, { status: 204 })),
  http.get('*/reports/monthly', () => HttpResponse.json([{ month: '2026-08-01', income: 300000, expense: 80000 }])),
  http.get('*/reports/by-category', () => HttpResponse.json([{ category_id: categoryFixture.id, category_name: categoryFixture.name, total: 80000 }])),
]
