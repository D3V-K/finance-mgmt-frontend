export type UUID = string
export type ISODate = string
export type ISODateTime = string

export type AccountType = 'cash' | 'bank'

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
  account_type: AccountType
  id: UUID
  user_id: UUID
  amount: number
  description: string | null
  category_id: UUID
  transaction_date: ISODate
  created_at: ISODateTime
}

export interface TransactionCreateDto {
  account_type: AccountType
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

// The wire field retains the backend compatibility name.
export interface NetBalancePoint {
  month: ISODate
  net_worth: number
}

export interface OpeningBalanceUpsertDto {
  amount: number
  as_of_date: ISODate
}

export interface OpeningBalance extends OpeningBalanceUpsertDto {
  id: UUID
  user_id: UUID
  account_type: AccountType
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface TransferCreateDto {
  from_account: AccountType
  to_account: AccountType
  amount: number
  transfer_date: ISODate
  description?: string | null
}

export interface Transfer extends TransferCreateDto {
  id: UUID
  user_id: UUID
  created_at: ISODateTime
  description: string | null
}

export interface TransferFilter extends DateRangeFilter, PaginationParams {}

export type NetWorthPoint = NetBalancePoint

export interface AccountBalance {
  cash_balance: number
  bank_balance: number
  total_balance: number
}

export type CurrentBalance = AccountBalance
