import { getCurrentJourney, hasActiveJourney } from './gameJourneyState'
import type { Game, GamePriority, Journey } from '../types'

export type RecommendationReason =
  | { kind: 'priority'; priority: GamePriority }
  | { kind: 'taste'; tag: string }
  | { kind: 'longWaiting'; months: number }
  | { kind: 'rediscovery' }
  | { kind: 'ready' }

export interface BacklogRecommendation {
  game: Game
  score: number
  reasons: RecommendationReason[]
}

interface RecommendBacklogGamesOptions {
  limit?: number
  now?: Date
  random?: () => number
  recentGameIds?: string[]
  recommendationHistory?: Record<string, string>
}

const PRIORITY_SCORE: Record<Exclude<GamePriority, 'save-for-later'>, number> = {
  'high-interest': 34,
  'low-pressure': 20,
}

const GENERIC_TASTE_TAGS = new Set(['Action', 'Adventure', 'RPG'])
const RECENT_TASTE_JOURNEY_LIMIT = 6

export function recommendBacklogGames(
  games: Game[],
  journeys: Journey[],
  options: RecommendBacklogGamesOptions = {},
): BacklogRecommendation[] {
  const limit = options.limit ?? 2
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const recentGameIds = options.recentGameIds ?? []
  const recommendationHistory = options.recommendationHistory ?? {}
  const journeysByGameId = groupJourneysByGameId(journeys)
  const candidates = games.flatMap((game) => {
    const gameJourneys = journeysByGameId.get(game.id) ?? []
    const currentJourney = getCurrentJourney(gameJourneys)

    return game.deletedAt === null &&
      currentJourney?.status === 'backlog' &&
      currentJourney.priority !== 'save-for-later' &&
      !hasActiveJourney(gameJourneys)
      ? [{ game, journey: currentJourney }]
      : []
  })

  if (limit <= 0 || candidates.length === 0) {
    return []
  }

  const tasteProfile = buildTasteProfile(games, journeys, now)
  const scored = candidates
    .map(({ game, journey }) => scoreBacklogGame(game, journey, tasteProfile, now, recentGameIds))
    .sort((left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title))
  const topPoolSize = Math.min(scored.length, Math.max(limit * 3, 6))
  const primaryPool = scored.slice(0, topPoolSize)
  const picks = [primaryPool.splice(weightedPickIndex(primaryPool, random), 1)[0]]

  if (limit > 1 && scored.length > 1) {
    const rediscovery = pickRediscovery(
      scored.filter((recommendation) => recommendation.game.id !== picks[0].game.id),
      recommendationHistory,
      random,
    )

    if (rediscovery) {
      const rediscoveryReasons: RecommendationReason[] = [{ kind: 'rediscovery' }, ...rediscovery.reasons]
      picks.push({
        ...rediscovery,
        reasons: rediscoveryReasons.slice(0, 2),
      })
    }
  }

  for (const recommendation of primaryPool) {
    if (picks.length >= limit) {
      break
    }

    if (!picks.some((pick) => pick.game.id === recommendation.game.id)) {
      picks.push(recommendation)
    }
  }

  return picks
}

function pickRediscovery(
  recommendations: BacklogRecommendation[],
  recommendationHistory: Record<string, string>,
  random: () => number,
) {
  const ordered = [...recommendations].sort((left, right) => {
    const leftShownAt = recommendationHistory[left.game.id]
    const rightShownAt = recommendationHistory[right.game.id]

    if (!leftShownAt && rightShownAt) return -1
    if (leftShownAt && !rightShownAt) return 1
    if (leftShownAt && rightShownAt) {
      const difference = Date.parse(leftShownAt) - Date.parse(rightShownAt)
      if (difference !== 0) return difference
    }

    return left.game.title.localeCompare(right.game.title)
  })
  const pool = ordered.slice(0, Math.min(6, ordered.length))

  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

function scoreBacklogGame(
  game: Game,
  journey: Journey,
  tasteProfile: Map<string, number>,
  now: Date,
  recentGameIds: string[],
): BacklogRecommendation {
  let score = 20
  const scoredReasons: Array<{ reason: RecommendationReason; score: number }> = []

  if (journey.priority && journey.priority !== 'save-for-later') {
    const priorityScore = PRIORITY_SCORE[journey.priority]
    score += priorityScore
    scoredReasons.push({ reason: { kind: 'priority', priority: journey.priority }, score: priorityScore })
  }

  const tasteMatch = bestTasteMatch(game, tasteProfile)

  if (tasteMatch && tasteMatch.score > 0) {
    const tasteScore = Math.min(26, Math.round(tasteMatch.score * 5))
    score += tasteScore

    if (!GENERIC_TASTE_TAGS.has(tasteMatch.tag) || scoredReasons.length === 0) {
      scoredReasons.push({ reason: { kind: 'taste', tag: tasteMatch.tag }, score: tasteScore })
    }
  } else if (tasteMatch && tasteMatch.score < 0) {
    score += Math.max(-8, Math.round(tasteMatch.score * 3))
  }

  const waitingMonths = getWaitingMonths(journey.createdAt, now)
  const waitingScore = scoreWaitingTime(waitingMonths)
  score += waitingScore

  if (waitingScore > 0) {
    scoredReasons.push({ reason: { kind: 'longWaiting', months: waitingMonths }, score: waitingScore })
  }

  score -= getRepeatPenalty(game.id, recentGameIds)

  const reasons = scoredReasons
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => entry.reason)

  return {
    game,
    score,
    reasons: reasons.length > 0 ? reasons : [{ kind: 'ready' }],
  }
}

