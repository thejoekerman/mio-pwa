import type { Game, Journey } from '../types'

export interface FinishedJourneyEntry {
  game: Game
  journey: Journey
  isReplay: boolean
  journeyNumber: number
}

export function getFinishedJourneyEntries(games: Game[], journeys: Journey[]): FinishedJourneyEntry[] {
  const gameById = new Map(
    games
      .filter((game) => game.deletedAt === null)
      .map((game) => [game.id, game]),
  )
  const visibleByGameId = new Map<string, Journey[]>()

  for (const journey of journeys) {
    if (journey.deletedAt !== null || !gameById.has(journey.gameId)) {
      continue
    }

    const gameJourneys = visibleByGameId.get(journey.gameId) ?? []
    gameJourneys.push(journey)
    visibleByGameId.set(journey.gameId, gameJourneys)
  }

  return [...visibleByGameId.entries()].flatMap(([gameId, gameJourneys]) => {
    const game = gameById.get(gameId)

    if (!game) {
      return []
    }

    const ordered = [...gameJourneys].sort(
      (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    )

    return ordered.flatMap((journey, index) =>
      journey.status === 'finished'
        ? [{
            game,
            journey,
            isReplay: index > 0,
            journeyNumber: index + 1,
          }]
        : [],
    )
  })
}

export function getFinishedJourneyYears(entries: FinishedJourneyEntry[]) {
  return [...new Set(
    entries
      .map(({ journey }) => journey.finishedAt?.slice(0, 4) ?? '')
      .filter(Boolean),
  )].sort((left, right) => right.localeCompare(left))
}

export function projectJourneyGame(entry: FinishedJourneyEntry): Game {
  return {
    ...entry.game,
    status: entry.journey.status,
    rating: entry.journey.rating,
    playTimeHours: entry.journey.playTimeHours,
    review: entry.journey.review,
    platform: entry.journey.platform,
    ownershipType: entry.journey.ownershipType,
    priority: entry.journey.priority,
    finishedAt: entry.journey.finishedAt,
    pausedAt: entry.journey.pausedAt,
    nudgeAt: entry.journey.nudgeAt,
    updatedAt: entry.journey.updatedAt > entry.game.updatedAt
      ? entry.journey.updatedAt
      : entry.game.updatedAt,
  }
}
