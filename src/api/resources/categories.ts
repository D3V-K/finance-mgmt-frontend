import { apiClient } from '@/api/client'
import type { Category, CategoryCreateDto, CategoryTree, CategoryUpdateDto, UUID } from '@/api/types'

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

export const categoriesApi = {
  async list() {
    const response = await apiClient.get<unknown>('/categories')
    return unwrapCategories<Category>(response.data)
  },
  async tree() {
    const response = await apiClient.get<unknown>('/categories/tree')
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
}
