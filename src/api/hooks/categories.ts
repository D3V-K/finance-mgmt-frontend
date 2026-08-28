import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportKeys } from '@/api/hooks/reports'
import { transactionKeys } from '@/api/hooks/transactions'
import { categoriesApi } from '@/api/resources/categories'
import type { CategoryCreateDto, CategoryUpdateDto, UUID } from '@/api/types'

export const categoryKeys = {
  all: ['categories'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
}

export function useCategories() {
  return useQuery({ queryKey: categoryKeys.list(), queryFn: categoriesApi.list })
}

export function useCategoryTree() {
  return useQuery({ queryKey: categoryKeys.tree(), queryFn: categoriesApi.tree })
}

export function useCreateCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: CategoryCreateDto) => categoriesApi.create(payload),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: categoryKeys.all }),
      client.invalidateQueries({ queryKey: transactionKeys.all }),
      client.invalidateQueries({ queryKey: reportKeys.all }),
    ]),
  })
}

export function useUpdateCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: UUID; payload: CategoryUpdateDto }) => categoriesApi.update(id, payload),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: categoryKeys.all }),
      client.invalidateQueries({ queryKey: transactionKeys.all }),
      client.invalidateQueries({ queryKey: reportKeys.all }),
    ]),
  })
}

export function useDeleteCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: UUID) => categoriesApi.remove(id),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: categoryKeys.all }),
      client.invalidateQueries({ queryKey: transactionKeys.all }),
      client.invalidateQueries({ queryKey: reportKeys.all }),
    ]),
  })
}
