import { describe, expect, it } from 'vitest'
import {
  createLibraryCsv,
  createLibraryCsvTemplate,
  parseLibraryCsvImport,
} from './libraryCsv'
import type { Game } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    title: 'Game 1',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: 'Keep this review',
    platform: '',
    ownershipType: null,
    tags: ['Keep'],
    igdbId: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('libraryCsv', () => {
  it('exports the dictated MioLog columns', () => {
    const csv = createLibraryCsv([
      makeGame({
        id: 'chrono',
        title: 'Chrono, Trigger',
        status: 'finished',
        rating: 10,
        playTimeHours: 28,
        finishedAt: '2024-03-14',
        platform: 'Nintendo DS',
        coverUrl: 'https://example.test/cover.webp',
      }),
    ])

    expect(csv).toContain('mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl')
    expect(csv).toContain('chrono,"Chrono, Trigger",finished,Nintendo DS,10,28,2024-03-14')
  })

  it('creates a template with a placeholder game', () => {
    const csv = createLibraryCsvTemplate()

    expect(csv).toContain('mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl')
    expect(csv).toContain('After the Stream Went Dark')
    expect(csv).toContain('2026-06-03')
  })

  it('imports the downloaded template as a valid new game', () => {
    const plan = parseLibraryCsvImport(
      createLibraryCsvTemplate(),
      [],
      { createId: () => 'after-stream', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.errors).toEqual([])
    expect(plan.createCount).toBe(1)
    expect(plan.gamesToSave[0]).toMatchObject({
      id: 'after-stream',
      title: 'After the Stream Went Dark',
      status: 'finished',
      platform: 'Steam',
      rating: 7,
      playTimeHours: 2,
      finishedAt: '2026-06-03',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/cobtw4.webp',
    })
  })

  it('updates by mioId while preserving non-CSV fields', () => {
    const plan = parseLibraryCsvImport(
      [
        'mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl',
        'g1,Updated,finished,Steam,9,42,2024-03-14,https://example.test/updated.webp',
      ].join('\n'),
      [makeGame({ id: 'g1', review: 'Do not touch', tags: ['JRPG'], priority: 'high-interest' })],
      { createId: () => 'new-id', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.errors).toEqual([])
    expect(plan.updateCount).toBe(1)
    expect(plan.gamesToSave[0]).toMatchObject({
      id: 'g1',
      title: 'Updated',
      status: 'finished',
      rating: 9,
      playTimeHours: 42,
      finishedAt: '2024-03-14',
      platform: 'Steam',
      coverUrl: 'https://example.test/updated.webp',
      review: 'Do not touch',
      tags: ['JRPG'],
      priority: 'high-interest',
    })
  })

  it('creates blank-mioId rows and defaults empty status to backlog', () => {
    const plan = parseLibraryCsvImport(
      [
        'mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl',
        ',New Game,,PC,,12.5,,',
      ].join('\n'),
      [],
      { createId: () => 'created-id', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.errors).toEqual([])
    expect(plan.createCount).toBe(1)
    expect(plan.gamesToSave[0]).toMatchObject({
      id: 'created-id',
      title: 'New Game',
      status: 'backlog',
      rating: null,
      playTimeHours: 12.5,
    })
  })

  it('skips unknown mioIds and invalid values instead of guessing', () => {
    const plan = parseLibraryCsvImport(
      [
        'mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl',
        'missing,Known Title,completed,PC,11,-3,03/14/2024,not-a-url',
      ].join('\n'),
      [],
      { createId: () => 'created-id', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.gamesToSave).toEqual([])
    expect(plan.skippedCount).toBe(1)
    expect(plan.errors).toEqual([
      'Line 2: mioId "missing" does not match this library. Use JSON backup to migrate MioLog data, or clear mioId to import this row as a new game.',
      'Line 2: status must be one of backlog, playing, ongoing, finished, paused, abandoned.',
      'Line 2: rating must be a whole number from 1 to 10.',
      'Line 2: playTimeHours must be a non-negative number using "." for decimals.',
      'Line 2: coverUrl must be a valid http(s) URL.',
    ])
  })

  it('strictly validates finishedDate as YYYY-MM-DD for finished games', () => {
    const plan = parseLibraryCsvImport(
      [
        'mioId,title,status,platform,rating,playTimeHours,finishedDate,coverUrl',
        ',Finished Game,finished,PC,8,10,2024-02-30,',
        ',Paused Game,paused,PC,,10,2024-03-14,',
      ].join('\n'),
      [],
      { createId: () => 'created-id', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.skippedCount).toBe(1)
    expect(plan.errors).toEqual(['Line 2: finishedDate must be a real calendar date.'])
    expect(plan.warnings).toEqual(['Line 3: finishedDate is only imported for finished games.'])
    expect(plan.gamesToSave[0]).toMatchObject({
      title: 'Paused Game',
      status: 'paused',
      finishedAt: null,
    })
  })

  it('requires the exact template columns', () => {
    const plan = parseLibraryCsvImport(
      'title,status\nGame,backlog\n',
      [],
      { createId: () => 'created-id', now: '2026-06-03T00:00:00.000Z' },
    )

    expect(plan.errors).toEqual([
      'Missing required columns: mioId, platform, rating, playTimeHours, finishedDate, coverUrl.',
    ])
  })
})
