<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import {
  GAME_OWNERSHIP_TYPES,
  GAME_PRIORITIES,
  GAME_STATUSES,
  PLATFORM_OPTIONS,
  SUGGESTED_TAGS,
  type GameFormState,
} from '../types'
import {
  getWikidataGameMetadata,
  searchWikidataGames,
  type WikidataGameSuggestion,
} from '../lib/wikidataClient'
import { addDaysDate } from '../lib/dateUtils'
import { isOffline } from '../lib/network'
import { dedupeTags } from '../lib/tags'
const { statusLabel, t, tagLabel } = useI18n()

const {
  canRateCurrentStatus,
  createdAt,
  formatDate,
  isSaving,
  updatedAt,
} = defineProps<{
  canRateCurrentStatus: boolean
  createdAt?: string | null
  formatDate?: (value: string) => string
  isSaving: boolean
  updatedAt?: string | null
}>()

const form = defineModel<GameFormState>('form', { required: true })

const emit = defineEmits<{
  cancel: []
  delete: []
  save: []
}>()

const wikidataSuggestions = ref<WikidataGameSuggestion[]>([])
const isSearchingWikidata = ref(false)
const wikidataSearchFailed = ref(false)
let wikidataSearchTimer: number | null = null
let wikidataAbortController: AbortController | null = null

const selectedTags = computed(() =>
  form.value.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean),
)

const showPlayTimeField = computed(() => form.value.id !== null || form.value.status === 'finished')

const statusOptions = computed(() =>
  GAME_STATUSES.map((status) => ({
    title: statusLabel(status),
    value: status,
  })),
)

const availablePlatforms = computed(() => {
  const sortedPlatforms = [...PLATFORM_OPTIONS].sort((left, right) => left.localeCompare(right))

  if (
    form.value.platform &&
    !PLATFORM_OPTIONS.includes(form.value.platform as (typeof PLATFORM_OPTIONS)[number])
  ) {
    return [form.value.platform, ...sortedPlatforms]
  }

  return sortedPlatforms
})

const ownershipOptions = computed(() => [
  { title: t('ownership.unset'), value: '' },
  ...GAME_OWNERSHIP_TYPES.map((ownershipType) => ({
    title: t(`ownership.${ownershipType}`),
    value: ownershipType,
  })),
])

const pauseNudgeOptions = computed(() => {
  const options = [
    { title: t('form.pauseNudgeNone'), value: '' },
    { title: t('form.pauseNudgeOneWeek'), value: addDaysDate(7) },
    { title: t('form.pauseNudgeTwoWeeks'), value: addDaysDate(14) },
    { title: t('form.pauseNudgeOneMonth'), value: addDaysDate(30) },
  ]

  if (form.value.nudgeAt && !options.some((option) => option.value === form.value.nudgeAt)) {
    options.push({
      title: t('form.pauseNudgeCurrent', { date: form.value.nudgeAt }),
      value: form.value.nudgeAt,
    })
  }

  return options
})

const priorityOptions = computed(() => [
  { title: t('form.priorityUnset'), value: '' },
  ...GAME_PRIORITIES.map((priority) => ({
    title: t(`priority.${priority}`),
    value: priority,
  })),
])

const suggestedTagOptions = computed(() =>
  SUGGESTED_TAGS.map((tag) => ({
    title: tagLabel(tag),
    value: tag,
  })),
)

watch(
  () => (form.value.id ? '' : form.value.title.trim()),
  (title) => {
    queueWikidataSearch(title)
  },
)

function setTags(tags: string[]) {
  form.value.tags = dedupeTags(tags).join(', ')
}

function updateTags(tags: unknown[]) {
  setTags(
    tags
      .map((tag) => {
        if (typeof tag === 'string') {
          return tag
        }

        if (tag && typeof tag === 'object' && 'value' in tag) {
          return String(tag.value)
        }

        return ''
      })
      .filter(Boolean),
  )
}

function updatePlatform(value: unknown) {
  if (typeof value === 'string') {
    form.value.platform = value
    return
  }

  if (value && typeof value === 'object' && 'value' in value) {
    form.value.platform = String(value.value)
    return
  }

  form.value.platform = ''
}

function queueWikidataSearch(title: string) {
  if (wikidataSearchTimer !== null) {
    window.clearTimeout(wikidataSearchTimer)
    wikidataSearchTimer = null
  }

  wikidataAbortController?.abort()
  wikidataAbortController = null
  wikidataSearchFailed.value = false

  if (title.length < 3 || isOffline()) {
    wikidataSuggestions.value = []
    isSearchingWikidata.value = false
    return
  }

  wikidataSearchTimer = window.setTimeout(() => {
    wikidataSearchTimer = null
    void searchWikidataTitles(title)
  }, 450)
}

