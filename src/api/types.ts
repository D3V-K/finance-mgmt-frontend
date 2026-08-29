export type UUID = string
export type ISODate = string
export type ISODateTime = string

export type CategoryType = 'income' | 'expense'

export interface Category {
  id: UUID
  user_id: UUID
  name: string
  type: CategoryType
  color: string | null
  parent_id: UUID | null
  created_at: ISODateTime
}

export interface CategoryTree extends Category {
  children: CategoryTree[]
}

export interface CategoryCreateDto {
  name: string
  type: CategoryType
  color?: string | null
  parent_id?: UUID | null
}

export type CategoryUpdateDto = Partial<CategoryCreateDto>

export interface Transaction {
  id: UUID
  user_id: UUID
  amount: number
  description: string | null
  category_id: UUID
  transaction_date: ISODate
  created_at: ISODateTime
}

export interface TransactionCreateDto {
  amount: number
  description?: string | null
  category_id: UUID
  transaction_date: ISODate
}

export type TransactionUpdateDto = Partial<TransactionCreateDto>

export interface DateRangeFilter {
  from?: ISODate
  to?: ISODate
}

export interface TransactionFilter extends DateRangeFilter {
  category_id?: UUID
  type?: CategoryType
  search?: string
  page?: number
  page_size?: number
}

// Reserved for endpoints that opt into pagination. Current backend list routes return arrays.
export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface MonthlyReport {
  month: ISODate
  income: number
  expense: number
}

export interface CategoryReport {
  category_id: UUID
  category_name: string
  total: number
}

export interface NetWorthPoint {
  month: ISODate
  net_worth: number
}
