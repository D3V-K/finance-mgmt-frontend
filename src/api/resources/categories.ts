import { apiClient } from '@/api/client'
import type { Category, CategoryCreateDto, CategoryTree, CategoryUpdateDto, UUID } from '@/api/types'

export const categoriesApi = {
  async list() {
    return (await apiClient.get<Category[]>('/categories')).data
  },
  async tree() {
    return (await apiClient.get<CategoryTree[]>('/categories/tree')).data
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
