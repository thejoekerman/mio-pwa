<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameFormPanel from '../components/GameFormPanel.vue'
import { useBacklog } from '../composables/useBacklog'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import type { Game } from '../types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { settings } = useSettings()

const {
  canRateCurrentStatus,
  formatDate,
  gameForm,
  games,
  isSaving,
  removeGame,
  resetForm,
  saveCurrentGame,
  startCreatingGame,
  startEditingGame,
} = useBacklog()

const routeGameId = computed(() =>
  typeof route.params.gameId === 'string' ? route.params.gameId : null,
)
const gamePendingDelete = ref<Game | null>(null)
const deleteDialogOpen = ref(false)
const isSyncConfigured = computed(
  () => settings.syncApiBaseUrl.trim() !== '' && settings.syncToken.trim() !== '',
)

watch(
  [routeGameId, games],
  ([gameId]) => {
    if (!gameId) {
      startCreatingGame()
      return
    }

    const game = games.value.find((entry) => entry.id === gameId)
    if (game) {
      startEditingGame(game)
    }
  },
  { immediate: true },
)

async function handleSave() {
  const savedGame = await saveCurrentGame()

  if (savedGame) {
    await router.push({ name: 'game', params: { gameId: savedGame.id } })
  }
}

function handleReset() {
  startCreatingGame()
  void router.replace({ name: 'add-game' })
}

function handleDelete() {
  const gameId = routeGameId.value

  if (!gameId) {
    return
  }

  const game = games.value.find((entry) => entry.id === gameId)

  if (!game) {
    return
  }

  gamePendingDelete.value = game
  deleteDialogOpen.value = true
}

function cancelDelete() {
  deleteDialogOpen.value = false
  gamePendingDelete.value = null
}

function handleDeleteDialogUpdate(open: boolean) {
  deleteDialogOpen.value = open

  if (!open) {
    gamePendingDelete.value = null
  }
}

async function confirmDelete() {
  const game = gamePendingDelete.value

  deleteDialogOpen.value = false
  gamePendingDelete.value = null

  if (!game) {
    return
  }

  const deleted = await removeGame(game)

  if (deleted) {
    resetForm()
    await router.push({ name: 'library' })
  }
}
</script>

<template>
  <div class="view-stack">
    <GameFormPanel
      :can-rate-current-status="canRateCurrentStatus"
      :created-at="games.find((entry) => entry.id === routeGameId)?.createdAt ?? null"
      :format-date="formatDate"
      :form="gameForm"
      :is-saving="isSaving"
      :is-sync-configured="isSyncConfigured"
      :updated-at="games.find((entry) => entry.id === routeGameId)?.updatedAt ?? null"
      @delete="handleDelete"
      @reset="handleReset"
      @save="handleSave"
    />

    <VDialog
      :model-value="deleteDialogOpen"
      class="confirm-dialog"
      max-width="420"
      @update:model-value="handleDeleteDialogUpdate"
    >
      <VCard>
        <VCardTitle>{{ t('form.deleteGame') }}</VCardTitle>
        <VCardText>
          {{ t('feedback.confirmDelete', { title: gamePendingDelete?.title ?? '' }) }}
        </VCardText>
        <VCardActions>
          <VBtn type="button" variant="outlined" color="primary" @click="cancelDelete">
            {{ t('form.cancelDelete') }}
          </VBtn>
          <VBtn type="button" color="error" variant="flat" @click="confirmDelete">
            {{ t('form.deleteGame') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <button v-if="routeGameId" class="ghost-button edit-secondary-action" type="button" @click="resetForm">
      {{ t('form.clearFormFields') }}
    </button>
  </div>
</template>
