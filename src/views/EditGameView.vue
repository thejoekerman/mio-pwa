<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameFormPanel from '../components/GameFormPanel.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'
import type { Game } from '../types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const {
  canRateCurrentStatus,
  addCurrentJourneyToGame,
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
const duplicateGamePending = ref<Game | null>(null)
const duplicateDialogOpen = ref(false)
const duplicateIdentityGame = computed(() => {
  if (routeGameId.value || !/^Q\d+$/.test(gameForm.wikidataId)) {
    return null
  }

  return games.value.find((game) =>
    game.externalReferences?.some(
      (reference) =>
        reference.provider === 'wikidata' && reference.externalId === gameForm.wikidataId,
    ),
  ) ?? null
})
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
  const duplicate = duplicateIdentityGame.value

  if (duplicate) {
    duplicateGamePending.value = duplicate
    duplicateDialogOpen.value = true
    return
  }

  await saveAndNavigate()
}

async function saveAndNavigate() {
  const savedGame = await saveCurrentGame()

  if (savedGame) {
    await router.replace({ name: 'game', params: { gameId: savedGame.id } })
  }
}

function cancelDuplicateChoice() {
  duplicateDialogOpen.value = false
  duplicateGamePending.value = null
}

function handleDuplicateDialogUpdate(open: boolean) {
  duplicateDialogOpen.value = open

  if (!open) {
    duplicateGamePending.value = null
  }
}

async function createSeparateGame() {
  duplicateDialogOpen.value = false
  duplicateGamePending.value = null
  await saveAndNavigate()
}

async function addJourneyToExistingGame() {
  const game = duplicateGamePending.value

  duplicateDialogOpen.value = false
  duplicateGamePending.value = null

  if (game && await addCurrentJourneyToGame(game)) {
    await router.replace({ name: 'game', params: { gameId: game.id } })
  }
}

async function handleCancel() {
  const gameId = routeGameId.value

  if (gameId) {
    const game = games.value.find((entry) => entry.id === gameId)

    if (game) {
      startEditingGame(game)
    }

    await router.replace({ name: 'game', params: { gameId } })
    return
  }

  resetForm()
  await router.replace({ name: 'library' })
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
    await router.replace({ name: 'library' })
  }
}
</script>

<template>
  <div class="view-stack">
    <GameFormPanel
      :can-rate-current-status="canRateCurrentStatus"
      :created-at="games.find((entry) => entry.id === routeGameId)?.createdAt ?? null"
      :format-date="formatDate"
      v-model:form="gameForm"
      :is-saving="isSaving"
      :updated-at="games.find((entry) => entry.id === routeGameId)?.updatedAt ?? null"
      @cancel="handleCancel"
      @delete="handleDelete"
      @save="handleSave"
    />

    <VDialog
      :model-value="duplicateDialogOpen"
      class="confirm-dialog"
      max-width="440"
      @update:model-value="handleDuplicateDialogUpdate"
    >
      <VCard>
        <VCardTitle>{{ t('form.duplicateGameTitle') }}</VCardTitle>
        <VCardText>
          {{ t('form.duplicateGameBody', { title: duplicateGamePending?.title ?? '' }) }}
        </VCardText>
        <VCardActions class="duplicate-game-actions">
          <VBtn type="button" variant="text" @click="cancelDuplicateChoice">
            {{ t('form.cancel') }}
          </VBtn>
          <VBtn type="button" variant="outlined" color="primary" @click="createSeparateGame">
            {{ t('form.createSeparateGame') }}
          </VBtn>
          <VBtn type="button" color="primary" variant="flat" @click="addJourneyToExistingGame">
            {{ t('form.addJourneyToExisting') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

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