async function searchWikidataTitles(title: string) {
  if (isOffline()) {
    wikidataSuggestions.value = []
    isSearchingWikidata.value = false
    return
  }

  wikidataAbortController = new AbortController()
  isSearchingWikidata.value = true

  try {
    wikidataSuggestions.value = await searchWikidataGames(title, wikidataAbortController.signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    wikidataSuggestions.value = []
    wikidataSearchFailed.value = true
  } finally {
    isSearchingWikidata.value = false
  }
}

function searchCurrentTitle() {
  queueWikidataSearch(form.value.title.trim())
}

async function useWikidataSuggestion(suggestion: WikidataGameSuggestion) {
  if (!form.value.id) {
    form.value.title = suggestion.title
  }
  form.value.wikidataId = suggestion.id
  wikidataSuggestions.value = []
  wikidataSearchFailed.value = false

  const { tags, developer, publisher, releaseYear } = isOffline()
    ? { tags: [], developer: null, publisher: null, releaseYear: null }
    : await getWikidataGameMetadata(suggestion.id)

  if (tags.length > 0) {
    setTags([...selectedTags.value, ...tags])
  }
  if (developer && !form.value.developer.trim()) {
    form.value.developer = developer
  }
  if (publisher && !form.value.publisher.trim()) {
    form.value.publisher = publisher
  }
  if (releaseYear !== null && !form.value.releaseYear.trim()) {
    form.value.releaseYear = String(releaseYear)
  }
}

</script>

<template>
  <section class="panel form-panel">
    <button
      v-if="form.id"
      type="button"
      class="icon-button form-back-button"
      :aria-label="t('form.cancel')"
      :title="t('form.cancel')"
      @click="emit('cancel')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>

    <div class="section-heading">
      <div>
        <p class="section-kicker">{{ form.id ? t('form.edit') : t('form.newEntry') }}</p>
        <h2>{{ form.id ? t('form.editGame') : t('editView.addTitle') }}</h2>
        <p v-if="form.id" class="section-helper">
          {{
            form.title
              ? t('form.updatingEntry', { title: form.title })
              : t('form.updatingFallback')
          }}
        </p>
        <p v-else class="section-helper">{{ t('form.addEntryHelper') }}</p>
      </div>
    </div>

  <form class="game-form" novalidate @submit.prevent="emit('save')">
      <div class="form-section-heading">
        <p class="section-kicker">{{ t('form.gameDetails') }}</p>
        <p>{{ t('form.gameDetailsHint') }}</p>
      </div>

      <VTextField
        v-model="form.title"
        class="form-control"
        type="text"
        :label="t('form.title')"
        :placeholder="t('form.titlePlaceholder')"
      />

      <VBtn
        v-if="form.id"
        class="metadata-assistant-action"
        type="button"
        variant="outlined"
        :disabled="form.title.trim().length < 3 || isSearchingWikidata"
        :loading="isSearchingWikidata"
        @click="searchCurrentTitle"
      >
        {{ t('form.findMetadata') }}
      </VBtn>

      <div
        v-if="isSearchingWikidata || wikidataSuggestions.length > 0 || wikidataSearchFailed || form.wikidataId"
        class="wikidata-suggestions"
      >
        <p class="field-hint">
          {{
            isSearchingWikidata
              ? t('form.wikidataSearching')
              : wikidataSearchFailed
                ? t('form.wikidataFailed')
                : wikidataSuggestions.length > 0
                  ? t('form.wikidataSuggestions')
                  : t('form.wikidataLinked', { id: form.wikidataId })
          }}
        </p>
        <div v-if="wikidataSuggestions.length > 0" class="wikidata-suggestion-list">
          <button
            v-for="suggestion in wikidataSuggestions"
            :key="suggestion.id"
            class="wikidata-suggestion"
            type="button"
            @click="useWikidataSuggestion(suggestion)"
          >
            <span>{{ suggestion.title }}</span>
            <small>{{ suggestion.description }}</small>
          </button>
        </div>
      </div>

      <VCombobox
        class="form-control tag-combobox"
        chips
        closable-chips
        clearable
        :hint="t('form.tagsHint')"
        :items="suggestedTagOptions"
        :label="t('form.tags')"
        multiple
        persistent-hint
        :placeholder="t('form.addOwnTag')"
        :model-value="selectedTags"
        @update:model-value="updateTags"
      />

      <VExpansionPanels class="more-details-panel" variant="accordion">
        <VExpansionPanel>
          <VExpansionPanelTitle>{{ t('form.moreDetails') }}</VExpansionPanelTitle>
          <VExpansionPanelText>
            <div class="more-details-fields">
              <VTextField
                v-model="form.coverUrl"
                class="form-control"
                type="url"
                inputmode="url"
                :hint="t('form.coverUrlHint')"
                :label="t('form.coverUrl')"
                persistent-hint
                :placeholder="t('form.coverUrlPlaceholder')"
              />

              <div class="split-fields">
                <VTextField
                  v-model="form.releaseYear"
                  class="form-control"
                  type="text"
                  inputmode="numeric"
                  maxlength="4"
                  :hint="t('form.releaseYearHint')"
                  :label="t('form.releaseYear')"
                  persistent-hint
                  :placeholder="t('form.releaseYearPlaceholder')"
                />

                <VTextField
                  v-model="form.developer"
                  class="form-control"
                  type="text"
                  :hint="t('form.developerHint')"
                  :label="t('form.developer')"
                  persistent-hint
                  :placeholder="t('form.developerPlaceholder')"
                />

                <VTextField
                  v-model="form.publisher"
                  class="form-control"
                  type="text"
                  :hint="t('form.publisherHint')"
                  :label="t('form.publisher')"
                  persistent-hint
                  :placeholder="t('form.publisherPlaceholder')"
                />
              </div>
            </div>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>

      <div class="form-section-heading">
        <p class="section-kicker">{{ t('form.journeyDetails') }}</p>
        <p>{{ t('form.journeyDetailsHint') }}</p>
      </div>

      <div class="split-fields">
        <VSelect
          v-model="form.status"
          class="form-control"
          :items="statusOptions"
          :label="t('form.status')"
        />

        <VTextField
          v-if="canRateCurrentStatus"
          v-model="form.rating"
          class="form-control"
          type="text"
          inputmode="numeric"
          maxlength="2"
          :disabled="!canRateCurrentStatus"
          :hint="t('form.ratingHint')"
          :label="t('form.rating')"
          persistent-hint
          :placeholder="t('form.ratingPlaceholder')"
        />
      </div>

      <div class="split-fields">
        <VTextField
          v-if="showPlayTimeField"
          v-model="form.playTimeHours"
          class="form-control"
          type="text"
          inputmode="decimal"
          :hint="t('form.playTimeHint')"
          :label="t('form.playTime')"
          persistent-hint
          :placeholder="t('form.playTimePlaceholder')"
        />

        <VCombobox
          class="form-control"
          clearable
          :hint="t('form.platformHint')"
          :items="availablePlatforms"
          :label="t('form.platform')"
          :model-value="form.platform"
          persistent-hint
          :placeholder="t('form.platformPlaceholder')"
          @update:model-value="updatePlatform"
        />

        <VSelect
          v-model="form.ownershipType"
          class="form-control"
          :hint="t('form.ownershipTypeHint')"
          :items="ownershipOptions"
          :label="t('form.ownershipType')"
          persistent-hint
        />

        <VSelect
          v-model="form.priority"
          class="form-control"
          :hint="t('form.priorityHint')"
          :items="priorityOptions"
          :label="t('form.priority')"
          persistent-hint
        />

        <VTextField
          v-if="form.status === 'finished'"
          v-model="form.finishedAt"
          class="form-control"
          type="date"
          :hint="t('form.finishedOnHint')"
          :label="t('form.finishedOn')"
          persistent-hint
        />

        <VSelect
          v-if="form.status === 'paused'"
          v-model="form.nudgeAt"
          class="form-control"
          :hint="t('form.pauseNudgeHint')"
          :items="pauseNudgeOptions"
          :label="t('form.pauseNudge')"
          persistent-hint
        />
      </div>

      <VTextarea
        v-if="form.id"
        v-model="form.review"
        class="form-control"
        auto-grow
        max-rows="12"
        rows="4"
        :hint="t('form.reviewHint')"
        :label="t('form.review')"
        persistent-hint
        :placeholder="t('form.reviewPlaceholder')"
      />

      <div
        v-if="form.id && formatDate && (createdAt || updatedAt)"
        class="edit-meta-strip"
      >
        <span v-if="form.playTimeHours">{{ t('form.playTimeMeta', { hours: form.playTimeHours }) }}</span>
        <span v-if="createdAt">{{ t('form.addedMeta', { date: formatDate(createdAt) }) }}</span>
        <span v-if="updatedAt">{{ t('form.updatedMeta', { date: formatDate(updatedAt) }) }}</span>
      </div>

      <div class="form-actions">
        <VBtn
          class="miolog-primary-action"
          type="submit"
          color="primary"
          :disabled="isSaving"
          :loading="isSaving"
        >
          {{ form.id ? t('form.saveChanges') : t('form.addGame') }}
        </VBtn>
      </div>

      <div v-if="form.id" class="form-danger-zone">
        <VBtn type="button" variant="outlined" color="error" @click="emit('delete')">
          {{ t('form.deleteGame') }}
        </VBtn>
      </div>
    </form>
  </section>
</template>
