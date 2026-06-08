import Dexie, { type EntityTable } from 'dexie'
import {
  GAME_OWNERSHIP_TYPES,
  GAME_PRIORITIES,
  GAME_STATUSES,
  type BackupData,
  type BackupImportMode,
  type CanonicalGame,
  type EarnedTrophy,
  type ExternalReference,
  type Game,
  type GameArtwork,
  type Journey,
  type JourneyLogEntry,
  type LogEntry,
  type PlaytimeEstimates,
  type SyncSnapshot,
} from '../types'
import { isDemoMode } from './appMode'
import { demoGames, demoLogs } from './demoData'
import {
  initialJourneyIdForGame,
  migrateLegacyGame,
  migrateLegacyJourney,
  migrateLegacyLibrary,
} from './gameJourneyMigration'
import { getCurrentJourney } from './gameJourneyState'

type StoredGame = Omit<Game, 'ownershipType'> & {
  notes?: string
  ownershipType?: unknown
}

const BACKUP_VERSION = 11

export class BacklogDatabase extends Dexie {
  games!: EntityTable<CanonicalGame, 'id'>
  journeys!: EntityTable<Journey, 'id'>
  logs!: EntityTable<JourneyLogEntry, 'id'>
  earnedTrophies!: EntityTable<EarnedTrophy, 'id'>

  constructor(databaseName = isDemoMode ? 'miolog-demo-backlog' : 'games-backlog') {
    super(databaseName)

    // Keep schema explicit so future migrations stay easy to reason about.
    this.version(1).stores({
      games: 'id, updatedAt, status, title',
      logs: 'id, gameId, createdAt',
    })

    this.version(2)
      .stores({
        games: 'id, updatedAt, status, title',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.review !== 'string') {
              game.review = game.notes ?? ''
            }

            delete game.notes
          })
      })

    this.version(3)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.finishedAt !== 'string') {
              game.finishedAt = null
            }
          })
      })

    this.version(4)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt',
        logs: 'id, gameId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredGame, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.playTimeHours !== 'number' || !Number.isFinite(game.playTimeHours)) {
              game.playTimeHours = null
            }
          })
      })

    this.version(5)
      .stores({
        games: 'id, updatedAt, status, title, finishedAt, deletedAt',
        logs: 'id, gameId, createdAt, updatedAt, deletedAt',
        earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Game, 'id'>('games')
          .toCollection()
          .modify((game) => {
            if (typeof game.deletedAt !== 'string') {
              game.deletedAt = null
            }
          })

        await transaction
          .table<LogEntry, 'id'>('logs')
          .toCollection()
          .modify((logEntry) => {
            if (typeof logEntry.updatedAt !== 'string') {
              logEntry.updatedAt = logEntry.createdAt
            }

            if (typeof logEntry.deletedAt !== 'string') {
              logEntry.deletedAt = null
            }
          })
      })

    this.version(6).stores({
      games: 'id, updatedAt, status, title, finishedAt, deletedAt',
      logs: 'id, gameId, createdAt, updatedAt, deletedAt',
      earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
    })

    this.version(7)
      .stores({
        games: 'id, updatedAt, title, deletedAt',
        journeys: 'id, gameId, updatedAt, status, deletedAt',
        logs: 'id, journeyId, createdAt, updatedAt, deletedAt',
        earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
      })
      .upgrade(async (transaction) => {
        const legacyGames = (await transaction.table<StoredGame, 'id'>('games').toArray())
          .map(normalizeStoredGame)
        const legacyLogs = (await transaction.table<LogEntry, 'id'>('logs').toArray())
          .map(normalizeStoredLogEntry)
        const migration = migrateLegacyLibrary(legacyGames, legacyLogs)

        await transaction.table('games').clear()
        await transaction.table('logs').clear()

        if (migration.games.length > 0) {
          await transaction.table('games').bulkPut(migration.games)
          await transaction.table('journeys').bulkPut(migration.journeys)
        }

        if (migration.logs.length > 0) {
          await transaction.table('logs').bulkPut(migration.logs)
        }
      })
  }
}

