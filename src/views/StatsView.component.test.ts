import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import StatsView from './StatsView.vue'
import type { Game, Journey } from '../types'
import type { FinishedJourneyEntry } from '../lib/journeyAnalytics'

const backlogStore = vi.hoisted(() => ({
  state: null as {
    finishedJourneyEntries: ReturnType<typeof ref<FinishedJourneyEntry[]>>
    games: ReturnType<typeof ref<Game[]>>
    journeys: ReturnType<typeof ref<Journey[]>>
    stats: ReturnType<typeof ref>
  } | null,
}))

vi.mock('../composables/useBacklog', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  backlogStore.state = {
    finishedJourneyEntries: ref<FinishedJourneyEntry[]>([]),
    games: ref<Game[]>([]),
    journeys: ref<Journey[]>([]),
    stats: ref({ backlog: 0, total: 0, playing: 0, ongoing: 0, finished: 0, playLogs: 0 }),
  }

  return { useBacklog: () => backlogStore.state! }
})

vi.mock('../i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function journey(overrides: Partial<Journey>): Journey {
  return {
    id: 'journey',
    gameId: 'game',
    status: 'finished',
    platform: '',
    ownershipType: null,
    priority: null,
    rating: null,
    review: '',
    playTimeHours: null,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('StatsView', () => {
  beforeEach(() => {
    const state = backlogStore.state!
    state.games.value = [{ id: 'game' } as Game, { id: 'second' } as Game]
    state.journeys.value = [
      journey({ id: 'first', playTimeHours: 10, rating: 8, review: 'Good', platform: 'PC' }),
      journey({ id: 'replay', playTimeHours: 5, rating: 10, platform: 'PC' }),
      journey({ id: 'paused', gameId: 'second', status: 'paused' }),
    ]
    state.finishedJourneyEntries.value = [
      { game: state.games.value[0], journey: state.journeys.value[0], isReplay: false, journeyNumber: 1 },
      { game: state.games.value[0], journey: state.journeys.value[1], isReplay: true, journeyNumber: 2 },
    ]
    state.stats.value = { backlog: 0, total: 2, playing: 0, ongoing: 0, finished: 2, playLogs: 7 }
  })

  it('distinguishes unique Games from Journeys and completed replays', () => {
    const wrapper = mount(StatsView)
    const text = wrapper.text()

    expect(text).toContain('statsView.games 2')
    expect(text).toContain('statsView.journeys 3')
    expect(text).toContain('statsView.completedReplays 1')
    expect(text).toContain('statsView.playTime 15 h')
    expect(text).toContain('statsView.averageRating 9/10')
    expect(text).toContain('statsView.topPlatform PC')
  })
})
