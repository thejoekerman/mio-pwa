import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import LibraryView from './LibraryView.vue'
import type { Game, GameOwnershipFilter, GameSortOption, GameStatus } from '../types'
import type { ComputedRef, Ref } from 'vue'

interface LibraryBacklogState {
  filteredGames: ComputedRef<Game[]>
  finishedYearFilter: Ref<'all' | string>
  finishedYearOptions: Ref<string[]>
  games: Ref<Game[]>
  ownershipFilter: Ref<GameOwnershipFilter>
  resetLibraryFilters: ReturnType<typeof vi.fn>
  searchQuery: Ref<string>
  selectGame: ReturnType<typeof vi.fn>
  selectedGameId: Ref<string | null>
  sortOption: Ref<GameSortOption>
  statusFilter: Ref<'all' | GameStatus>
  updateGameStatus: ReturnType<typeof vi.fn>
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

const backlogStore = vi.hoisted(() => ({ state: null as LibraryBacklogState | null }))

function useMockBacklogState() {
  if (!backlogStore.state) {
    throw new Error('Mock backlog state was not initialized.')
  }

  return backlogStore.state
}

vi.mock('../composables/useBacklog', async () => {
  const { computed, ref } = await vi.importActual<typeof import('vue')>('vue')
  const games = ref<Game[]>([])
  const searchQuery = ref('')
  const statusFilter = ref<'all' | GameStatus>('backlog')
  const ownershipFilter = ref<GameOwnershipFilter>('all')
  const finishedYearFilter = ref<'all' | string>('all')
  const sortOption = ref<GameSortOption>('created-desc')

  backlogStore.state = {
    filteredGames: computed(() =>
      games.value.filter((entry) =>
        statusFilter.value === 'all' ? true : entry.status === statusFilter.value,
      ),
    ),
    finishedYearFilter,
    finishedYearOptions: ref(['2026']),
    games,
    ownershipFilter,
    resetLibraryFilters: vi.fn(),
    searchQuery,
    selectGame: vi.fn(),
    selectedGameId: ref<string | null>(null),
    sortOption,
    statusFilter,
    updateGameStatus: vi.fn(),
  }

  return {
    useBacklog: useMockBacklogState,
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const LibraryPanelStub = defineComponent({
  name: 'GameLibraryPanel',
  props: [
    'filteredGames',
    'finishedYearFilter',
    'hasActiveFilters',
    'ownershipFilter',
    'searchQuery',
    'sortOption',
    'statusFilter',
  ],
  emits: ['resetFilters', 'selectGame', 'update'],
  setup(props, { emit }) {
    return () =>
      h('section', [
        h('p', { 'data-testid': 'status-filter' }, props.statusFilter),
        h('p', { 'data-testid': 'finished-year-filter' }, props.finishedYearFilter),
        h('p', { 'data-testid': 'has-active-filters' }, String(props.hasActiveFilters)),
        h(
          'ul',
          (props.filteredGames as Game[]).map((entry) => h('li', { key: entry.id }, entry.title)),
        ),
        h('button', {
          'data-testid': 'filter-finished',
          onClick: () => emit('update', { statusFilter: 'finished' }),
        }),
        h('button', {
          'data-testid': 'filter-playing',
          onClick: () => emit('update', { statusFilter: 'playing' }),
        }),
        h('button', {
          'data-testid': 'set-year',
          onClick: () => emit('update', { finishedYearFilter: '2026' }),
        }),
        h('button', {
          'data-testid': 'search',
          onClick: () => emit('update', { searchQuery: 'zelda' }),
        }),
        h('button', {
          'data-testid': 'reset',
          onClick: () => emit('resetFilters'),
        }),
      ])
  },
})

describe('LibraryView', () => {
  beforeEach(() => {
    const backlogState = useMockBacklogState()
    backlogState.games.value = [
      game({ id: 'backlog', title: 'Waiting Game', status: 'backlog' }),
      game({ id: 'playing', title: 'Active Game', status: 'playing' }),
      game({ id: 'finished', title: 'Finished Game', status: 'finished', finishedAt: '2026-01-01' }),
    ]
    backlogState.searchQuery.value = ''
    backlogState.statusFilter.value = 'backlog'
    backlogState.ownershipFilter.value = 'all'
    backlogState.finishedYearFilter.value = 'all'
    backlogState.sortOption.value = 'created-desc'
    vi.clearAllMocks()
  })

  it('updates status filters and resets finished-year filtering when leaving finished', async () => {
    const backlogState = useMockBacklogState()
    const wrapper = mount(LibraryView, {
      global: {
        stubs: {
          GameLibraryPanel: LibraryPanelStub,
        },
      },
    })

    expect(wrapper.text()).toContain('Waiting Game')
    expect(wrapper.text()).not.toContain('Active Game')

    await wrapper.get('[data-testid="filter-finished"]').trigger('click')
    await wrapper.get('[data-testid="set-year"]').trigger('click')

    expect(backlogState.statusFilter.value).toBe('finished')
    expect(backlogState.finishedYearFilter.value).toBe('2026')
    expect(wrapper.text()).toContain('Finished Game')

    await wrapper.get('[data-testid="filter-playing"]').trigger('click')

    expect(backlogState.statusFilter.value).toBe('playing')
    expect(backlogState.finishedYearFilter.value).toBe('all')
    expect(wrapper.text()).toContain('Active Game')
  })

  it('marks search as an active filter and delegates reset to the backlog composable', async () => {
    const backlogState = useMockBacklogState()
    const wrapper = mount(LibraryView, {
      global: {
        stubs: {
          GameLibraryPanel: LibraryPanelStub,
        },
      },
    })

    expect(wrapper.get('[data-testid="has-active-filters"]').text()).toBe('false')

    await wrapper.get('[data-testid="search"]').trigger('click')

    expect(backlogState.searchQuery.value).toBe('zelda')
    expect(wrapper.get('[data-testid="has-active-filters"]').text()).toBe('true')

    await wrapper.get('[data-testid="reset"]').trigger('click')

    expect(backlogState.resetLibraryFilters).toHaveBeenCalledOnce()
  })
})
