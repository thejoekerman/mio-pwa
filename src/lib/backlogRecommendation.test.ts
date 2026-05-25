import { describe, expect, it } from 'vitest'
import { recommendBacklogGames } from './backlogRecommendation'
import type { Game } from '../types'

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
})
