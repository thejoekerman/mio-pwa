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
  type PendingSyncRecord,
  type SyncAcknowledgements,
  type SyncChanges,
  type SyncDeletion,
  type SyncDeletions,
  type SyncEntity,
  type SyncRequest,
  type SyncResponse,
  type SyncState,
} from '../types'
import { isDemoMode } from './appMode'
import { demoGames, demoLogs } from './demoData'
import {
  initialJourneyIdForGame,
  migrateLegacyGame,
  migrateLegacyJourney,
  migrateLegacyLibrary,
  type LegacyGame,
} from './gameJourneyMigration'
import { getCurrentJourney } from './gameJourneyState'

type StoredGame = Omit<LegacyGame, 'ownershipType'> & {
  notes?: string
  ownershipType?: unknown
}

const BACKUP_VERSION = 11

export class BacklogDatabase extends Dexie {
  games!: EntityTable<CanonicalGame, 'id'>
  journeys!: EntityTable<Journey, 'id'>
  logs!: EntityTable<JourneyLogEntry, 'id'>
  earnedTrophies!: EntityTable<EarnedTrophy, 'id'>
  pendingSyncRecords!: EntityTable<PendingSyncRecord, 'key'>
  syncStates!: EntityTable<SyncState, 'id'>

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

    this.version(8).stores({
      games: 'id, updatedAt, title, deletedAt',
      journeys: 'id, gameId, updatedAt, status, deletedAt',
      logs: 'id, journeyId, createdAt, updatedAt, deletedAt',
      earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
      pendingSyncRecords: 'key, entity, id, queuedUpdatedAt',
      syncStates: 'id, serverIdentity, serverCursor',
    })
  }
}

const db = new BacklogDatabase()

function pendingSyncKey(entity: SyncEntity, id: string) {
  return `${entity}:${id}`
}

function pendingSyncRecord(
  entity: SyncEntity,
  record: { id: string; updatedAt: string },
): PendingSyncRecord {
  return {
    key: pendingSyncKey(entity, record.id),
    entity,
    id: record.id,
    queuedUpdatedAt: record.updatedAt,
  }
}

async function queueSyncRecords(
  entity: SyncEntity,
  records: { id: string; updatedAt: string }[],
) {
  if (records.length > 0) {
    await db.pendingSyncRecords.bulkPut(records.map((record) => pendingSyncRecord(entity, record)))
  }
}

