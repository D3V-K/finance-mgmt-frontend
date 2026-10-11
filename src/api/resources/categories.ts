import { apiClient } from '@/api/client'
import type { Category, CategoryCreateDto, CategoryTree, CategoryUpdateDto, UUID } from '@/api/types'
import { requireFeature } from '@/config/features'

const PAGE_SIZE = 100

function unwrapCategories<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []
  const response = payload as Record<string, unknown>
  for (const key of ['items', 'categories', 'data']) {
    const value = response[key]
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object') {
      const nested = unwrapCategories<T>(value)
      if (nested.length > 0) return nested
    }
  }
  return []
}

function totalPages(payload: unknown) {
  const value = payload && typeof payload === 'object' ? (payload as { total_pages?: unknown }).total_pages : undefined
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 1
}

export interface CategoryListOptions { includeArchived?: boolean }

const archiveParams = ({ includeArchived }: CategoryListOptions) => includeArchived ? { include_archived: true } : {}

export const categoriesApi = {
  /** Reads every page so selectors and name lookups never silently miss categories beyond the first page. */
  async list(options: CategoryListOptions = {}) {
    const first = await apiClient.get<unknown>('/categories', { params: { ...archiveParams(options), page: 1, page_size: PAGE_SIZE } })
    const items = unwrapCategories<Category>(first.data)
    for (let page = 2; page <= totalPages(first.data); page += 1) {
      const next = await apiClient.get<unknown>('/categories', { params: { ...archiveParams(options), page, page_size: PAGE_SIZE } })
      items.push(...unwrapCategories<Category>(next.data))
    }
    return items
  },
  async tree(options: CategoryListOptions = {}) {
    const response = options.includeArchived
      ? await apiClient.get<unknown>('/categories/tree', { params: archiveParams(options) })
      : await apiClient.get<unknown>('/categories/tree')
    return unwrapCategories<CategoryTree>(response.data)
  },
  async create(payload: CategoryCreateDto) {
    return (await apiClient.post<Category>('/categories', payload)).data
  },
  async update(id: UUID, payload: CategoryUpdateDto) {
    return (await apiClient.put<Category>(`/categories/${id}`, payload)).data
  },
  async remove(id: UUID) {
    await apiClient.delete(`/categories/${id}`)
  },
  /** Hides a category from new entry while keeping it on every historical record and report. */
  async archive(id: UUID) {
    requireFeature('category-archive')
    return (await apiClient.post<Category>(`/categories/${id}/archive`)).data
  },
  async restore(id: UUID) {
    requireFeature('category-archive')
    return (await apiClient.post<Category>(`/categories/${id}/restore`)).data
  },
}
