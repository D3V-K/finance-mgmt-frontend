const locale = () => typeof navigator === 'undefined' ? 'en-US' : navigator.language

export function formatJPY(amount: number) {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
