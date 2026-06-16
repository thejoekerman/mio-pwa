import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import StatsView from './StatsView.vue'
import type { Game, Journey, JourneyLogEntry } from '../types'
import type { FinishedJourneyEntry } from '../lib/journeyAnalytics'

const backlogStore = vi.hoisted(() => ({
  state: null as {
    finishedJourneyEntries: ReturnType<typeof ref<FinishedJourneyEntry[]>>
    games: ReturnType<typeof ref<Game[]>>
    journeyLogs: ReturnType<typeof ref<JourneyLogEntry[]>>
    journeys: ReturnType<typeof ref<Journey[]>>
    stats: ReturnType<typeof ref>
  } | null,
}))

const settingsStore = vi.hoisted(() => ({
  settings: { theme: 'journal' },
}))

vi.mock('chart.js', () => ({
  ArcElement: {},
  BarElement: {},
  CategoryScale: {},
  Chart: { register: vi.fn() },
  Filler: {},
  Legend: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Tooltip: {},
}))

vi.mock('vue-chartjs', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')
  const chartComponent = (name: string, className: string) => defineComponent({
    name,
    props: {
      data: { type: Object, required: true },
      options: { type: Object, required: true },
    },
    setup(props) {
      return () => h('div', {
        class: ['mock-chart', className],
        'data-options': JSON.stringify(props.options),
        'data-data': JSON.stringify(props.data),
      })
    },
  })

  return {
    Bar: chartComponent('Bar', 'mock-chart--bar'),
    Doughnut: chartComponent('Doughnut', 'mock-chart--doughnut'),
    Line: chartComponent('Line', 'mock-chart--line'),
  }
})

vi.mock('../composables/useBacklog', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  backlogStore.state = {
    finishedJourneyEntries: ref<FinishedJourneyEntry[]>([]),
    games: ref<Game[]>([]),
    journeyLogs: ref<JourneyLogEntry[]>([]),
    journeys: ref<Journey[]>([]),
    stats: ref({ backlog: 0, total: 0, playing: 0, ongoing: 0, finished: 0, playLogs: 0 }),
  }

  return { useBacklog: () => backlogStore.state! }
})

vi.mock('../composables/useSettings', () => ({
  useSettings: () => settingsStore,
}))

vi.mock('../i18n', () => ({
  useI18n: () => ({
    statusLabel: (status: string) => `status.${status}`,
    t: (key: string) => key,
  }),
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

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game',
    title: 'Game',
    status: 'finished',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function log(overrides: Partial<JourneyLogEntry> = {}): JourneyLogEntry {
  return {
    id: 'log',
    journeyId: 'first',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('StatsView', () => {
  beforeEach(() => {
    settingsStore.settings.theme = 'journal'

    const state = backlogStore.state!
    state.games.value = [
      game({ platform: 'PC' }),
      game({ id: 'second', title: 'Second', platform: 'Switch', status: 'playing' }),
    ]
    state.journeys.value = [
      journey({ id: 'first', playTimeHours: 10, rating: 8, review: 'Good', platform: 'PC', finishedAt: '2026-01-02' }),
      journey({ id: 'replay', playTimeHours: 5, rating: 10, platform: 'PC', finishedAt: '2026-02-02' }),
      journey({ id: 'paused', gameId: 'second', status: 'paused' }),
    ]
    state.finishedJourneyEntries.value = [
      { game: state.games.value[0], journey: state.journeys.value[0], isReplay: false, journeyNumber: 1 },
      { game: state.games.value[0], journey: state.journeys.value[1], isReplay: true, journeyNumber: 2 },
    ]
    state.journeyLogs.value = [log({ id: 'a' }), log({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' })]
    state.stats.value = { backlog: 0, total: 2, playing: 0, ongoing: 0, finished: 2, playLogs: 7 }
  })

  it('shows headline stats and chart sections', () => {
    const wrapper = mount(StatsView)
    const text = wrapper.text()

    expect(text).toContain('statsView.games2')
    expect(text).not.toContain('statsView.journeys')
    expect(text).toContain('statsView.finishedGames1')
    expect(text).toContain('statsView.activeGames1')
    expect(text).toContain('statsView.playTime15 h')
    expect(text).toContain('statsView.averageRating9/10')
    expect(text).toContain('statsView.libraryShape')
    expect(text).toContain('statsView.backlogPressure')
    expect(text).toContain('statsView.journalActivity')
    expect(text).toContain('statsView.platformMix')
    expect(wrapper.findAll('.mock-chart')).toHaveLength(4)
  })

  it('uses dark chart text in the Polar theme', () => {
    settingsStore.settings.theme = 'polar'

    const wrapper = mount(StatsView)
    const doughnutOptions = JSON.parse(wrapper.find('.mock-chart--doughnut').attributes('data-options') ?? '{}')
    const barOptions = JSON.parse(wrapper.find('.mock-chart--bar').attributes('data-options') ?? '{}')

    expect(doughnutOptions.plugins.legend.labels.color).toBe('#31536f')
    expect(barOptions.scales.x.ticks.color).toBe('#31536f')
    expect(barOptions.scales.y.ticks.color).toBe('#31536f')
    expect(barOptions.scales.x.grid.color).toBe('rgba(0, 80, 120, 0.16)')
  })
})
