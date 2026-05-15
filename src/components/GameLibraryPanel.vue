<script setup lang="ts">
import { computed } from 'vue'
import GameCover from './GameCover.vue'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import { getTimeToBeatHours } from '../lib/timeToBeat'
import {
  GAME_OWNERSHIP_FILTERS,
  GAME_SORT_OPTIONS,
  GAME_STATUSES,
  type Game,
  type GameOwnershipFilter,
  type GameSortOption,
  type GameStatus,
  type LibraryViewMode,
} from '../types'
const { ownershipLabel, sortLabel, statusLabel, t } = useI18n()
const { settings, setLibraryViewMode } = useSettings()

const props = defineProps<{
  changeGameStatus: (game: Game, status: GameStatus) => void | Promise<void>
  filteredGames: Game[]
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
  editGame: [game: Game]
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
  ...GAME_STATUSES.map((status) => ({
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

function formatTimeToBeat(game: Game) {
  const hours = getTimeToBeatHours(game)

  return hours === null ? null : `~${hours} h TTB`
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

    <div class="toolbar">
      <div class="segmented-control" :aria-label="t('library.viewMode')">
        <button
          type="button"
          class="segmented-control-button"
          :class="{ active: viewMode === 'list' }"
          :aria-pressed="viewMode === 'list'"
          @click="viewMode = 'list'"
        >
          {{ t('library.listView') }}
        </button>
        <button
          type="button"
          class="segmented-control-button"
          :class="{ active: viewMode === 'shelf' }"
          :aria-pressed="viewMode === 'shelf'"
          @click="viewMode = 'shelf'"
        >
          {{ t('library.shelfView') }}
        </button>
      </div>

      <VTextField
        class="form-control"
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
      <VSelect
        class="form-control"
        hide-details
        :items="statusFilterOptions"
        :model-value="statusFilter"
        @update:model-value="
          emit('update', {
            statusFilter: $event as 'all' | GameStatus,
          })
        "
      />
      <VSelect
        class="form-control"
        hide-details
        :aria-label="t('library.ownershipFilter')"
        :items="ownershipFilterOptions"
        :model-value="ownershipFilter"
        @update:model-value="
          emit('update', {
            ownershipFilter: $event as GameOwnershipFilter,
          })
        "
      />
      <VSelect
        v-if="statusFilter === 'finished'"
        class="form-control"
        hide-details
        :items="finishedYearFilterOptions"
        :model-value="finishedYearFilter"
        @update:model-value="
          emit('update', {
            finishedYearFilter: $event as 'all' | string,
          })
        "
      />
      <VSelect
        class="form-control"
        hide-details
        :items="sortOptions"
        :model-value="sortOption"
        @update:model-value="
          emit('update', {
            sortOption: $event as GameSortOption,
          })
        "
      />
      <VBtn
        v-if="hasActiveFilters"
        type="button"
        variant="outlined"
        color="primary"
        @click="emit('resetFilters')"
      >
        {{ t('library.resetFilters') }}
      </VBtn>
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
            <button
              type="button"
              class="icon-button card-edit-icon"
              :aria-label="t('library.editDetails')"
              :title="t('library.editDetails')"
              @click.stop="emit('editGame', game)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>

          <div class="game-card-copy">
            <div class="game-card-top">
              <div>
                <h3>{{ game.title }}</h3>
              </div>
            </div>

            <div class="card-metadata-list">
              <span>{{ game.platform || t('detail.anywhere') }}</span>
              <span v-if="game.ownershipType" class="soft-meta">
                {{ ownershipLabel(game.ownershipType) }}
              </span>
              <span v-for="tag in game.tags" :key="tag">{{ tag }}</span>
              <span v-if="formatTimeToBeat(game)" class="soft-meta">{{ formatTimeToBeat(game) }}</span>
              <span v-if="game.rating !== null" class="rating">{{ game.rating }}/10</span>
              <span v-if="game.finishedAt" class="soft-meta">{{ t('library.finishedOn', { date: game.finishedAt }) }}</span>
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
                    {{ statusLabel(game.status) }}
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
