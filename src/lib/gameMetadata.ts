import type { Game } from '../types'

export function getDisplayDeveloper(game: Game) {
  return normalizedText(game.developer)
}

export function getDisplayPublisher(game: Game) {
  return normalizedText(game.publisher)
}

export function normalizeReleaseYear(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsedYear = Number.parseInt(trimmed.replace(/[^\d]/g, ''), 10)
  const nextYear = new Date().getFullYear() + 1

  return Number.isInteger(parsedYear) && parsedYear >= 1970 && parsedYear <= nextYear
    ? parsedYear
    : null
}

function normalizedText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}