function buildTasteProfile(games: Game[], journeys: Journey[], now: Date) {
  const profile = new Map<string, number>()
  const gameById = new Map(games.filter((game) => game.deletedAt === null).map((game) => [game.id, game]))
  const weightsByGameAndTag = new Map<string, Map<string, number>>()
  const recentRatedFinishes = journeys
    .filter((journey) => {
      const game = gameById.get(journey.gameId)

      return Boolean(game && journey.deletedAt === null && journey.status === 'finished' && journey.rating !== null)
    })
    .sort((left, right) => getFinishedTasteTimestamp(right) - getFinishedTasteTimestamp(left))
    .slice(0, RECENT_TASTE_JOURNEY_LIMIT)

  for (const journey of recentRatedFinishes) {
    const game = gameById.get(journey.gameId)

    if (!game || journey.rating === null) {
      continue
    }

    const ratingWeight = getRatingTasteWeight(journey.rating)

    if (ratingWeight === 0) {
      continue
    }

    const recencyWeight = getFinishedRecencyWeight(journey, now)
    const weight = ratingWeight * recencyWeight
    const gameWeights = weightsByGameAndTag.get(game.id) ?? new Map<string, number>()

    for (const tag of tasteTags(game)) {
      const tagWeight = GENERIC_TASTE_TAGS.has(tag) ? weight * 0.6 : weight
      gameWeights.set(tag, (gameWeights.get(tag) ?? 0) + tagWeight)
    }

    weightsByGameAndTag.set(game.id, gameWeights)
  }

  for (const gameWeights of weightsByGameAndTag.values()) {
    for (const [tag, weight] of gameWeights) {
      const cappedWeight = Math.max(-2, Math.min(5, weight))
      profile.set(tag, (profile.get(tag) ?? 0) + cappedWeight)
    }
  }

  return profile
}

function getFinishedTasteTimestamp(journey: Journey) {
  const timestamp = new Date(journey.finishedAt ?? journey.updatedAt).getTime()

  return Number.isFinite(timestamp) ? timestamp : 0
}

function bestTasteMatch(game: Game, tasteProfile: Map<string, number>) {
  let best: { tag: string; score: number } | null = null

  for (const tag of tasteTags(game)) {
    const score = tasteProfile.get(tag) ?? 0

    if (score !== 0 && (!best || score > best.score)) {
      best = { tag, score }
    }
  }

  return best
}

function tasteTags(game: Game) {
  return [...new Set([...game.tags, ...(game.genres ?? []), ...(game.themes ?? [])])]
}

function getRatingTasteWeight(rating: number | null) {
  if (rating === null) return 0
  if (rating >= 10) return 4
  if (rating >= 9) return 3
  if (rating >= 8) return 2
  if (rating >= 7) return 1
  if (rating >= 6) return 0

  return -1
}

function getFinishedRecencyWeight(journey: Journey, now: Date) {
  const referenceDate = journey.finishedAt ?? journey.updatedAt
  const finishedTime = new Date(referenceDate).getTime()

  if (!Number.isFinite(finishedTime)) {
    return 1
  }

  const days = Math.max(0, (now.getTime() - finishedTime) / (1000 * 60 * 60 * 24))

  if (days <= 30) return 1.5
  if (days <= 90) return 1.2
  if (days <= 180) return 1
  if (days <= 365) return 0.7

  return 0.4
}

function groupJourneysByGameId(journeys: Journey[]) {
  const grouped = new Map<string, Journey[]>()

  for (const journey of journeys) {
    const gameJourneys = grouped.get(journey.gameId) ?? []
    gameJourneys.push(journey)
    grouped.set(journey.gameId, gameJourneys)
  }

  return grouped
}

function getWaitingMonths(createdAt: string, now: Date) {
  const createdTime = new Date(createdAt).getTime()

  if (!Number.isFinite(createdTime)) {
    return 0
  }

  const monthMs = 1000 * 60 * 60 * 24 * 30

  return Math.max(0, Math.floor((now.getTime() - createdTime) / monthMs))
}

function scoreWaitingTime(months: number) {
  if (months >= 12) return 12
  if (months >= 6) return 8
  if (months >= 2) return 4
  if (months >= 1) return 2

  return 0
}

function getRepeatPenalty(gameId: string, recentGameIds: string[]) {
  const mostRecentIndex = recentGameIds.lastIndexOf(gameId)

  if (mostRecentIndex === -1) {
    return 0
  }

  const distanceFromLatest = recentGameIds.length - 1 - mostRecentIndex

  if (distanceFromLatest <= 1) return 28
  if (distanceFromLatest <= 3) return 18

  return 10
}

function weightedPickIndex(recommendations: BacklogRecommendation[], random: () => number) {
  const lowestScore = Math.min(...recommendations.map((recommendation) => recommendation.score))
  const weights = recommendations.map((recommendation) => recommendation.score - lowestScore + 1)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  let threshold = random() * totalWeight

  for (let index = 0; index < weights.length; index += 1) {
    threshold -= weights[index]

    if (threshold <= 0) {
      return index
    }
  }

  return recommendations.length - 1
}
