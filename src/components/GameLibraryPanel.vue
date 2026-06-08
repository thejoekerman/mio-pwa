<script setup lang="ts">
import { computed } from 'vue'
import GameCover from './GameCover.vue'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import { getDisplayDeveloper, getDisplayPublisher } from '../lib/gameMetadata'
import { getTimeToBeatHours } from '../lib/timeToBeat'
import {
  GAME_OWNERSHIP_FILTERS,
  GAME_SORT_OPTIONS,
  GAME_STATUSES,
  type Game,
  type GameDisplayStatus,
  type GameOwnershipFilter,
  type GameSortOption,
  type GameStatus,
  type LibraryViewMode,
} from '../types'
const { ownershipLabel, sortLabel, statusLabel, t } = useI18n()
const { settings, setLibraryViewMode } = useSettings()
const STATUS_FILTER_ORDER: GameStatus[] = [
  'backlog',
  'finished',
  'playing',
  'ongoing',
  'paused',
  'abandoned',
]

const props = defineProps<{
  changeGameStatus: (game: Game, status: GameStatus) => void | Promise<void>
  filteredGames: Game[]
  displayStatusByGameId: ReadonlyMap<string, GameDisplayStatus>
  finishedYearFilter: 'all' | string
  finishedYearOptions: string[]
  gamesCount: number
  hasActiveFilters: boolean
  ownershipFilter: GameOwnershipFilter
  searchQuery: string
  selectedGameId: string | null
  sortOption: GameSortOption
  statusFilter: 'all' | GameStatus
}>()

const emit = defineEmits<{
  resetFilters: []
  selectGame: [gameId: string]
  update: [
    payload: {
      searchQuery?: string
      finishedYearFilter?: 'all' | string
      ownershipFilter?: GameOwnershipFilter
      sortOption?: GameSortOption
      statusFilter?: 'all' | GameStatus
    },
  ]
}>()

const statusFilterOptions = computed(() => [
  { title: statusLabel('all'), value: 'all' },
  ...STATUS_FILTER_ORDER.map((status) => ({
    title: statusLabel(status),
    value: status,
  })),
])

const ownershipFilterOptions = computed(() =>
  GAME_OWNERSHIP_FILTERS.map((ownershipType) => ({
    title: ownershipLabel(ownershipType),
    value: ownershipType,
  })),
)

const finishedYearFilterOptions = computed(() => [
  { title: t('library.anyFinishYear'), value: 'all' },
  ...props.finishedYearOptions.map((year) => ({
    title: t('library.finishedInYear', { year }),
    value: year,
  })),
])

const sortOptions = computed(() =>
  GAME_SORT_OPTIONS.map((option) => ({
    title: sortLabel(option, props.statusFilter === 'finished' ? 'finished' : undefined),
    value: option,
  })),
)
const viewMode = computed({
  get: () => settings.libraryViewMode,
  set: (value: LibraryViewMode) => setLibraryViewMode(value),
})
const nextViewMode = computed<LibraryViewMode>(() => (viewMode.value === 'list' ? 'shelf' : 'list'))
const nextViewModeLabel = computed(() =>
  nextViewMode.value === 'list' ? t('library.switchToListView') : t('library.switchToShelfView'),
)
const activeFilterChips = computed(() => {
  const chips: Array<{ key: string; title: string; clear: () => void }> = []

  if (props.ownershipFilter !== 'all') {
    chips.push({
      key: 'ownership',
      title: ownershipLabel(props.ownershipFilter),
      clear: () => emit('update', { ownershipFilter: 'all' }),
    })
  }

  if (props.statusFilter === 'finished' && props.finishedYearFilter !== 'all') {
    chips.push({
      key: 'finishedYear',
      title: t('library.finishedInYear', { year: props.finishedYearFilter }),
      clear: () => emit('update', { finishedYearFilter: 'all' }),
    })
  }

  return chips
})
const extraFilterCount = computed(() => {
  let count = props.ownershipFilter === 'all' ? 0 : 1

  if (props.statusFilter === 'finished' && props.finishedYearFilter !== 'all') {
    count += 1
  }

  return count
})
const listMetadata = computed(() =>
  new Map(
    props.filteredGames.map((game) => [
      game.id,
      [
        game.platform || t('detail.anywhere'),
        game.ownershipType ? ownershipLabel(game.ownershipType) : null,
        ...game.tags,
        game.releaseYear ? String(game.releaseYear) : null,
        creditLine(game),
        formatTimeToBeat(game),
        game.rating !== null ? `${game.rating}/10` : null,
        game.finishedAt ? t('library.finishedOn', { date: game.finishedAt }) : null,
      ].filter((item): item is string => Boolean(item)),
    ]),
  ),
)