const db = new BacklogDatabase()

function normalizeStoredGame(game: StoredGame): Game {
  return {
    ...game,
    playTimeHours:
      typeof game.playTimeHours === 'number' && Number.isFinite(game.playTimeHours)
        ? game.playTimeHours
        : null,
    review: game.review ?? game.notes ?? '',
    ownershipType: asNullableOwnershipType(game.ownershipType),
    igdbId:
      typeof game.igdbId === 'number' && Number.isInteger(game.igdbId) && game.igdbId > 0
        ? game.igdbId
        : null,
    igdbUrl: typeof game.igdbUrl === 'string' ? game.igdbUrl : null,
    igdbTtbHastilySeconds: asNullablePositiveInteger(game.igdbTtbHastilySeconds),
    igdbTtbNormallySeconds: asNullablePositiveInteger(game.igdbTtbNormallySeconds),
    igdbTtbCompletelySeconds: asNullablePositiveInteger(game.igdbTtbCompletelySeconds),
    igdbTtbCount: asNullableNonNegativeInteger(game.igdbTtbCount),
    igdbTtbUpdatedAt: typeof game.igdbTtbUpdatedAt === 'string' ? game.igdbTtbUpdatedAt : null,
    igdbDevelopers: asNullableStringList(game.igdbDevelopers),
    igdbPublishers: asNullableStringList(game.igdbPublishers),
    igdbThemes: asNullableStringList(game.igdbThemes),
    igdbGameModes: asNullableStringList(game.igdbGameModes),
    releaseYear: asNullableReleaseYear(game.releaseYear),
    priority: asNullablePriority(game.priority),
    developer: asNullableString(game.developer),
    publisher: asNullableString(game.publisher),
    coverUrl: typeof game.coverUrl === 'string' ? game.coverUrl : null,
    finishedAt: typeof game.finishedAt === 'string' ? game.finishedAt : null,
    pausedAt: typeof game.pausedAt === 'string' ? game.pausedAt : null,
    nudgeAt: typeof game.nudgeAt === 'string' ? game.nudgeAt : null,
    deletedAt: typeof game.deletedAt === 'string' ? game.deletedAt : null,
  }
}

function normalizeStoredLogEntry(logEntry: LogEntry): LogEntry {
  return {
    ...logEntry,
    updatedAt: typeof logEntry.updatedAt === 'string' ? logEntry.updatedAt : logEntry.createdAt,
    deletedAt: typeof logEntry.deletedAt === 'string' ? logEntry.deletedAt : null,
  }
}

function projectGame(game: CanonicalGame, journeys: Journey[], includeDeleted = false): Game | null {
  const currentJourney = getCurrentJourney(journeys)
    ?? (includeDeleted ? newestJourneyIncludingDeleted(journeys) : null)

  if (!currentJourney) {
    return null
  }

  return {
    id: game.id,
    title: game.title,
    status: currentJourney.status,
    rating: currentJourney.rating,
    playTimeHours: currentJourney.playTimeHours,
    review: currentJourney.review,
    platform: currentJourney.platform,
    ownershipType: currentJourney.ownershipType,
    tags: game.tags,
    igdbId: null,
    igdbUrl: null,
    igdbTtbHastilySeconds: null,
    igdbTtbNormallySeconds: null,
    igdbTtbCompletelySeconds: null,
    igdbTtbCount: null,
    igdbTtbUpdatedAt: null,
    igdbDevelopers: null,
    igdbPublishers: null,
    igdbThemes: null,
    igdbGameModes: null,
    releaseYear: game.releaseYear,
    priority: currentJourney.priority,
    developer: game.developers[0] ?? null,
    publisher: game.publishers[0] ?? null,
    finishedAt: currentJourney.finishedAt,
    pausedAt: currentJourney.pausedAt,
    nudgeAt: currentJourney.nudgeAt,
    createdAt: game.createdAt,
    coverUrl: game.cover?.url ?? null,
    updatedAt:
      currentJourney.updatedAt > game.updatedAt
        ? currentJourney.updatedAt
        : game.updatedAt,
    deletedAt: game.deletedAt,
  }
}

