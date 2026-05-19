export function isAtLeastDaysOld(value: string | null, days: number): boolean {
  if (!value) {
    return true
  }

  const timestamp = new Date(value).getTime()

  if (!Number.isFinite(timestamp)) {
    return true
  }

  return Date.now() - timestamp >= days * 24 * 60 * 60 * 1000
}

export function getNextUpdatedAt(previousUpdatedAt?: string | null): string {
  const now = Date.now()
  const previous = previousUpdatedAt ? new Date(previousUpdatedAt).getTime() : Number.NaN

  if (Number.isFinite(previous) && now <= previous) {
    return new Date(previous + 1000).toISOString()
  }

  return new Date(now).toISOString()
}
