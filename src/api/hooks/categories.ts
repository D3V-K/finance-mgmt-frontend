import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateFor } from '@/api/invalidation'
import { categoriesApi } from '@/api/resources/categories'
import type { CategoryCreateDto, CategoryUpdateDto, UUID } from '@/api/types'
import { isFeatureEnabled } from '@/config/features'

// Archived categories are only requested where the deployment supports archival.
const withArchived = (includeArchived: boolean) => includeArchived && isFeatureEnabled('category-archive')

export const categoryKeys = {
  all: ['categories'] as const,
  list: (includeArchived = false) => includeArchived ? [...categoryKeys.all, 'list', { includeArchived }] as const : [...categoryKeys.all, 'list'] as const,
  tree: (includeArchived = false) => includeArchived ? [...categoryKeys.all, 'tree', { includeArchived }] as const : [...categoryKeys.all, 'tree'] as const,
}

/** Pass includeArchived to resolve names on history; new-entry selectors use the default active list. */
export function useCategories(includeArchived = false) {
  const archived = withArchived(includeArchived)
  return useQuery({ queryKey: categoryKeys.list(archived), queryFn: () => categoriesApi.list({ includeArchived: archived }) })
}

export function useCategoryTree(includeArchived = false) {
  const archived = withArchived(includeArchived)
  return useQuery({ queryKey: categoryKeys.tree(archived), queryFn: () => categoriesApi.tree({ includeArchived: archived }) })
}

export function useCreateCategory() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (payload: CategoryCreateDto) => categoriesApi.create(payload), onSuccess: () => invalidateFor(client, 'category') })
}

export function useUpdateCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: CategoryUpdateDto }) => categoriesApi.update(id, payload),
    onSuccess: () => invalidateFor(client, 'category'),
  })
}

export function useDeleteCategory() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => categoriesApi.remove(id), onSuccess: () => invalidateFor(client, 'category') })
}

export function useArchiveCategory() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => categoriesApi.archive(id), onSuccess: () => invalidateFor(client, 'category') })
}

export function useRestoreCategory() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: UUID) => categoriesApi.restore(id), onSuccess: () => invalidateFor(client, 'category') })
}
