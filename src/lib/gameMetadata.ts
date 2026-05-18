import type { Game } from '../types'

export function getDisplayDeveloper(game: Game) {
  return normalizedText(game.developer) || normalizedList(game.igdbDevelopers)
}

export function getDisplayPublisher(game: Game) {
  return normalizedText(game.publisher) || normalizedList(game.igdbPublishers)
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

function normalizedList(value: string[] | null | undefined) {
  return Array.isArray(value)
    ? value
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ')
    : ''
}
