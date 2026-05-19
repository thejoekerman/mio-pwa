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
  wikidataEntityIdsFromClaims,
  wikidataEntityLabelMap,
  wikidataReleaseYearFromClaims,
  tagsFromGenreLabel,
} from '../lib/wikidataUtils'
const { statusLabel, t, tagLabel } = useI18n()

interface WikidataSuggestion {
  id: string
  title: string
  description: string
}

const props = defineProps<{
  canRateCurrentStatus: boolean
  canUseIgdbMetadata: boolean
  createdAt?: string | null
  formatDate?: (value: string) => string
  form: GameFormState
  isSaving: boolean
  updatedAt?: string | null
}>()

const emit = defineEmits<{
  cancel: []
  delete: []
  save: []
}>()

const wikidataSuggestions = ref<WikidataSuggestion[]>([])
const isSearchingWikidata = ref(false)
const wikidataSearchFailed = ref(false)
let wikidataSearchTimer: number | null = null
let wikidataAbortController: AbortController | null = null

const selectedTags = computed(() =>
  props.form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean),
)

const showPlayTimeField = computed(() => props.form.id !== null || props.form.status === 'finished')

const statusOptions = computed(() =>
  GAME_STATUSES.map((status) => ({
    title: statusLabel(status),
    value: status,
  })),
)

