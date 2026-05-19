export function getSyncErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return fallback
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
