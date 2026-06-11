import { describe, expect, it } from 'vitest'
import { recommendBacklogGames as recommendBacklogGamesWithJourneys } from './backlogRecommendation'
import type { Game, Journey } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'test-id',
    title: 'Test Game',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    igdbTtbHastilySeconds: null,
    igdbTtbNormallySeconds: null,
    igdbTtbCompletelySeconds: null,
    igdbTtbCount: null,
    igdbTtbUpdatedAt: null,
    igdbDevelopers: null,
    igdbPublishers: null,
    igdbThemes: null,
    igdbGameModes: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    coverUrl: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeJourney(game: Game, overrides: Partial<Journey> = {}): Journey {
  return {
    id: `${game.id}:journey`,
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
    pausedAt: game.pausedAt,
    nudgeAt: game.nudgeAt,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    deletedAt: game.deletedAt,
    ...overrides,
  }
}

function recommendBacklogGames(
  games: Game[],
  options: Parameters<typeof recommendBacklogGamesWithJourneys>[2] = {},
  journeys = games.map((game) => makeJourney(game)),
) {
  return recommendBacklogGamesWithJourneys(games, journeys, options)
}

describe('recommendBacklogGames', () => {
  const now = new Date('2026-05-23T12:00:00.000Z')

  it('returns only visible backlog games', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({ id: 'backlog', title: 'Backlog' }),
        makeGame({ id: 'playing', title: 'Playing', status: 'playing' }),
        makeGame({ id: 'deleted', title: 'Deleted', deletedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      { now, random: () => 0 },
    )

    expect(recommendations).toHaveLength(1)
    expect(recommendations[0].game.id).toBe('backlog')
  })

  it('prefers high-interest backlog games', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({ id: 'plain', title: 'Plain' }),
        makeGame({ id: 'priority', title: 'Priority', priority: 'high-interest' }),
      ],
      { now, limit: 1, random: () => 0 },
    )

    expect(recommendations[0].game.id).toBe('priority')
    expect(recommendations[0].reasons).toContainEqual({ kind: 'priority', priority: 'high-interest' })
  })

  it('uses finished high-rated games as taste input', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({ id: 'liked', title: 'Liked', status: 'finished', rating: 9, tags: ['Cozy'] }),
        makeGame({ id: 'match', title: 'Match', tags: ['Cozy'] }),
        makeGame({ id: 'other', title: 'Other', tags: ['Horror'] }),
      ],
      { now, limit: 1, random: () => 0 },
    )

    expect(recommendations[0].game.id).toBe('match')
    expect(recommendations[0].reasons).toContainEqual({ kind: 'taste', tag: 'Cozy' })
  })

  it('weights loved finished games more than merely liked ones', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({
          id: 'loved',
          title: 'Loved',
          status: 'finished',
          rating: 10,
          tags: ['Cozy'],
          finishedAt: '2026-05-01',
        }),
        makeGame({
          id: 'liked',
          title: 'Liked',
          status: 'finished',
          rating: 8,
          tags: ['Horror'],
          finishedAt: '2026-05-01',
        }),
        makeGame({ id: 'cozy-match', title: 'Cozy Match', tags: ['Cozy'] }),
        makeGame({ id: 'horror-match', title: 'Horror Match', tags: ['Horror'] }),
      ],
      { now, limit: 1, random: () => 0 },
    )

    expect(recommendations[0].game.id).toBe('cozy-match')
  })

  it('does not boost games similar to low-rated finished games', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({
          id: 'disliked',
          title: 'Disliked',
          status: 'finished',
          rating: 5,
          tags: ['Racing'],
          finishedAt: '2026-05-01',
        }),
        makeGame({ id: 'racing-match', title: 'Racing Match', tags: ['Racing'] }),
        makeGame({ id: 'neutral', title: 'Neutral' }),
      ],
      { now, limit: 1, random: () => 0 },
    )

    expect(recommendations[0].game.id).toBe('neutral')
  })

  it('gently prefers fresh picks over recently recommended comparable games', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({ id: 'recent', title: 'Recent', priority: 'high-interest' }),
        makeGame({ id: 'fresh', title: 'Fresh', priority: 'high-interest' }),
      ],
      { now, limit: 1, random: () => 0, recentGameIds: ['recent'] },
    )

    expect(recommendations[0].game.id).toBe('fresh')
  })

  it('returns up to the requested number without duplicates', () => {
    const recommendations = recommendBacklogGames(
      [
        makeGame({ id: 'one', title: 'One', priority: 'high-interest' }),
        makeGame({ id: 'two', title: 'Two', priority: 'low-pressure' }),
        makeGame({ id: 'three', title: 'Three' }),
      ],
      { now, limit: 2, random: () => 0 },
    )

    expect(recommendations).toHaveLength(2)
    expect(new Set(recommendations.map((recommendation) => recommendation.game.id)).size).toBe(2)
  })

  it('excludes a Game with an active replay even when it also has a backlog Journey', () => {
    const game = makeGame({ id: 'replay', title: 'Replay' })
    const recommendations = recommendBacklogGames(
      [game],
      { now, random: () => 0 },
      [
        makeJourney(game, { id: 'backlog', status: 'backlog' }),
        makeJourney(game, { id: 'active', status: 'playing' }),
      ],
    )

    expect(recommendations).toEqual([])
  })

  it('uses every rated finished Journey as taste input', () => {
    const favorite = makeGame({ id: 'favorite', title: 'Favorite', tags: ['Cozy'] })
    const match = makeGame({ id: 'match', title: 'Match', tags: ['Cozy'] })
    const other = makeGame({ id: 'other', title: 'Other', tags: ['Horror'] })
    const recommendations = recommendBacklogGames(
      [favorite, match, other],
      { now, limit: 1, random: () => 0 },
      [
        makeJourney(favorite, { id: 'favorite-first', status: 'finished', rating: 9 }),
        makeJourney(favorite, { id: 'favorite-replay', status: 'finished', rating: 10 }),
        makeJourney(match),
        makeJourney(other),
      ],
    )

    expect(recommendations[0].game.id).toBe('match')
    expect(recommendations[0].reasons).toContainEqual({ kind: 'taste', tag: 'Cozy' })
  })

  it('uses canonical genres and themes as taste metadata', () => {
    const favorite = makeGame({ id: 'favorite', title: 'Favorite', themes: ['Mystery'] })
    const match = makeGame({ id: 'match', title: 'Match', genres: ['Mystery'] })
    const recommendations = recommendBacklogGames(
      [favorite, match],
      { now, limit: 1, random: () => 0 },
      [
        makeJourney(favorite, { status: 'finished', rating: 10 }),
        makeJourney(match),
      ],
    )

    expect(recommendations[0].game.id).toBe('match')
    expect(recommendations[0].reasons).toContainEqual({ kind: 'taste', tag: 'Mystery' })
  })

  it('caps repeated Journey taste weight per Game', () => {
    const repeated = makeGame({ id: 'repeated', title: 'Repeated', tags: ['Cozy'] })
    const distinctOne = makeGame({ id: 'distinct-one', title: 'Distinct One', tags: ['Horror'] })
    const distinctTwo = makeGame({ id: 'distinct-two', title: 'Distinct Two', tags: ['Horror'] })
    const cozyMatch = makeGame({ id: 'cozy-match', title: 'Cozy Match', tags: ['Cozy'] })
    const horrorMatch = makeGame({ id: 'horror-match', title: 'Horror Match', tags: ['Horror'] })
    const repeatedJourneys = Array.from({ length: 8 }, (_, index) =>
      makeJourney(repeated, { id: `repeat-${index}`, status: 'finished', rating: 10 }),
    )

    const recommendations = recommendBacklogGames(
      [repeated, distinctOne, distinctTwo, cozyMatch, horrorMatch],
      { now, limit: 1, random: () => 0 },
      [
        ...repeatedJourneys,
        makeJourney(distinctOne, { status: 'finished', rating: 10 }),
        makeJourney(distinctTwo, { status: 'finished', rating: 10 }),
        makeJourney(cozyMatch),
        makeJourney(horrorMatch),
      ],
    )

    expect(recommendations[0].game.id).toBe('horror-match')
  })

  it('uses backlog Journey priority and waiting age', () => {
    const oldGame = makeGame({ id: 'old', title: 'Old', createdAt: '2026-05-01T00:00:00.000Z' })
    const priorityGame = makeGame({ id: 'priority', title: 'Priority', priority: null })
    const recommendations = recommendBacklogGames(
      [oldGame, priorityGame],
      { now, limit: 1, random: () => 0 },
      [
        makeJourney(oldGame, { createdAt: '2024-01-01T00:00:00.000Z' }),
        makeJourney(priorityGame, { priority: 'high-interest' }),
      ],
    )

    expect(recommendations[0].game.id).toBe('priority')
    expect(recommendations[0].reasons).toContainEqual({ kind: 'priority', priority: 'high-interest' })
  })
})
