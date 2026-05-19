import type { MessageKey } from '../i18n'
import type { EarnedTrophy, Game, LogEntry } from '../types'

export interface TrophyDefinition {
  id: string
  iconKey: string
  titleKey: MessageKey
  descriptionKey: MessageKey
}

export interface TrophyView extends TrophyDefinition {
  earned: boolean
  earnedAt: string | null
  gameId: string | null
  context: Record<string, unknown> | null
}

interface TrophyFacts {
  games: Game[]
  logs: LogEntry[]
  totalGames: number
  finishedGames: Game[]
  totalLogs: number
  reviews: Game[]
  highRatedGames: Game[]
  logsByGameId: Map<string, LogEntry[]>
  earliestLogAt: string | null
  earliestFinishedAt: string | null
  earliestReviewGame: Game | null
  earliestHighRatedGame: Game | null
  mostLoggedGame: { game: Game; logs: LogEntry[] } | null
}

interface TrophyEvaluation {
  trophyId: string
  earnedAt: string | null
  gameId?: string | null
  context?: Record<string, unknown> | null
}

export const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  {
    id: 'first-log',
    iconKey: 'first-log',
    titleKey: 'trophies.firstLog.title',
    descriptionKey: 'trophies.firstLog.description',
  },
  {
    id: 'dear-diary',
    iconKey: 'dear-diary',
    titleKey: 'trophies.dearDiary.title',
    descriptionKey: 'trophies.dearDiary.description',
  },
  {
    id: 'deep-dive',
    iconKey: 'deep-dive',
    titleKey: 'trophies.deepDive.title',
    descriptionKey: 'trophies.deepDive.description',
  },
  {
    id: 'first-finish',
    iconKey: 'first-finish',
    titleKey: 'trophies.firstFinish.title',
    descriptionKey: 'trophies.firstFinish.description',
  },
  {
    id: 'credits-rolled',
    iconKey: 'credits-rolled',
    titleKey: 'trophies.creditsRolled.title',
    descriptionKey: 'trophies.creditsRolled.description',
  },
  {
    id: 'first-review',
    iconKey: 'first-review',
    titleKey: 'trophies.firstReview.title',
    descriptionKey: 'trophies.firstReview.description',
  },
  {
    id: 'critic-notes',
    iconKey: 'critic-notes',
    titleKey: 'trophies.criticNotes.title',
    descriptionKey: 'trophies.criticNotes.description',
  },
  {
    id: 'strong-feelings',
    iconKey: 'strong-feelings',
    titleKey: 'trophies.strongFeelings.title',
    descriptionKey: 'trophies.strongFeelings.description',
  },
  {
    id: 'shelf-curator',
    iconKey: 'shelf-curator',
    titleKey: 'trophies.shelfCurator.title',
    descriptionKey: 'trophies.shelfCurator.description',
  },
  {
    id: 'big-shelf',
    iconKey: 'big-shelf',
    titleKey: 'trophies.bigShelf.title',
    descriptionKey: 'trophies.bigShelf.description',
  },
]

export function evaluateTrophies(
  games: Game[],
  logs: LogEntry[],
  earnedTrophies: EarnedTrophy[],
  now = new Date().toISOString(),
): EarnedTrophy[] {
  const earnedIds = new Set(
    earnedTrophies
      .filter((trophy) => trophy.deletedAt === null)
      .map((trophy) => trophy.trophyId),
  )
  const facts = buildTrophyFacts(games, logs)
  const newlyEarned = trophyEvaluations(facts)
    .filter((result) => !earnedIds.has(result.trophyId))
    .map((result) => createEarnedTrophy(result, now))

  return newlyEarned
}

export function createTrophyViews(earnedTrophies: EarnedTrophy[]): TrophyView[] {
  const earnedById = new Map(
    earnedTrophies
      .filter((trophy) => trophy.deletedAt === null)
      .map((trophy) => [trophy.trophyId, trophy]),
  )

  return TROPHY_DEFINITIONS.map((definition) => {
    const earned = earnedById.get(definition.id)

    return {
      ...definition,
      earned: Boolean(earned),
      earnedAt: earned?.earnedAt ?? null,
      gameId: earned?.gameId ?? null,
      context: earned?.context ?? null,
    }
  })
}