function newestJourneyIncludingDeleted(journeys: Journey[]) {
  return journeys.reduce<Journey | null>(
    (newest, journey) => !newest || journey.updatedAt > newest.updatedAt ? journey : newest,
    null,
  )
}

function projectLog(
  log: JourneyLogEntry,
  gameIdByJourneyId: ReadonlyMap<string, string>,
): LogEntry | null {
  const gameId = gameIdByJourneyId.get(log.journeyId)

  return gameId
    ? {
        id: log.id,
        gameId,
        content: log.content,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
        deletedAt: log.deletedAt,
      }
    : null
}

function projectLegacyGameToCanonical(game: Game, existing?: CanonicalGame): CanonicalGame {
  const migrated = migrateLegacyGame(game)

  if (!existing) {
    return migrated
  }

  return {
    ...existing,
    title: game.title,
    releaseYear: game.releaseYear ?? null,
    developers:
      game.developer === (existing.developers[0] ?? null)
        ? existing.developers
        : migrated.developers,
    publishers:
      game.publisher === (existing.publishers[0] ?? null)
        ? existing.publishers
        : migrated.publishers,
    tags: migrated.tags,
    cover:
      game.coverUrl === (existing.cover?.url ?? null)
        ? existing.cover
        : migrated.cover,
    updatedAt: game.updatedAt,
    deletedAt: game.deletedAt,
  }
}

function projectLegacyGameToJourney(game: Game, existing?: Journey | null): Journey {
  return {
    ...migrateLegacyJourney(game),
    id: existing?.id ?? initialJourneyIdForGame(game.id),
    startedAt: existing?.startedAt ?? null,
    createdAt: existing?.createdAt ?? game.createdAt,
  }
}

export async function getAllGames(includeDeleted = false) {
  const [games, journeys] = await Promise.all([
    db.games.orderBy('updatedAt').reverse().toArray(),
    db.journeys.toArray(),
  ])
  const projectedGames = games
    .map((game) => projectGame(
      game,
      journeys.filter((journey) => journey.gameId === game.id),
      includeDeleted,
    ))
    .filter((game): game is Game => game !== null)

  return includeDeleted
    ? projectedGames
    : projectedGames.filter((game) => game.deletedAt === null)
}

export async function getAllLogs(includeDeleted = false) {
  const [logs, journeys] = await Promise.all([db.logs.toArray(), db.journeys.toArray()])
  const gameIdByJourneyId = new Map(journeys.map((journey) => [journey.id, journey.gameId]))
  const projectedLogs = logs
    .map((log) => projectLog(log, gameIdByJourneyId))
    .filter((log): log is LogEntry => log !== null)

  return includeDeleted
    ? projectedLogs
    : projectedLogs.filter((logEntry) => logEntry.deletedAt === null)
}

export async function getAllEarnedTrophies(includeDeleted = false) {
  const trophies = await db.earnedTrophies.orderBy('updatedAt').reverse().toArray()
  const normalizedTrophies = trophies.map(normalizeEarnedTrophy)

  return includeDeleted
    ? normalizedTrophies
    : normalizedTrophies.filter((trophy) => trophy.deletedAt === null)
}

export async function saveGame(game: Game) {
  await db.transaction('rw', db.games, db.journeys, async () => {
    const existingGame = await db.games.get(game.id)
    const existingJourneys = await db.journeys.where('gameId').equals(game.id).toArray()
    const currentJourney = getCurrentJourney(existingJourneys)

    await db.games.put(projectLegacyGameToCanonical(game, existingGame))
    await db.journeys.put(projectLegacyGameToJourney(game, currentJourney))
  })
}

