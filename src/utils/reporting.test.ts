import { buildTrendData, isValidISODate, monthKeys, presetRange, tokyoToday } from '@/utils/reporting'

describe('reporting date ranges and transformations', () => {
  it('calculates presets using inclusive Tokyo calendar dates', () => {
    expect(tokyoToday(new Date('2026-08-28T15:30:00Z'))).toBe('2026-08-29')
    expect(presetRange('3m', '2026-08-29')).toEqual({ from: '2026-06-01', to: '2026-08-29' })
    expect(presetRange('ytd', '2026-08-29')).toEqual({ from: '2026-01-01', to: '2026-08-29' })
  })

  it('validates real ISO calendar dates and ordered month ranges', () => {
    expect(isValidISODate('2024-02-29')).toBe(true)
    expect(isValidISODate('2026-02-29')).toBe(false)
    expect(monthKeys('2026-03-01', '2026-01-01')).toEqual([])
  })

  it('retains missing and partial periods without manufacturing zero values', () => {
    expect(buildTrendData([{ month: '2026-02-01', income: 100, expense: 40 }], '2026-01-15', '2026-03-12')).toEqual([
      { month: '2026-01', income: null, expense: null, net: null, partial: true },
      { month: '2026-02', income: 100, expense: 40, net: 60, partial: false },
      { month: '2026-03', income: null, expense: null, net: null, partial: true },
    ])
  })
})
