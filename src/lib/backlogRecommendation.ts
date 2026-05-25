import { getTimeToBeatHours } from './timeToBeat'
import type { Game, GamePriority } from '../types'

export type RecommendationReason =
  | { kind: 'priority'; priority: GamePriority }
  | { kind: 'taste'; tag: string }
  | { kind: 'timeToBeat'; hours: number }
  | { kind: 'bigAdventure'; hours: number }
  | { kind: 'longWaiting'; months: number }
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
}

const PRIORITY_SCORE: Record<GamePriority, number> = {
  'high-interest': 34,
  'low-pressure': 20,
  'save-for-later': 6,
}

const GENERIC_TASTE_TAGS = new Set(['Action', 'Adventure', 'RPG'])

export function recommendBacklogGames(
  games: Game[],
  options: RecommendBacklogGamesOptions = {},
): BacklogRecommendation[] {
  const limit = options.limit ?? 2
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const recentGameIds = options.recentGameIds ?? []
  const candidates = games.filter((game) => game.deletedAt === null && game.status === 'backlog')

  if (limit <= 0 || candidates.length === 0) {
    return []
  }

  const tasteProfile = buildTasteProfile(games, now)
  const scored = candidates
    .map((game) => scoreBacklogGame(game, tasteProfile, now, recentGameIds))
    .sort((left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title))
  const topPoolSize = Math.min(scored.length, Math.max(limit * 3, 6))
  const pool = scored.slice(0, topPoolSize)
  const picks: BacklogRecommendation[] = []

  while (pool.length > 0 && picks.length < limit) {
    const selectedIndex = weightedPickIndex(pool, random)
    picks.push(pool[selectedIndex])
    pool.splice(selectedIndex, 1)
  }

  return picks
}

function scoreBacklogGame(
  game: Game,
  tasteProfile: Map<string, number>,
  now: Date,
  recentGameIds: string[],
): BacklogRecommendation {
  let score = 20
  const scoredReasons: Array<{ reason: RecommendationReason; score: number }> = []

  if (game.priority) {
    const priorityScore = PRIORITY_SCORE[game.priority]
    score += priorityScore
    scoredReasons.push({ reason: { kind: 'priority', priority: game.priority }, score: priorityScore })
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

  const timeToBeatHours = getTimeToBeatHours(game)

  if (timeToBeatHours !== null) {
    const timeScore = scoreTimeToBeat(timeToBeatHours)
    score += timeScore

    if (timeScore > 0) {
      scoredReasons.push({ reason: { kind: 'timeToBeat', hours: timeToBeatHours }, score: timeScore })
    } else if (timeToBeatHours >= 60 && game.priority === 'high-interest') {
      scoredReasons.push({ reason: { kind: 'bigAdventure', hours: timeToBeatHours }, score: 8 })
    }
  }

  const waitingMonths = getWaitingMonths(game.createdAt, now)
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

function buildTasteProfile(games: Game[], now: Date) {
  const profile = new Map<string, number>()
  const likedGames = games.filter(
    (game) =>
      game.deletedAt === null &&
      game.status === 'finished' &&
      game.rating !== null,
  )

  for (const game of likedGames) {
    const ratingWeight = getRatingTasteWeight(game.rating)

    if (ratingWeight === 0) {
      continue
    }

    const recencyWeight = getFinishedRecencyWeight(game, now)
    const weight = ratingWeight * recencyWeight

    for (const tag of [...game.tags, ...(game.igdbThemes ?? [])]) {
      const tagWeight = GENERIC_TASTE_TAGS.has(tag) ? weight * 0.6 : weight
      profile.set(tag, (profile.get(tag) ?? 0) + tagWeight)
    }
  }

  return profile
}

function bestTasteMatch(game: Game, tasteProfile: Map<string, number>) {
  let best: { tag: string; score: number } | null = null

  for (const tag of [...game.tags, ...(game.igdbThemes ?? [])]) {
    const score = tasteProfile.get(tag) ?? 0

    if (score !== 0 && (!best || score > best.score)) {
      best = { tag, score }
    }
  }

  return best
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

function getFinishedRecencyWeight(game: Game, now: Date) {
  const referenceDate = game.finishedAt ?? game.updatedAt
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

function scoreTimeToBeat(hours: number) {
  if (hours <= 12) return 14
  if (hours <= 25) return 10
  if (hours <= 45) return 6
  if (hours <= 70) return 2
  if (hours >= 100) return -4

  return 0
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
