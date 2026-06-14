import type {
  CanonicalGame,
  Game,
  Journey,
  JourneyLogEntry,
  LogEntry,
} from '../types'

export interface GameJourneyMigration {
  games: CanonicalGame[]
  journeys: Journey[]
  logs: JourneyLogEntry[]
}

export type LegacyGame = Game & {
  igdbId?: number | null
  igdbUrl?: string | null
  igdbTtbHastilySeconds?: number | null
  igdbTtbNormallySeconds?: number | null
  igdbTtbCompletelySeconds?: number | null
  igdbTtbCount?: number | null
  igdbTtbUpdatedAt?: string | null
  igdbDevelopers?: string[] | null
  igdbPublishers?: string[] | null
  igdbThemes?: string[] | null
  igdbGameModes?: string[] | null
}

export function initialJourneyIdForGame(gameId: string) {
  return `${gameId}:initial-journey`
}

export function migrateLegacyLibrary(
  legacyGames: LegacyGame[],
  legacyLogs: LogEntry[],
): GameJourneyMigration {
  const journeyIdByGameId = new Map(
    legacyGames.map((game) => [game.id, initialJourneyIdForGame(game.id)]),
  )

  return {
    games: legacyGames.map(migrateLegacyGame),
    journeys: legacyGames.map(migrateLegacyJourney),
    logs: legacyLogs.map((log) => migrateLegacyLog(log, journeyIdByGameId)),
  }
}

export function migrateLegacyGame(game: LegacyGame): CanonicalGame {
  return {
    id: game.id,
    title: game.title,
    releaseYear: game.releaseYear ?? null,
    developers: visibleCredits(game.developer),
    publishers: visibleCredits(game.publisher),
    genres: [],
    themes: [],
    gameModes: [],
    tags: uniqueStrings(game.tags),
    cover: game.coverUrl
      ? {
          url: game.coverUrl,
          source: {
            provider: 'manual',
            pageUrl: null,
          },
        }
      : null,
    externalReferences: [],
    playtimeEstimates: null,
    metadataReviewedAt: null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    deletedAt: game.deletedAt,
  }
}

export function migrateLegacyJourney(game: LegacyGame): Journey {
  return {
    id: initialJourneyIdForGame(game.id),
    gameId: game.id,
    status: game.status,
    platform: game.platform,
    ownershipType: game.ownershipType,
    priority: game.priority ?? null,
    rating: game.rating,
    review: game.review,
    playTimeHours: game.playTimeHours,
    startedAt: null,
    finishedAt: game.finishedAt,
    pausedAt: game.pausedAt ?? null,
    nudgeAt: game.nudgeAt ?? null,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    deletedAt: game.deletedAt,
  }
}

export function migrateLegacyLog(
  log: LogEntry,
  journeyIdByGameId: ReadonlyMap<string, string>,
): JourneyLogEntry {
  const journeyId = journeyIdByGameId.get(log.gameId)

  if (!journeyId) {
    throw new Error(`Cannot migrate log "${log.id}" without its game "${log.gameId}".`)
  }

  return {
    id: log.id,
    journeyId,
    content: log.content,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    deletedAt: log.deletedAt,
  }
}

function visibleCredits(manualValue: string | null | undefined) {
  const manualCredit = manualValue?.trim()

  return manualCredit ? [manualCredit] : []
}

function uniqueStrings(values: string[]) {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value !== ''),
    ),
  ]
}
