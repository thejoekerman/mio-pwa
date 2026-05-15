<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import GameLibraryPanel from '../components/GameLibraryPanel.vue'
import { useBacklog } from '../composables/useBacklog'
import type { Game, GameOwnershipFilter, GameSortOption, GameStatus } from '../types'
const router = useRouter()
const {
  filteredGames,
  finishedYearFilter,
  finishedYearOptions,
  games,
  ownershipFilter,
  resetLibraryFilters,
  searchQuery,
  selectGame,
  selectedGameId,
  sortOption,
  startEditingGame,
  statusFilter,
  updateGameStatus,
} = useBacklog()

const hasActiveFilters = computed(
  () =>
    searchQuery.value.trim().length > 0 ||
    ownershipFilter.value !== 'all' ||
    (statusFilter.value === 'finished' && finishedYearFilter.value !== 'all') ||
    statusFilter.value !== 'all' ||
    sortOption.value !== 'created-desc',
)

function handleLibraryUpdate(payload: {
  finishedYearFilter?: 'all' | string
  ownershipFilter?: GameOwnershipFilter
  searchQuery?: string
  sortOption?: GameSortOption
  statusFilter?: 'all' | GameStatus
}) {
  if (payload.searchQuery !== undefined) {
    searchQuery.value = payload.searchQuery
  }

  if (payload.sortOption !== undefined) {
    sortOption.value = payload.sortOption
  }

  if (payload.ownershipFilter !== undefined) {
    ownershipFilter.value = payload.ownershipFilter
  }

  if (payload.statusFilter !== undefined) {
    statusFilter.value = payload.statusFilter

    if (payload.statusFilter !== 'finished') {
      finishedYearFilter.value = 'all'
    }
  }

  if (payload.finishedYearFilter !== undefined) {
    finishedYearFilter.value = payload.finishedYearFilter
  }
}

async function openGame(gameId: string) {
  await selectGame(gameId)
  await router.push({ name: 'game', params: { gameId } })
}

async function editGame(game: Game) {
  startEditingGame(game)
  await router.push({ name: 'edit-game', params: { gameId: game.id } })
}
</script>

<template>
  <div class="view-stack">
    <GameLibraryPanel
      :change-game-status="updateGameStatus"
      :filtered-games="filteredGames"
      :finished-year-filter="finishedYearFilter"
      :finished-year-options="finishedYearOptions"
      :games-count="games.length"
      :has-active-filters="hasActiveFilters"
      :ownership-filter="ownershipFilter"
      :search-query="searchQuery"
      :selected-game-id="selectedGameId"
      :sort-option="sortOption"
      :status-filter="statusFilter"
      @edit-game="editGame"
      @reset-filters="resetLibraryFilters"
      @select-game="openGame"
      @update="handleLibraryUpdate"
    />
  </div>
</template>
