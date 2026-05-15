import type { Game } from '../types'

export function getTimeToBeatHours(game: Game): number | null {
  if (typeof game.igdbTtbNormallySeconds === 'number' && Number.isFinite(game.igdbTtbNormallySeconds)) {
    return secondsToRoundedHours(game.igdbTtbNormallySeconds)
  }

  const seconds = [
    game.igdbTtbHastilySeconds,
    game.igdbTtbNormallySeconds,
    game.igdbTtbCompletelySeconds,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  if (seconds.length === 0) {
    return null
  }

  const sorted = [...seconds].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const medianSeconds =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle]

  return secondsToRoundedHours(medianSeconds)
}

function secondsToRoundedHours(seconds: number) {
  const hours = seconds / 3600

  return hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)
}