function normalizeStoredGame(game: StoredGame): Game {
  return {
    ...game,
    playTimeHours:
      typeof game.playTimeHours === 'number' && Number.isFinite(game.playTimeHours)
        ? game.playTimeHours
        : null,
    review: game.review ?? game.notes ?? '',
    ownershipType: asNullableOwnershipType(game.ownershipType),
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
    genres: game.genres,
    themes: game.themes,
    gameModes: game.gameModes,
    externalReferences: game.externalReferences,
    metadataReviewedAt: game.metadataReviewedAt,
    coverSource: game.cover?.source ?? null,
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
    return {
      ...migrated,
      externalReferences: game.externalReferences ?? [],
      metadataReviewedAt: game.metadataReviewedAt ?? null,
      cover: game.coverUrl
        ? { url: game.coverUrl, source: game.coverSource ?? migrated.cover?.source ?? { provider: 'manual', pageUrl: null } }
        : null,
    }
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
    externalReferences: game.externalReferences ?? existing.externalReferences,
    metadataReviewedAt: game.metadataReviewedAt ?? existing.metadataReviewedAt,
    cover:
      game.coverUrl === (existing.cover?.url ?? null)
        ? existing.cover
        : game.coverUrl
          ? { url: game.coverUrl, source: game.coverSource ?? { provider: 'manual', pageUrl: null } }
          : null,
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
  await db.transaction('rw', db.games, db.journeys, db.pendingSyncRecords, async () => {
    const existingGame = await db.games.get(game.id)
    const existingJourneys = await db.journeys.where('gameId').equals(game.id).toArray()
    const currentJourney = getCurrentJourney(existingJourneys)
    const canonicalGame = projectLegacyGameToCanonical(game, existingGame)
    const journey = projectLegacyGameToJourney(game, currentJourney)

    await db.games.put(canonicalGame)
    await db.journeys.put(journey)
    await queueSyncRecords('game', [canonicalGame])
    await queueSyncRecords('journey', [journey])
  })
}

export async function saveGameMetadata(game: Game) {
  await db.transaction('rw', db.games, db.pendingSyncRecords, async () => {
    const existingGame = await db.games.get(game.id)
    const canonicalGame = projectLegacyGameToCanonical(game, existingGame)

    await db.games.put(canonicalGame)
    await queueSyncRecords('game', [canonicalGame])
  })
}

export async function deleteGame(gameId: string, hardDelete = false) {
  await db.transaction('rw', db.games, db.journeys, db.logs, db.pendingSyncRecords, async () => {
    const now = new Date().toISOString()
    const game = await db.games.get(gameId)

    if (!game) {
      return
    }

    const journeys = await db.journeys.where('gameId').equals(gameId).toArray()
    const journeyIds = journeys.map((journey) => journey.id)

    if (hardDelete) {
      const logs = (await Promise.all(
        journeyIds.map((journeyId) => db.logs.where('journeyId').equals(journeyId).toArray()),
      )).flat()
      await db.logs.bulkDelete(logs.map(({ id }) => id))
      await db.journeys.bulkDelete(journeyIds)
      await db.games.delete(gameId)
      await db.pendingSyncRecords.bulkDelete([
        pendingSyncKey('game', gameId),
        ...journeyIds.map((id) => pendingSyncKey('journey', id)),
        ...logs.map(({ id }) => pendingSyncKey('log', id)),
      ])

      return
    }

    const deletedGame = {
      ...game,
      updatedAt: now,
      deletedAt: now,
    }
    await db.games.put(deletedGame)
    await queueSyncRecords('game', [deletedGame])

    const deletedJourneys = journeys.map((journey) => ({
      ...journey,
      updatedAt: now,
      deletedAt: now,
    }))

    if (deletedJourneys.length > 0) {
      await db.journeys.bulkPut(deletedJourneys)
      await queueSyncRecords('journey', deletedJourneys)
    }

    for (const journeyId of journeyIds) {
      const logs = await db.logs.where('journeyId').equals(journeyId).toArray()
      const deletedLogs = logs.map((logEntry) => ({
        ...logEntry,
        updatedAt: now,
        deletedAt: now,
      }))

      if (deletedLogs.length > 0) {
        await db.logs.bulkPut(deletedLogs)
        await queueSyncRecords('log', deletedLogs)
      }
    }
  })
}

export async function deleteJourney(journeyId: string, hardDelete = false) {
  return db.transaction('rw', db.journeys, db.logs, db.pendingSyncRecords, async () => {
    const now = new Date().toISOString()
    const journey = await db.journeys.get(journeyId)

    if (!journey || journey.deletedAt !== null) {
      return false
    }

    const visibleJourneys = await db.journeys.where('gameId').equals(journey.gameId).toArray()
    if (visibleJourneys.filter((candidate) => candidate.deletedAt === null).length <= 1) {
      return false
    }

    const logs = await db.logs.where('journeyId').equals(journeyId).toArray()
    if (hardDelete) {
      await db.logs.bulkDelete(logs.map(({ id }) => id))
      await db.journeys.delete(journeyId)
      await db.pendingSyncRecords.bulkDelete([
        pendingSyncKey('journey', journeyId),
        ...logs.map(({ id }) => pendingSyncKey('log', id)),
      ])

      return true
    }

    const deletedJourney = { ...journey, updatedAt: now, deletedAt: now }
    await db.journeys.put(deletedJourney)
    await queueSyncRecords('journey', [deletedJourney])

    const deletedLogs = logs.map((logEntry) => ({ ...logEntry, updatedAt: now, deletedAt: now }))
    if (deletedLogs.length > 0) {
      await db.logs.bulkPut(deletedLogs)
      await queueSyncRecords('log', deletedLogs)
    }

    return true
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

  const journeyLog = {
    id: logEntry.id,
    journeyId: currentJourney.id,
    content: logEntry.content,
    createdAt: logEntry.createdAt,
    updatedAt: logEntry.updatedAt,
    deletedAt: logEntry.deletedAt,
  }
  await db.transaction('rw', db.logs, db.pendingSyncRecords, async () => {
    await db.logs.put(journeyLog)
    await queueSyncRecords('log', [journeyLog])
  })
}

export async function saveLogEntryForJourney(logEntry: LogEntry, journeyId: string) {
  const journey = await db.journeys.get(journeyId)

  if (!journey || journey.gameId !== logEntry.gameId) {
    throw new Error(`Cannot save log "${logEntry.id}" without matching Journey "${journeyId}".`)
  }

  const journeyLog = {
    id: logEntry.id,
    journeyId,
    content: logEntry.content,
    createdAt: logEntry.createdAt,
    updatedAt: logEntry.updatedAt,
    deletedAt: logEntry.deletedAt,
  }
  await db.transaction('rw', db.logs, db.pendingSyncRecords, async () => {
    await db.logs.put(journeyLog)
    await queueSyncRecords('log', [journeyLog])
  })
}

export async function saveEarnedTrophies(earnedTrophies: EarnedTrophy[]) {
  if (earnedTrophies.length === 0) {
    return
  }

  await db.transaction('rw', db.earnedTrophies, db.pendingSyncRecords, async () => {
    await db.earnedTrophies.bulkPut(earnedTrophies)
    await queueSyncRecords('earnedTrophy', earnedTrophies)
  })
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

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
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
        .filter(Boolean),
    ),
  ]
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
  await db.transaction('rw', db.games, db.journeys, db.pendingSyncRecords, async () => {
    const game = await db.games.get(journey.gameId)

    if (!game) {
      throw new Error(`Cannot save Journey "${journey.id}" without Game "${journey.gameId}".`)
    }

    await db.journeys.put(journey)
    await queueSyncRecords('journey', [journey])
  })
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

  await db.transaction(
    'rw',
    [db.games, db.journeys, db.logs, db.earnedTrophies, db.pendingSyncRecords, db.syncStates],
    async () => {
      if (mode === 'replace') {
        await db.games.clear()
        await db.journeys.clear()
        await db.logs.clear()
        await db.earnedTrophies.clear()
        await db.pendingSyncRecords.clear()
        await db.syncStates.clear()
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

      await queueSyncRecords('game', normalizedGames)
      await queueSyncRecords('journey', normalizedJourneys)
      await queueSyncRecords('log', normalizedLogs)
      await queueSyncRecords('earnedTrophy', normalizedEarnedTrophies)
    },
  )

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

const emptySyncChanges = (): SyncChanges => ({
  games: [],
  journeys: [],
  logs: [],
  earnedTrophies: [],
})

const emptySyncDeletions = (): SyncDeletions => ({
  games: [],
  journeys: [],
  logs: [],
  earnedTrophies: [],
})

function pendingRecordsForChanges(changes: SyncChanges) {
  return [
    ...changes.games.map((record) => pendingSyncRecord('game', record)),
    ...changes.journeys.map((record) => pendingSyncRecord('journey', record)),
    ...changes.logs.map((record) => pendingSyncRecord('log', record)),
    ...changes.earnedTrophies.map((record) => pendingSyncRecord('earnedTrophy', record)),
  ]
}

async function getFullSyncChanges(): Promise<SyncChanges> {
  const [games, journeys, logs, earnedTrophies] = await Promise.all([
    getAllCanonicalGames(true),
    getAllJourneys(true),
    getAllJourneyLogs(true),
    getAllEarnedTrophies(true),
  ])

  return { games, journeys, logs, earnedTrophies }
}

async function getPendingSyncChanges(pending: PendingSyncRecord[]): Promise<SyncChanges> {
  const changes = emptySyncChanges()

  for (const record of pending) {
    if (record.entity === 'game') {
      const game = await db.games.get(record.id)
      if (game) changes.games.push(game)
    } else if (record.entity === 'journey') {
      const journey = await db.journeys.get(record.id)
      if (journey) changes.journeys.push(journey)
    } else if (record.entity === 'log') {
      const log = await db.logs.get(record.id)
      if (log) changes.logs.push(log)
    } else {
      const trophy = await db.earnedTrophies.get(record.id)
      if (trophy) changes.earnedTrophies.push(trophy)
    }
  }

  return changes
}

export async function createSyncRequest(serverIdentity: string): Promise<{
  request: SyncRequest
  submitted: PendingSyncRecord[]
}> {
  const [state, pending] = await Promise.all([
    db.syncStates.get('active'),
    db.pendingSyncRecords.toArray(),
  ])
  const full = !state || state.serverIdentity !== serverIdentity
  const changes = full ? await getFullSyncChanges() : await getPendingSyncChanges(pending)

  return {
    request: {
      protocolVersion: 3,
      cursor: full ? null : state.serverCursor,
      full,
      changes,
    },
    submitted: pendingRecordsForChanges(changes),
  }
}

async function recordsWonByServer<T extends { id: string; updatedAt: string }>(
  records: T[],
  getExisting: (id: string) => Promise<T | undefined>,
) {
  const winners: T[] = []

  for (const record of records) {
    const existing = await getExisting(record.id)
    if (!existing || existing.updatedAt <= record.updatedAt) {
      winners.push(record)
    }
  }

  return winners
}

function acknowledgedKeys(
  submitted: PendingSyncRecord[],
  acknowledgements: SyncAcknowledgements,
) {
  const acknowledgedIds = {
    game: new Set(acknowledgements.games),
    journey: new Set(acknowledgements.journeys),
    log: new Set(acknowledgements.logs),
    earnedTrophy: new Set(acknowledgements.earnedTrophies),
  }

  return submitted.filter((record) => acknowledgedIds[record.entity].has(record.id))
}

export async function applySyncResponse(
  serverIdentity: string,
  submitted: PendingSyncRecord[],
  response: SyncResponse,
) {
  await db.transaction(
    'rw',
    [db.games, db.journeys, db.logs, db.earnedTrophies, db.pendingSyncRecords, db.syncStates],
    async () => {
      if (response.recoveryRequired) {
        await db.logs.clear()
        await db.journeys.clear()
        await db.games.clear()
        await db.earnedTrophies.clear()
        await db.pendingSyncRecords.clear()
        await db.games.bulkPut(response.changes.games)
        await db.journeys.bulkPut(response.changes.journeys)
        await db.logs.bulkPut(response.changes.logs)
        await db.earnedTrophies.bulkPut(response.changes.earnedTrophies)
        await db.syncStates.put({
          id: 'active',
          serverIdentity,
          serverCursor: response.cursor,
        })

        return
      }

      const games = await recordsWonByServer(response.changes.games, (id) => db.games.get(id))
      const journeys = await recordsWonByServer(response.changes.journeys, (id) => db.journeys.get(id))
      const logs = await recordsWonByServer(response.changes.logs, (id) => db.logs.get(id))
      const earnedTrophies = await recordsWonByServer(
        response.changes.earnedTrophies,
        (id) => db.earnedTrophies.get(id),
      )

      await db.games.bulkPut(games)
      await db.journeys.bulkPut(journeys)
      await db.logs.bulkPut(logs)
      await db.earnedTrophies.bulkPut(earnedTrophies)

      const deletions = response.deletions ?? emptySyncDeletions()
      await applyServerDeletions(deletions.logs, (id) => db.logs.get(id), (id) => db.logs.delete(id), 'log')
      await applyServerDeletions(deletions.journeys, (id) => db.journeys.get(id), (id) => db.journeys.delete(id), 'journey')
      await applyServerDeletions(deletions.games, (id) => db.games.get(id), (id) => db.games.delete(id), 'game')
      await applyServerDeletions(
        deletions.earnedTrophies,
        (id) => db.earnedTrophies.get(id),
        (id) => db.earnedTrophies.delete(id),
        'earnedTrophy',
      )

      for (const acknowledged of acknowledgedKeys(submitted, response.acknowledged)) {
        const pending = await db.pendingSyncRecords.get(acknowledged.key)
        if (pending?.queuedUpdatedAt === acknowledged.queuedUpdatedAt) {
          await db.pendingSyncRecords.delete(acknowledged.key)
        }
      }

      await db.syncStates.put({
        id: 'active',
        serverIdentity,
        serverCursor: response.cursor,
      })
    },
  )
}

async function applyServerDeletions<T extends { id: string; updatedAt: string }>(
  deletions: SyncDeletion[],
  getExisting: (id: string) => Promise<T | undefined>,
  deleteRecord: (id: string) => Promise<unknown>,
  entity: SyncEntity,
) {
  for (const deletion of deletions) {
    const existing = await getExisting(deletion.id)
    if (existing && existing.updatedAt <= deletion.updatedAt) {
      await deleteRecord(deletion.id)
      await db.pendingSyncRecords.delete(pendingSyncKey(entity, deletion.id))
    }
  }
}