export async function deleteGame(gameId: string) {
  await db.transaction('rw', db.games, db.journeys, db.logs, async () => {
    const now = new Date().toISOString()
    const game = await db.games.get(gameId)

    if (!game) {
      return
    }

    await db.games.put({
      ...game,
      updatedAt: now,
      deletedAt: now,
    })

    const journeys = await db.journeys.where('gameId').equals(gameId).toArray()
    const journeyIds = journeys.map((journey) => journey.id)

    if (journeys.length > 0) {
      await db.journeys.bulkPut(
        journeys.map((journey) => ({
          ...journey,
          updatedAt: now,
          deletedAt: now,
        })),
      )
    }

    for (const journeyId of journeyIds) {
      const logs = await db.logs.where('journeyId').equals(journeyId).toArray()

      if (logs.length > 0) {
        await db.logs.bulkPut(
          logs.map((logEntry) => ({
            ...logEntry,
            updatedAt: now,
            deletedAt: now,
          })),
        )
      }
    }
  })
}

export async function getLogsForGame(gameId: string) {
  const journeys = await db.journeys.where('gameId').equals(gameId).toArray()
  const journeyIds = new Set(journeys.map((journey) => journey.id))
  const logs = (await db.logs.toArray())
    .filter((log) => journeyIds.has(log.journeyId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  return logs
    .map((log) => projectLog(log, new Map(journeys.map((journey) => [journey.id, journey.gameId]))))
    .filter((log): log is LogEntry => log !== null)
    .filter((logEntry) => logEntry.deletedAt === null)
    .reverse()
}

export async function getLogsForJourney(journeyId: string) {
  const journey = await db.journeys.get(journeyId)

  if (!journey) {
    return []
  }

  const logs = await db.logs.where('journeyId').equals(journeyId).sortBy('createdAt')

  return logs
    .filter((logEntry) => logEntry.deletedAt === null)
    .map((logEntry) => ({
      id: logEntry.id,
      gameId: journey.gameId,
      content: logEntry.content,
      createdAt: logEntry.createdAt,
      updatedAt: logEntry.updatedAt,
      deletedAt: logEntry.deletedAt,
    }))
    .reverse()
}

export async function saveLogEntry(logEntry: LogEntry) {
  const journeys = await db.journeys.where('gameId').equals(logEntry.gameId).toArray()
  const currentJourney = getCurrentJourney(journeys)

  if (!currentJourney) {
    throw new Error(`Cannot save log "${logEntry.id}" without a Journey for game "${logEntry.gameId}".`)
  }

  await db.logs.put({
    id: logEntry.id,
    journeyId: currentJourney.id,
    content: logEntry.content,
    createdAt: logEntry.createdAt,
    updatedAt: logEntry.updatedAt,
    deletedAt: logEntry.deletedAt,
  })
}

export async function saveLogEntryForJourney(logEntry: LogEntry, journeyId: string) {
  const journey = await db.journeys.get(journeyId)

  if (!journey || journey.gameId !== logEntry.gameId) {
    throw new Error(`Cannot save log "${logEntry.id}" without matching Journey "${journeyId}".`)
  }

  await db.logs.put({
    id: logEntry.id,
    journeyId,
    content: logEntry.content,
    createdAt: logEntry.createdAt,
    updatedAt: logEntry.updatedAt,
    deletedAt: logEntry.deletedAt,
  })
}

export async function saveEarnedTrophies(earnedTrophies: EarnedTrophy[]) {
  if (earnedTrophies.length === 0) {
    return
  }

  await db.earnedTrophies.bulkPut(earnedTrophies)
}

export async function ensureDemoData() {
  if (!isDemoMode) {
    return
  }

  const gameCount = await db.games.count()

  if (gameCount > 0) {
    return
  }

  await resetDemoData()
}

export async function resetDemoData() {
  if (!isDemoMode) {
    return
  }

  await db.transaction('rw', db.games, db.journeys, db.logs, db.earnedTrophies, async () => {
    await db.games.clear()
    await db.journeys.clear()
    await db.logs.clear()
    await db.earnedTrophies.clear()
    const migration = migrateLegacyLibrary(demoGames, demoLogs)
    await db.games.bulkPut(migration.games)
    await db.journeys.bulkPut(migration.journeys)
    await db.logs.bulkPut(migration.logs)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNullableRating(value: unknown) {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
    ? value
    : null
}

function asNullablePositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function asNullableNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function asNullablePriority(value: unknown) {
  return GAME_PRIORITIES.includes(value as (typeof GAME_PRIORITIES)[number])
    ? value as (typeof GAME_PRIORITIES)[number]
    : null
}

function asNullableReleaseYear(value: unknown) {
  const nextYear = new Date().getFullYear() + 1

  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1970 &&
    value <= nextYear
    ? value
    : null
}

function asNullableOwnershipType(value: unknown): Game['ownershipType'] {
  return GAME_OWNERSHIP_TYPES.includes(value as (typeof GAME_OWNERSHIP_TYPES)[number])
    ? value as Game['ownershipType']
    : null
}

function asNullableStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    ),
  ]
}

export function normalizeGame(value: unknown): Game {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid game entry.')
  }

  const status = asString(value.status, 'backlog')

  if (!GAME_STATUSES.includes(status as (typeof GAME_STATUSES)[number])) {
    throw new Error(`Backup contains an invalid game status: ${status}`)
  }

  return {
    id: asString(value.id),
    title: asString(value.title),
    status: status as Game['status'],
    rating: asNullableRating(value.rating),
    playTimeHours:
      typeof value.playTimeHours === 'number' && Number.isFinite(value.playTimeHours)
        ? value.playTimeHours
        : null,
    review: asString(value.review, asString(value.notes)),
    platform: asString(value.platform),
    ownershipType: asNullableOwnershipType(value.ownershipType),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    igdbId:
      typeof value.igdbId === 'number' && Number.isInteger(value.igdbId) && value.igdbId > 0
        ? value.igdbId
        : null,
    igdbUrl: typeof value.igdbUrl === 'string' ? value.igdbUrl : null,
    igdbTtbHastilySeconds: asNullablePositiveInteger(value.igdbTtbHastilySeconds),
    igdbTtbNormallySeconds: asNullablePositiveInteger(value.igdbTtbNormallySeconds),
    igdbTtbCompletelySeconds: asNullablePositiveInteger(value.igdbTtbCompletelySeconds),
    igdbTtbCount: asNullableNonNegativeInteger(value.igdbTtbCount),
    igdbTtbUpdatedAt: typeof value.igdbTtbUpdatedAt === 'string' ? value.igdbTtbUpdatedAt : null,
    igdbDevelopers: asNullableStringList(value.igdbDevelopers),
    igdbPublishers: asNullableStringList(value.igdbPublishers),
    igdbThemes: asNullableStringList(value.igdbThemes),
    igdbGameModes: asNullableStringList(value.igdbGameModes),
    releaseYear: asNullableReleaseYear(value.releaseYear),
    priority: asNullablePriority(value.priority),
    developer: asNullableString(value.developer),
    publisher: asNullableString(value.publisher),
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    pausedAt: typeof value.pausedAt === 'string' ? value.pausedAt : null,
    nudgeAt: typeof value.nudgeAt === 'string' ? value.nudgeAt : null,
    createdAt: asString(value.createdAt),
    coverUrl: typeof value.coverUrl === 'string' ? value.coverUrl : null,
    updatedAt: asString(value.updatedAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeLogEntry(value: unknown): LogEntry {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid log entry.')
  }

  return {
    id: asString(value.id),
    gameId: asString(value.gameId),
    content: asString(value.content),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt, asString(value.createdAt)),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeEarnedTrophy(value: unknown): EarnedTrophy {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid trophy entry.')
  }

  const trophyId = asString(value.trophyId)
  const createdAt = asString(value.createdAt, asString(value.earnedAt))

  return {
    id: asString(value.id, trophyId ? `trophy-${trophyId}` : ''),
    trophyId,
    earnedAt: asString(value.earnedAt, createdAt),
    gameId: typeof value.gameId === 'string' ? value.gameId : null,
    context: isRecord(value.context) ? value.context : null,
    createdAt,
    updatedAt: asString(value.updatedAt, createdAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function normalizeCanonicalGame(value: unknown): CanonicalGame {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid canonical game entry.')
  }

  return {
    id: asString(value.id),
    title: asString(value.title),
    releaseYear: asNullableReleaseYear(value.releaseYear),
    developers: asNullableStringList(value.developers) ?? [],
    publishers: asNullableStringList(value.publishers) ?? [],
    genres: asNullableStringList(value.genres) ?? [],
    themes: asNullableStringList(value.themes) ?? [],
    gameModes: asNullableStringList(value.gameModes) ?? [],
    tags: asNullableStringList(value.tags) ?? [],
    cover: normalizeArtwork(value.cover),
    externalReferences: normalizeExternalReferences(value.externalReferences),
    playtimeEstimates: normalizePlaytimeEstimates(value.playtimeEstimates),
    metadataReviewedAt: typeof value.metadataReviewedAt === 'string' ? value.metadataReviewedAt : null,
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeJourney(value: unknown): Journey {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid journey entry.')
  }

  const status = asString(value.status, 'backlog')

  if (!GAME_STATUSES.includes(status as Journey['status'])) {
    throw new Error(`Backup contains an invalid journey status: ${status}`)
  }

  return {
    id: asString(value.id),
    gameId: asString(value.gameId),
    status: status as Journey['status'],
    platform: asString(value.platform),
    ownershipType: asNullableOwnershipType(value.ownershipType),
    priority: asNullablePriority(value.priority),
    rating: asNullableRating(value.rating),
    review: asString(value.review),
    playTimeHours:
      typeof value.playTimeHours === 'number' && Number.isFinite(value.playTimeHours)
        ? value.playTimeHours
        : null,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    pausedAt: typeof value.pausedAt === 'string' ? value.pausedAt : null,
    nudgeAt: typeof value.nudgeAt === 'string' ? value.nudgeAt : null,
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeJourneyLogEntry(value: unknown): JourneyLogEntry {
  if (!isRecord(value)) {
    throw new Error('Backup contains an invalid journey log entry.')
  }

  return {
    id: asString(value.id),
    journeyId: asString(value.journeyId),
    content: asString(value.content),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt, asString(value.createdAt)),
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  }
}

function normalizeArtwork(value: unknown): GameArtwork | null {
  if (!isRecord(value) || typeof value.url !== 'string' || !isRecord(value.source)) {
    return null
  }

  const provider = value.source.provider

  if (!['wikidata', 'wikipedia', 'howlongtobeat', 'manual'].includes(String(provider))) {
    return null
  }

  return {
    url: value.url,
    source: {
      provider: provider as GameArtwork['source']['provider'],
      pageUrl: typeof value.source.pageUrl === 'string' ? value.source.pageUrl : null,
    },
  }
}

function normalizeExternalReferences(value: unknown): ExternalReference[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((reference) => {
    if (!isRecord(reference)) {
      return []
    }

    const provider = String(reference.provider)

    if (!['wikidata', 'wikipedia', 'howlongtobeat'].includes(provider)) {
      return []
    }

    return [{
      provider: provider as ExternalReference['provider'],
      externalId: asString(reference.externalId),
      url: typeof reference.url === 'string' ? reference.url : null,
    }]
  })
}

function normalizePlaytimeEstimates(value: unknown): PlaytimeEstimates | null {
  if (!isRecord(value) || value.source !== 'howlongtobeat') {
    return null
  }

  const asHours = (hours: unknown) =>
    typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : null

  return {
    mainStoryHours: asHours(value.mainStoryHours),
    mainExtrasHours: asHours(value.mainExtrasHours),
    completionistHours: asHours(value.completionistHours),
    source: 'howlongtobeat',
    refreshedAt: asString(value.refreshedAt),
  }
}

export async function getAllCanonicalGames(includeDeleted = false) {
  const games = await db.games.orderBy('updatedAt').reverse().toArray()

  return includeDeleted ? games : games.filter((game) => game.deletedAt === null)
}

export async function getAllJourneys(includeDeleted = false) {
  const journeys = await db.journeys.orderBy('updatedAt').reverse().toArray()

  return includeDeleted ? journeys : journeys.filter((journey) => journey.deletedAt === null)
}

export async function getJourneysForGame(gameId: string, includeDeleted = false) {
  const journeys = await db.journeys.where('gameId').equals(gameId).toArray()
  const sortedJourneys = journeys.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  return includeDeleted
    ? sortedJourneys
    : sortedJourneys.filter((journey) => journey.deletedAt === null)
}

export async function saveJourney(journey: Journey) {
  const game = await db.games.get(journey.gameId)

  if (!game) {
    throw new Error(`Cannot save Journey "${journey.id}" without Game "${journey.gameId}".`)
  }

  await db.journeys.put(journey)
}

export async function getAllJourneyLogs(includeDeleted = false) {
  const logs = await db.logs.toArray()

  return includeDeleted ? logs : logs.filter((log) => log.deletedAt === null)
}

export async function createBackupData(): Promise<BackupData> {
  const [games, journeys, logs, earnedTrophies] = await Promise.all([
    getAllCanonicalGames(),
    getAllJourneys(),
    getAllJourneyLogs(),
    getAllEarnedTrophies(),
  ])

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    games,
    journeys,
    logs,
    earnedTrophies,
  }
}

export async function importBackupData(
  payload: unknown,
  mode: BackupImportMode,
) {
  if (!isRecord(payload)) {
    throw new Error('Backup file is not a valid object.')
  }

  const earnedTrophies = Array.isArray(payload.earnedTrophies)
    ? payload.earnedTrophies.map(normalizeEarnedTrophy)
    : []
  const isCanonicalBackup = Array.isArray(payload.journeys)
  let games: CanonicalGame[] | null = null
  let journeys: Journey[] | null = null
  let logs: JourneyLogEntry[] | null = null

  if (isCanonicalBackup) {
    games = Array.isArray(payload.games) ? payload.games.map(normalizeCanonicalGame) : null
    journeys = (payload.journeys as unknown[]).map(normalizeJourney)
    logs = Array.isArray(payload.logs) ? payload.logs.map(normalizeJourneyLogEntry) : null
  } else {
    const legacyGames = Array.isArray(payload.games) ? payload.games.map(normalizeGame) : null
    const legacyLogs = Array.isArray(payload.logs) ? payload.logs.map(normalizeLogEntry) : null

    if (legacyGames && legacyLogs) {
      const migration = migrateLegacyLibrary(legacyGames, legacyLogs)
      games = migration.games
      journeys = migration.journeys
      logs = migration.logs
    }
  }

  if (!games || !journeys || !logs) {
    throw new Error('Backup file is missing games or logs.')
  }

  const normalizedGames = dedupeById(games)
  const normalizedJourneys = dedupeById(journeys)
  const normalizedLogs = dedupeById(logs)
  const normalizedEarnedTrophies = dedupeById(earnedTrophies)
  validateEntityOwnership(normalizedGames, normalizedJourneys, normalizedLogs)

  await db.transaction('rw', db.games, db.journeys, db.logs, db.earnedTrophies, async () => {
    if (mode === 'replace') {
      await db.games.clear()
      await db.journeys.clear()
      await db.logs.clear()
      await db.earnedTrophies.clear()
    }

    if (normalizedGames.length > 0) {
      await db.games.bulkPut(normalizedGames)
    }

    if (normalizedJourneys.length > 0) {
      await db.journeys.bulkPut(normalizedJourneys)
    }

    if (normalizedLogs.length > 0) {
      await db.logs.bulkPut(normalizedLogs)
    }

    if (normalizedEarnedTrophies.length > 0) {
      await db.earnedTrophies.bulkPut(normalizedEarnedTrophies)
    }
  })

  return {
    games: normalizedGames.length,
    logs: normalizedLogs.length,
    earnedTrophies: normalizedEarnedTrophies.length,
  }
}

function validateEntityOwnership(
  games: CanonicalGame[],
  journeys: Journey[],
  logs: JourneyLogEntry[],
) {
  const gameIds = new Set(games.map((game) => game.id))
  const journeyIds = new Set(journeys.map((journey) => journey.id))
  const orphanedJourney = journeys.find((journey) => !gameIds.has(journey.gameId))
  const orphanedLog = logs.find((log) => !journeyIds.has(log.journeyId))

  if (orphanedJourney) {
    throw new Error(`Backup Journey "${orphanedJourney.id}" has no matching Game.`)
  }

  if (orphanedLog) {
    throw new Error(`Backup Log "${orphanedLog.id}" has no matching Journey.`)
  }
}

export async function createSyncSnapshot(): Promise<SyncSnapshot> {
  return {
    games: await getAllGames(true),
    logs: await getAllLogs(true),
    earnedTrophies: await getAllEarnedTrophies(true),
  }
}

export async function replaceWithSyncSnapshot(snapshot: SyncSnapshot) {
  const [existingGames, existingJourneys] = await Promise.all([
    getAllCanonicalGames(true),
    getAllJourneys(true),
  ])
  const localMetadataByGameId = new Map(
    existingGames.map((game) => [
      game.id,
      {
        developers: game.developers,
        publishers: game.publishers,
        releaseYear: game.releaseYear,
      },
    ]),
  )
  const localPriorityByGameId = new Map(
    existingJourneys.map((journey) => [journey.gameId, journey.priority]),
  )
  const migration = migrateLegacyLibrary(
    snapshot.games.map(normalizeGame),
    snapshot.logs.map(normalizeLogEntry),
  )

  await db.transaction('rw', db.games, db.journeys, db.logs, db.earnedTrophies, async () => {
    await db.games.clear()
    await db.journeys.clear()
    await db.logs.clear()
    await db.earnedTrophies.clear()

    if (migration.games.length > 0) {
      await db.games.bulkPut(
        migration.games.map((game) => {
          const localMetadata = localMetadataByGameId.get(game.id)

          return localMetadata
            ? {
                ...game,
                developers: game.developers.length > 0 ? game.developers : localMetadata.developers,
                publishers: game.publishers.length > 0 ? game.publishers : localMetadata.publishers,
                releaseYear: game.releaseYear ?? localMetadata.releaseYear,
              }
            : game
        }),
      )
      await db.journeys.bulkPut(
        migration.journeys.map((journey) => ({
          ...journey,
          priority: journey.priority ?? localPriorityByGameId.get(journey.gameId) ?? null,
        })),
      )
    }

    if (migration.logs.length > 0) {
      await db.logs.bulkPut(migration.logs)
    }

    if (snapshot.earnedTrophies.length > 0) {
      await db.earnedTrophies.bulkPut(snapshot.earnedTrophies.map(normalizeEarnedTrophy))
    }
  })
}