const availablePlatforms = computed(() => {
  const sortedPlatforms = [...PLATFORM_OPTIONS].sort((left, right) => left.localeCompare(right))

  if (
    props.form.platform &&
    !PLATFORM_OPTIONS.includes(props.form.platform as (typeof PLATFORM_OPTIONS)[number])
  ) {
    return [props.form.platform, ...sortedPlatforms]
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

  if (props.form.nudgeAt && !options.some((option) => option.value === props.form.nudgeAt)) {
    options.push({
      title: t('form.pauseNudgeCurrent', { date: props.form.nudgeAt }),
      value: props.form.nudgeAt,
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
  () => (props.form.id ? '' : props.form.title.trim()),
  (title) => {
    queueWikidataSearch(title)
  },
)

function setTags(tags: string[]) {
  const uniqueTags = new Map<string, string>()

  tags
    .map((tag) => tag.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((tag) => {
      const normalized = tag.toLowerCase()

      if (!uniqueTags.has(normalized)) {
        uniqueTags.set(normalized, tag)
      }
    })

  props.form.tags = [...uniqueTags.values()].join(', ')
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
    props.form.platform = value
    return
  }

  if (value && typeof value === 'object' && 'value' in value) {
    props.form.platform = String(value.value)
    return
  }

  props.form.platform = ''
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
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      uselang: 'en',
      origin: '*',
      limit: '8',
      search: title,
    })
    const response = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
      signal: wikidataAbortController.signal,
    })

    if (!response.ok) {
      throw new Error('Wikidata search failed.')
    }

    const payload = await response.json() as { search?: unknown[] }
    wikidataSuggestions.value = Array.isArray(payload.search)
      ? payload.search.flatMap(wikidataSuggestionFromEntity).slice(0, 4)
      : []
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

function wikidataSuggestionFromEntity(entity: unknown): WikidataSuggestion[] {
  if (!entity || typeof entity !== 'object') {
    return []
  }

  const record = entity as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : ''
  const title = typeof record.label === 'string' ? record.label : ''
  const description = typeof record.description === 'string' ? record.description : ''

  if (!id || !title || !isLikelyVideoGameDescription(description)) {
    return []
  }

  return [
    {
      id,
      title,
      description,
    },
  ]
}

function isLikelyVideoGameDescription(description: string) {
  return (
    /video game|computer game/i.test(description) &&
    !/soundtrack|podcast|film|theme/i.test(description)
  )
}

async function useWikidataSuggestion(suggestion: WikidataSuggestion) {
  props.form.title = suggestion.title
  wikidataSuggestions.value = []
  wikidataSearchFailed.value = false

  const { tags, developer, publisher, releaseYear } = await getWikidataMetadata(suggestion.id)

  if (tags.length > 0) {
    setTags([...selectedTags.value, ...tags])
  }
  if (developer && !props.form.developer.trim()) {
    props.form.developer = developer
  }
  if (publisher && !props.form.publisher.trim()) {
    props.form.publisher = publisher
  }
  if (releaseYear !== null && !props.form.releaseYear.trim()) {
    props.form.releaseYear = String(releaseYear)
  }
}

async function getWikidataMetadata(itemId: string) {
  const empty = { tags: [] as string[], developer: null as string | null, publisher: null as string | null, releaseYear: null as number | null }

  if (isOffline()) {
    return empty
  }

  try {
    const claimsParams = new URLSearchParams({
      action: 'wbgetclaims',
      format: 'json',
      origin: '*',
      entity: itemId,
    })
    const claimsResponse = await fetch(`https://www.wikidata.org/w/api.php?${claimsParams.toString()}`)

    if (!claimsResponse.ok) {
      return empty
    }

    const claimsData = await claimsResponse.json()
    const genreIds = wikidataEntityIdsFromClaims(claimsData, 'P136').slice(0, 6)
    const developerIds = wikidataEntityIdsFromClaims(claimsData, 'P178').slice(0, 1)
    const publisherIds = wikidataEntityIdsFromClaims(claimsData, 'P123').slice(0, 1)
    const releaseYear = wikidataReleaseYearFromClaims(claimsData)

    const entityIds = [...genreIds, ...developerIds, ...publisherIds]

    if (entityIds.length === 0) {
      return { ...empty, releaseYear }
    }

    const labelParams = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      languages: 'en',
      languagefallback: '1',
      origin: '*',
      props: 'labels',
      ids: entityIds.join('|'),
    })
    const labelResponse = await fetch(`https://www.wikidata.org/w/api.php?${labelParams.toString()}`)

    if (!labelResponse.ok) {
      return { ...empty, releaseYear }
    }

    const labelMap = wikidataEntityLabelMap(await labelResponse.json())
    const tags = [
      ...new Set(genreIds.map((id) => labelMap[id]).filter((l): l is string => Boolean(l)).flatMap(tagsFromGenreLabel)),
    ].slice(0, 3)
    const developer = developerIds.length > 0 ? (labelMap[developerIds[0]] ?? null) : null
    const publisher = publisherIds.length > 0 ? (labelMap[publisherIds[0]] ?? null) : null

    return { tags, developer, publisher, releaseYear }
  } catch {
    return empty
  }
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function addDaysDate(days: number) {
  const date = new Date()

  date.setDate(date.getDate() + days)

  return date.toISOString().slice(0, 10)
}
</script>

<template>
  <section class="panel form-panel">
    <button
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
      <VTextField
        v-model="form.title"
        class="form-control"
        type="text"
        :label="t('form.title')"
        :placeholder="t('form.titlePlaceholder')"
      />

      <div
        v-if="!form.id && (isSearchingWikidata || wikidataSuggestions.length > 0 || wikidataSearchFailed)"
        class="wikidata-suggestions"
      >
        <p class="field-hint">
          {{
            isSearchingWikidata
              ? t('form.wikidataSearching')
              : wikidataSearchFailed
                ? t('form.wikidataFailed')
                : t('form.wikidataSuggestions')
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
                v-if="canUseIgdbMetadata"
                v-model="form.igdbId"
                class="form-control"
                type="text"
                inputmode="numeric"
                :hint="t('form.igdbIdHint')"
                :label="t('form.igdbId')"
                persistent-hint
                :placeholder="t('form.igdbIdPlaceholder')"
              />

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

                <VSelect
                  v-model="form.priority"
                  class="form-control"
                  :hint="t('form.priorityHint')"
                  :items="priorityOptions"
                  :label="t('form.priority')"
                  persistent-hint
                />
              </div>

              <div class="split-fields">
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

      <VTextarea
        v-if="form.id"
        v-model="form.review"
        class="form-control"
        rows="5"
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
