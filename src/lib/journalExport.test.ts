import { describe, expect, it } from 'vitest'
import { createGameJournalFileName, createGameJournalMarkdown } from './journalExport'
import type { Game, LogEntry } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g',
    title: 'Outer Wilds',
    status: 'finished',
    rating: 9,
    playTimeHours: 22.5,
    review: 'A masterpiece of curiosity-driven design.',
    platform: 'Steam',
    ownershipType: 'digital',
    tags: ['Adventure', 'Mystery'],
    finishedAt: '2026-04-15',
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l',
    gameId: 'g',
    content: 'First log.',
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-01-10T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const labels = {
  finished: 'Finished',
  format: 'Format',
  noLogs: 'No logs yet.',
  overview: 'Overview',
  platform: 'Platform',
  playLogs: 'Play logs',
  playTime: 'Play time',
  rating: 'Rating',
  status: 'Status',
  tags: 'Tags',
}

const formatDate = (value: string) => value.slice(0, 10)

describe('createGameJournalFileName', () => {
  it('slugifies the title and appends the export date', () => {
    const fileName = createGameJournalFileName(
      makeGame({ title: 'Outer Wilds!!' }),
      new Date('2026-05-28T10:00:00.000Z'),
    )
    expect(fileName).toBe('miolog-outer-wilds-journal-2026-05-28.md')
  })

  it('falls back to "game" when the title produces an empty slug', () => {
    const fileName = createGameJournalFileName(
      makeGame({ title: '!!!' }),
      new Date('2026-05-28T10:00:00.000Z'),
    )
    expect(fileName).toBe('miolog-game-journal-2026-05-28.md')
  })

  it('strips leading and trailing separators', () => {
    const fileName = createGameJournalFileName(
      makeGame({ title: '   Hollow Knight   ' }),
      new Date('2026-05-28T10:00:00.000Z'),
    )
    expect(fileName).toBe('miolog-hollow-knight-journal-2026-05-28.md')
  })
})

describe('createGameJournalMarkdown', () => {
  it('renders title, overview metadata, and play logs', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame(),
      labels,
      logs: [
        makeLog({ id: 'l1', content: 'Found the quantum moon!', createdAt: '2026-02-01T00:00:00Z' }),
        makeLog({ id: 'l2', content: 'Solved the ATP loop.', createdAt: '2026-03-01T00:00:00Z' }),
      ],
      ownershipLabel: 'Digital',
      statusLabel: 'Finished',
    })

    expect(md).toContain('# Outer Wilds')
    expect(md).toContain('## Overview')
    expect(md).toContain('- Status: Finished')
    expect(md).toContain('- Platform: Steam')
    expect(md).toContain('- Format: Digital')
    expect(md).toContain('- Rating: 9/10')
    expect(md).toContain('- Play time: 22.5 h')
    expect(md).toContain('- Tags: Adventure, Mystery')
    expect(md).toContain('- Finished: 2026-04-15')
    expect(md).toContain('## Play logs')
    expect(md).toContain('### 2026-02-01')
    expect(md).toContain('Found the quantum moon!')
    expect(md).toContain('### 2026-03-01')
  })

  it('omits the overview section when no metadata is present', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame({ rating: null, playTimeHours: null, platform: '', tags: [], finishedAt: null }),
      labels,
      logs: [],
      ownershipLabel: null,
      statusLabel: '',
    })

    expect(md).not.toContain('## Overview')
    expect(md).toContain('## Play logs')
  })

  it('omits null/blank metadata rows individually', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame({ rating: null, playTimeHours: null, tags: [] }),
      labels,
      logs: [],
      ownershipLabel: null,
      statusLabel: 'Finished',
    })

    expect(md).toContain('- Status: Finished')
    expect(md).not.toContain('- Rating:')
    expect(md).not.toContain('- Play time:')
    expect(md).not.toContain('- Tags:')
    expect(md).not.toContain('- Format:')
  })

  it('emits the "no logs" placeholder when there are no entries', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame(),
      labels,
      logs: [],
      ownershipLabel: 'Digital',
      statusLabel: 'Finished',
    })

    expect(md).toContain('_No logs yet._')
  })

  it('does NOT include the review (review has its own dedicated export)', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame({ review: 'This should not appear.' }),
      labels,
      logs: [],
      ownershipLabel: null,
      statusLabel: 'Finished',
    })

    expect(md).not.toContain('This should not appear.')
  })

  it('collapses internal whitespace in the title and platform', () => {
    const md = createGameJournalMarkdown({
      formatDate,
      game: makeGame({ title: 'Outer   \nWilds', platform: 'PC\t\tEpic' }),
      labels,
      logs: [],
      ownershipLabel: null,
      statusLabel: 'Finished',
    })

    expect(md).toContain('# Outer Wilds')
    expect(md).toContain('- Platform: PC Epic')
  })
})
