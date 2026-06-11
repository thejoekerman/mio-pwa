import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import HomeView from './HomeView.vue'
import type { Game, Journey } from '../types'
import type { Ref } from 'vue'

interface HomeBacklogState {
  currentFocus: Ref<Game | null>
  dismissBackupReminder: ReturnType<typeof vi.fn>
  duePausedGames: Ref<Game[]>
  earnedTrophyViews: Ref<unknown[]>
  exportBackup: ReturnType<typeof vi.fn>
  finishedYearOptions: Ref<string[]>
  formatDate: ReturnType<typeof vi.fn>
  games: Ref<Game[]>
  journeys: Ref<Journey[]>
  logDraft: Ref<string>
  logs: Ref<unknown[]>
  recentLogs: Ref<unknown[]>
  saveCurrentLog: ReturnType<typeof vi.fn>
  selectGame: ReturnType<typeof vi.fn>
  setFeedback: ReturnType<typeof vi.fn>
  shouldShowBackupReminder: Ref<boolean>
  snoozePausedGame: ReturnType<typeof vi.fn>
  trophyViews: Ref<unknown[]>
  updateCurrentJourneyStatus: ReturnType<typeof vi.fn>
}

function game(overrides: Partial<Game>): Game {
  return {
    id: 'game-id',
    title: 'Game',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    igdbUrl: null,
    igdbTtbHastilySeconds: null,
    igdbTtbNormallySeconds: null,
    igdbTtbCompletelySeconds: null,
    igdbTtbCount: null,
    igdbTtbUpdatedAt: null,
    igdbDevelopers: null,
    igdbPublishers: null,
    igdbThemes: null,
    igdbGameModes: null,
    releaseYear: null,
    priority: null,
    developer: null,
    publisher: null,
    coverUrl: null,
    review: '',
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const backlogStore = vi.hoisted(() => ({ state: null as HomeBacklogState | null }))

function useMockBacklogState() {
  if (!backlogStore.state) {
    throw new Error('Mock backlog state was not initialized.')
  }

  return backlogStore.state
}

vi.mock('../composables/useBacklog', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  backlogStore.state = {
    currentFocus: ref<Game | null>(null),
    dismissBackupReminder: vi.fn(),
    duePausedGames: ref<Game[]>([]),
    earnedTrophyViews: ref([]),
    exportBackup: vi.fn(),
    finishedYearOptions: ref<string[]>([]),
    formatDate: vi.fn((value: string) => value),
    games: ref<Game[]>([]),
    journeys: ref<Journey[]>([]),
    logDraft: ref(''),
    logs: ref([]),
    recentLogs: ref([]),
    saveCurrentLog: vi.fn(),
    selectGame: vi.fn(),
    setFeedback: vi.fn(),
    shouldShowBackupReminder: ref(false),
    snoozePausedGame: vi.fn(),
    trophyViews: ref([]),
    updateCurrentJourneyStatus: vi.fn(),
  }

  return {
    useBacklog: useMockBacklogState,
  }
})

vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    name: 'RouterLink',
    setup(_, { slots }) {
      return () => h('a', slots.default?.())
    },
  }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('embla-carousel', () => ({
  default: () => ({
    destroy: vi.fn(),
    on: vi.fn(),
    scrollTo: vi.fn(),
    selectedScrollSnap: () => 0,
  }),
}))

const CoverStub = defineComponent({
  name: 'CoverStub',
  props: {
    title: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => h('span', props.title)
  },
})

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  setup(_, { slots }) {
    return () => h('button', slots.default?.())
  },
})

describe('HomeView', () => {
  beforeEach(() => {
    const backlogState = useMockBacklogState()
    backlogState.currentFocus.value = null
    backlogState.duePausedGames.value = []
    backlogState.earnedTrophyViews.value = []
    backlogState.finishedYearOptions.value = []
    backlogState.games.value = []
    backlogState.logDraft.value = ''
    backlogState.logs.value = []
    backlogState.recentLogs.value = []
    backlogState.shouldShowBackupReminder.value = false
    backlogState.trophyViews.value = []
    vi.clearAllMocks()

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('surfaces playing and ongoing games on Home, not finished or paused games', () => {
    const backlogState = useMockBacklogState()
    backlogState.games.value = [
      game({ id: 'playing', title: 'Active Quest', status: 'playing' }),
      game({ id: 'ongoing', title: 'Endless Season', status: 'ongoing' }),
      game({ id: 'finished', title: 'Old Credits', status: 'finished' }),
      game({ id: 'paused', title: 'Quiet Pause', status: 'paused' }),
    ]

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          GameCover: CoverStub,
          HomeChoiceCard: true,
          HomeEmptyState: true,
          IconExternalLink: true,
          RouterLink: defineComponent({
            name: 'RouterLink',
            setup(_, { slots }) {
              return () => h('a', slots.default?.())
            },
          }),
          TrophyIcon: true,
          VBtn: ButtonStub,
          VTextarea: true,
        },
      },
    })

    expect(wrapper.text()).toContain('Active Quest')
    expect(wrapper.text()).toContain('Endless Season')
    expect(wrapper.text()).not.toContain('Old Credits')
    expect(wrapper.text()).not.toContain('Quiet Pause')
    expect(backlogState.selectGame).toHaveBeenCalledWith('playing')
  })
})