export function buildTrophyFacts(games: Game[], logs: LogEntry[]): TrophyFacts {
  const visibleGames = games.filter((game) => game.deletedAt === null)
  const visibleLogs = logs.filter((log) => log.deletedAt === null)
  const finishedGames = visibleGames.filter((game) => game.status === 'finished')
  const reviews = visibleGames.filter((game) => game.review.trim() !== '')
  const highRatedGames = visibleGames.filter((game) => (game.rating ?? 0) >= 9)
  const logsByGameId = new Map<string, LogEntry[]>()

  for (const log of visibleLogs) {
    const gameLogs = logsByGameId.get(log.gameId) ?? []
    gameLogs.push(log)
    logsByGameId.set(log.gameId, gameLogs)
  }

  for (const gameLogs of logsByGameId.values()) {
    gameLogs.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  const gamesById = new Map(visibleGames.map((game) => [game.id, game]))
  const mostLoggedGame = [...logsByGameId.entries()]
    .map(([gameId, gameLogs]) => ({
      game: gamesById.get(gameId),
      logs: gameLogs,
    }))
    .filter((entry): entry is { game: Game; logs: LogEntry[] } => Boolean(entry.game))
    .sort((left, right) => right.logs.length - left.logs.length || left.game.title.localeCompare(right.game.title))[0] ?? null

  return {
    games: visibleGames,
    logs: visibleLogs,
    totalGames: visibleGames.length,
    finishedGames,
    totalLogs: visibleLogs.length,
    reviews,
    highRatedGames,
    logsByGameId,
    earliestLogAt: visibleLogs.map((log) => log.createdAt).sort()[0] ?? null,
    earliestFinishedAt: finishedGames
      .map((game) => game.finishedAt)
      .filter((date): date is string => typeof date === 'string')
      .sort()[0] ?? null,
    earliestReviewGame: [...reviews].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0] ?? null,
    earliestHighRatedGame: [...highRatedGames].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0] ?? null,
    mostLoggedGame,
  }
}

function trophyEvaluations(facts: TrophyFacts): TrophyEvaluation[] {
  const evaluations: Array<TrophyEvaluation | null> = [
    facts.totalLogs >= 1
      ? { trophyId: 'first-log', earnedAt: facts.earliestLogAt }
      : null,
    facts.totalLogs >= 10
      ? { trophyId: 'dear-diary', earnedAt: logThresholdDate(facts.logs, 10), context: { count: facts.totalLogs } }
      : null,
    facts.mostLoggedGame && facts.mostLoggedGame.logs.length >= 10
      ? {
          trophyId: 'deep-dive',
          earnedAt: facts.mostLoggedGame.logs[9]?.createdAt ?? null,
          gameId: facts.mostLoggedGame.game.id,
          context: { title: facts.mostLoggedGame.game.title, count: facts.mostLoggedGame.logs.length },
        }
      : null,
    facts.finishedGames.length >= 1
      ? { trophyId: 'first-finish', earnedAt: facts.earliestFinishedAt }
      : null,
    facts.finishedGames.length >= 10
      ? { trophyId: 'credits-rolled', earnedAt: finishedThresholdDate(facts.finishedGames, 10), context: { count: facts.finishedGames.length } }
      : null,
    facts.reviews.length >= 1
      ? {
          trophyId: 'first-review',
          earnedAt: facts.earliestReviewGame?.updatedAt ?? null,
          gameId: facts.earliestReviewGame?.id ?? null,
        }
      : null,
    facts.reviews.length >= 3
      ? { trophyId: 'critic-notes', earnedAt: reviewsThresholdDate(facts.reviews, 3), context: { count: facts.reviews.length } }
      : null,
    facts.highRatedGames.length >= 1
      ? {
          trophyId: 'strong-feelings',
          earnedAt: facts.earliestHighRatedGame?.updatedAt ?? null,
          gameId: facts.earliestHighRatedGame?.id ?? null,
        }
      : null,
    facts.totalGames >= 25
      ? { trophyId: 'shelf-curator', earnedAt: gamesThresholdDate(facts.games, 25), context: { count: facts.totalGames } }
      : null,
    facts.totalGames >= 50
      ? { trophyId: 'big-shelf', earnedAt: gamesThresholdDate(facts.games, 50), context: { count: facts.totalGames } }
      : null,
  ]

  return evaluations.filter((evaluation): evaluation is TrophyEvaluation => evaluation !== null)
}

function createEarnedTrophy(result: TrophyEvaluation, now: string): EarnedTrophy {
  const earnedAt = result.earnedAt ?? now

  return {
    id: `trophy-${result.trophyId}`,
    trophyId: result.trophyId,
    earnedAt,
    gameId: result.gameId ?? null,
    context: result.context ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function logThresholdDate(logs: LogEntry[], threshold: number) {
  return [...logs].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[threshold - 1]?.createdAt ?? null
}

function finishedThresholdDate(games: Game[], threshold: number) {
  return [...games]
    .map((game) => game.finishedAt)
    .filter((date): date is string => typeof date === 'string')
    .sort()[threshold - 1] ?? null
}

function reviewsThresholdDate(games: Game[], threshold: number) {
  return [...games].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[threshold - 1]?.updatedAt ?? null
}

function gamesThresholdDate(games: Game[], threshold: number) {
  return [...games].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[threshold - 1]?.createdAt ?? null
}