function formatTimeToBeat(game: Game) {
  const hours = getTimeToBeatHours(game)

  return hours === null ? null : `~${hours} h TTB`
}

function creditLine(game: Game) {
  const developer = getDisplayDeveloper(game)
  const publisher = getDisplayPublisher(game)

  if (developer && publisher) {
    return t('detail.igdbCreditsFull', { developers: developer, publishers: publisher })
  }

  if (developer) {
    return t('detail.igdbCreditsDevelopers', { developers: developer })
  }

  if (publisher) {
    return t('detail.igdbCreditsPublishers', { publishers: publisher })
  }

  return null
}

async function handleStatusChange(
  changeGameStatus: (game: Game, status: GameStatus) => void | Promise<void>,
  game: Game,
  status: GameStatus,
) {
  await changeGameStatus(game, status)
}
</script>

<template>
  <section class="panel library-panel">
    <div class="section-heading">
      <div>
        <p class="section-kicker">{{ t('library.kicker') }}</p>
        <h2>{{ t('library.yourGames') }}</h2>
        <p class="section-helper">
          {{ t('library.visibleOutOfTotal', { visible: filteredGames.length, total: gamesCount }) }}
        </p>
      </div>
    </div>

    <div class="library-toolbar">
      <div class="library-toolbar-main">
        <VTextField
          class="form-control library-search-control"
          :model-value="searchQuery"
          type="search"
          hide-details
          :placeholder="t('library.searchPlaceholder')"
          @update:model-value="
            emit('update', {
              searchQuery: $event,
            })
          "
        />

        <div class="library-toolbar-actions">
          <button
            type="button"
            class="library-round-action"
            :aria-label="nextViewModeLabel"
            :title="nextViewModeLabel"
            @click="viewMode = nextViewMode"
          >
            <svg v-if="viewMode === 'list'" aria-hidden="true" viewBox="0 0 24 24">
              <rect x="4" y="4" width="6" height="6" rx="1.2" />
              <rect x="14" y="4" width="6" height="6" rx="1.2" />
              <rect x="4" y="14" width="6" height="6" rx="1.2" />
              <rect x="14" y="14" width="6" height="6" rx="1.2" />
            </svg>
            <svg v-else aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 6h12" />
              <path d="M8 12h12" />
              <path d="M8 18h12" />
              <path d="M4 6h.01" />
              <path d="M4 12h.01" />
              <path d="M4 18h.01" />
            </svg>
          </button>

          <VMenu location="bottom end">
            <template #activator="{ props: activatorProps }">
              <VBtn
                v-bind="activatorProps"
                class="library-round-action"
                type="button"
                icon
                variant="outlined"
                color="primary"
                :aria-label="t('library.sort')"
                :title="sortLabel(sortOption, statusFilter === 'finished' ? 'finished' : undefined)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M4 7h11" />
                  <path d="M4 12h8" />
                  <path d="M4 17h5" />
                  <path d="M17 5v14" />
                  <path d="m14 16 3 3 3-3" />
                </svg>
              </VBtn>
            </template>

            <VList class="status-menu-list" density="compact">
              <VListItem
                v-for="option in sortOptions"
                :key="option.value"
                :active="sortOption === option.value"
                :title="option.title"
                @click="emit('update', { sortOption: option.value as GameSortOption })"
              />
            </VList>
          </VMenu>

          <VMenu location="bottom end" :close-on-content-click="true">
            <template #activator="{ props: activatorProps }">
              <VBtn
                v-bind="activatorProps"
                class="library-round-action"
                type="button"
                icon
                :variant="extraFilterCount > 0 ? 'flat' : 'outlined'"
                color="primary"
                :aria-label="t('library.filters')"
                :title="t('library.filters')"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M4 6h16" />
                  <path d="M7 12h10" />
                  <path d="M10 18h4" />
                </svg>
                <span v-if="extraFilterCount > 0" class="library-action-badge">{{ extraFilterCount }}</span>
              </VBtn>
            </template>

            <VList class="status-menu-list library-filter-menu" density="compact">
              <VListSubheader>{{ t('library.ownershipFilter') }}</VListSubheader>
              <VListItem
                v-for="option in ownershipFilterOptions"
                :key="option.value"
                :active="ownershipFilter === option.value"
                :title="option.title"
                @click="emit('update', { ownershipFilter: option.value as GameOwnershipFilter })"
              />
              <template v-if="statusFilter === 'finished'">
                <VDivider />
                <VListSubheader>{{ t('library.finishYearFilter') }}</VListSubheader>
                <VListItem
                  v-for="option in finishedYearFilterOptions"
                  :key="option.value"
                  :active="finishedYearFilter === option.value"
                  :title="option.title"
                  @click="emit('update', { finishedYearFilter: option.value as 'all' | string })"
                />
              </template>
            </VList>
          </VMenu>

          <VBtn
            v-if="hasActiveFilters"
            type="button"
            variant="text"
            color="primary"
            @click="emit('resetFilters')"
          >
            {{ t('library.resetFilters') }}
          </VBtn>
        </div>
      </div>

      <div class="status-filter-row" :aria-label="t('library.statusFilter')">
        <VChip
          v-for="option in statusFilterOptions"
          :key="option.value"
          class="status-filter-chip"
          :class="{ active: statusFilter === option.value }"
          :color="statusFilter === option.value ? 'primary' : undefined"
          :variant="statusFilter === option.value ? 'flat' : 'outlined'"
          @click="emit('update', { statusFilter: option.value as 'all' | GameStatus })"
        >
          {{ option.title }}
        </VChip>
      </div>

      <div v-if="activeFilterChips.length > 0" class="active-filter-row">
        <VChip
          v-for="chip in activeFilterChips"
          :key="chip.key"
          closable
          variant="tonal"
          color="primary"
          @click:close="chip.clear"
        >
          {{ chip.title }}
        </VChip>
      </div>
    </div>

    <div v-if="filteredGames.length > 0 && viewMode === 'list'" class="game-list">
      <article
        v-for="game in filteredGames"
        :key="game.id"
        class="game-card"
        :class="{
          selected: game.id === selectedGameId,
          active: game.status === 'playing',
        }"
        @click="emit('selectGame', game.id)"
      >
          <div class="game-card-shell">
            <div class="game-card-cover-rail">
              <GameCover :title="game.title" :cover-url="game.coverUrl" size="small" />
            </div>

          <div class="game-card-copy">
            <div class="game-card-top">
              <div>
                <h3>{{ game.title }}</h3>
              </div>
            </div>

            <div class="card-metadata-list">
              <template
                v-for="(item, index) in listMetadata.get(game.id) ?? []"
                :key="`${game.id}-${item}-${index}`"
              >
                <span>{{ item }}</span>
                <span
                  v-if="index < (listMetadata.get(game.id)?.length ?? 0) - 1"
                  class="metadata-separator"
                  aria-hidden="true"
                >&nbsp;· </span>
              </template>
            </div>

            <div class="card-state-row">
              <VMenu location="bottom start">
                <template #activator="{ props: activatorProps }">
                  <button
                    v-bind="activatorProps"
                    type="button"
                    class="status-pill small"
                    @click.stop
                  >
                    {{ statusLabel(displayStatusByGameId.get(game.id) ?? game.status) }}
                  </button>
                </template>

                <VList class="status-menu-list" density="compact">
                  <VListItem
                    v-for="status in GAME_STATUSES"
                    :key="`${game.id}-${status}`"
                    :active="game.status === status"
                    :title="statusLabel(status)"
                    @click.stop="handleStatusChange(changeGameStatus, game, status)"
                  />
                </VList>
              </VMenu>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="filteredGames.length > 0" class="shelf-grid">
      <button
        v-for="game in filteredGames"
        :key="game.id"
        type="button"
        class="shelf-game-card"
        :class="{
          selected: game.id === selectedGameId,
          active: game.status === 'playing',
        }"
        :aria-label="t('library.openShelfGame', { title: game.title })"
        @click="emit('selectGame', game.id)"
      >
        <GameCover :title="game.title" :cover-url="game.coverUrl" size="small" />
        <span v-if="game.platform" class="shelf-game-platform">{{ game.platform }}</span>
      </button>
    </div>

    <div v-else class="empty-state">
      <h3>{{ t('library.noMatches') }}</h3>
      <p>{{ t('library.noMatchesBody') }}</p>
    </div>
  </section>
</template>
