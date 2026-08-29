import type { MonthlyReport } from '@/api/types'

export type ReportPreset = '3m' | '6m' | '12m' | 'ytd' | 'custom'

export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/

export function isValidISODate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function tokyoToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function shiftMonthStart(date: string, offset: number) {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10)
}

export function presetRange(preset: Exclude<ReportPreset, 'custom'>, today = tokyoToday()) {
  if (preset === 'ytd') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  const months = { '3m': 3, '6m': 6, '12m': 12 }[preset]
  return { from: shiftMonthStart(today, -(months - 1)), to: today }
}

export function monthKeys(from: string, to: string) {
  if (!isValidISODate(from) || !isValidISODate(to) || from > to) return []
  const keys: string[] = []
  let cursor = `${from.slice(0, 7)}-01`
  const last = `${to.slice(0, 7)}-01`
  while (cursor <= last) {
    keys.push(cursor.slice(0, 7))
    cursor = shiftMonthStart(cursor, 1)
  }
  return keys
}

export type TrendPoint = { month: string; income: number | null; expense: number | null; net: number | null; partial: boolean }

export function buildTrendData(reports: MonthlyReport[], from: string, to: string): TrendPoint[] {
  const reportsByMonth = new Map(reports.map((report) => [report.month.slice(0, 7), report]))
  return monthKeys(from, to).map((month) => {
    const report = reportsByMonth.get(month)
    const income = report?.income ?? null
    const expense = report?.expense ?? null
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    return { month, income, expense, net: income === null || expense === null ? null : income - expense, partial: from > `${month}-01` || to < monthEnd }
  })
}
