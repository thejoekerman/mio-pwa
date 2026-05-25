export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function isOffline(): boolean {
  return !isOnline()
}
