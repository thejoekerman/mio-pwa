<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import packageJson from '../../package.json'
import { useBacklog } from '../composables/useBacklog'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import { APP_LANGUAGES, APP_THEMES, type BackupData, type BackupImportMode } from '../types'
import { isDemoMode } from '../lib/appMode'
import { downloadBackupPayload, downloadTextFile } from '../lib/backupDownload'
import type { LibraryCsvImportPlan } from '../lib/libraryCsv'
import {
  detectWebGpuSupport,
  getModelsForLanguage,
  hasLocalReviewModelForLanguage,
  isStorageQuotaError,
  isWebGpuAvailable,
  isWebGpuError,
  LOCAL_REVIEW_MODELS,
  resolveLocalReviewModel,
} from '../lib/localReviewModels'

const appVersion = packageJson.version
const {
  exportBackup,
  exportLibraryCsv,
  exportLibraryCsvTemplate,
  importLibraryCsv,
  importBackup,
  isSyncConfigured,
  isSyncing,
  isTestingSyncConnection,
  previewLibraryCsvImport,
  resetDemoLibrary,
  setFeedback,
  syncNow,
  testSyncConnection,
} = useBacklog()
const { settings, setAiLocalReviewModel, setLanguage, setTheme } = useSettings()
const { t } = useI18n()
const webGpuAvailable = ref(isWebGpuAvailable())
const fileInput = ref<HTMLInputElement | null>(null)
const importMode = ref<BackupImportMode>('merge')
const backupNotice = ref('')
const backupNoticeTone = ref<'success' | 'error'>('success')
const pendingImportFile = ref<File | null>(null)
const pendingImportInput = ref<HTMLInputElement | null>(null)
const replaceImportDialogOpen = ref(false)
const csvFileInput = ref<HTMLInputElement | null>(null)
const csvNotice = ref('')
const csvNoticeTone = ref<'success' | 'error'>('success')
const csvImportDialogOpen = ref(false)
const csvImportPlan = ref<LibraryCsvImportPlan | null>(null)
const CSV_PREVIEW_MESSAGE_LIMIT = 6
const syncNotice = ref('')
const syncNoticeTone = ref<'success' | 'error'>('success')
const languageOptions = computed(() =>
  APP_LANGUAGES.map((language) => ({
    title: t(`settings.language.${language}`),
    value: language,
  })),
)
const themeOptions = computed(() =>
  APP_THEMES.map((theme) => ({
    title: t(`settings.theme.${theme}`),
    value: theme,
  })),
)
const importModeOptions = computed(() => [
  { title: t('settings.mergeMode'), value: 'merge' },
  ...(!isSyncConfigured.value ? [{ title: t('settings.replaceMode'), value: 'replace' }] : []),
])
const csvPreviewIssueSummary = computed(() => {
  const plan = csvImportPlan.value

  if (!plan || (plan.errors.length === 0 && plan.warnings.length === 0)) {
    return ''
  }

  return t('settings.csvPreviewIssueSummary', {
    errors: plan.errors.length,
    warnings: plan.warnings.length,
  })
})
const csvPreviewErrorsTitle = computed(() =>
  t('settings.csvPreviewErrorsTitle', {
    shown: Math.min(csvImportPlan.value?.errors.length ?? 0, CSV_PREVIEW_MESSAGE_LIMIT),
    total: csvImportPlan.value?.errors.length ?? 0,
  }),
)
const csvPreviewWarningsTitle = computed(() =>
  t('settings.csvPreviewWarningsTitle', {
    shown: Math.min(csvImportPlan.value?.warnings.length ?? 0, CSV_PREVIEW_MESSAGE_LIMIT),
    total: csvImportPlan.value?.warnings.length ?? 0,
  }),
)
const csvPreviewErrors = computed(() =>
  (csvImportPlan.value?.errors ?? []).slice(0, CSV_PREVIEW_MESSAGE_LIMIT).map(formatCsvPreviewMessage),
)
const csvPreviewWarnings = computed(() =>
  (csvImportPlan.value?.warnings ?? []).slice(0, CSV_PREVIEW_MESSAGE_LIMIT).map(formatCsvPreviewMessage),
)
const localModelCacheStatus = ref<Record<string, boolean>>({})
// Only offer models that can actually write in the current app language — the
// small models output garbage in German, so they're filtered out when in DE.
const localModelOptions = computed(() =>
  getModelsForLanguage(settings.language).map((model) => {
    const base = `${model.name} · ${t(`settings.localAiTier.${model.tier}`)} · ${model.sizeLabel}`
    return {
      title: localModelCacheStatus.value[model.id] ? `✓ ${base}` : base,
      value: model.id,
    }
  }),
)
const hasModelForLanguage = computed(() => hasLocalReviewModelForLanguage(settings.language))
const effectiveModelId = computed(() =>
  resolveLocalReviewModel(settings.aiLocalReviewModel, settings.language),
)

function formatCsvPreviewMessage(message: string) {
  return message.replace(
    /^Line (\d+): "(.+)" already exists with this platform\. Export CSV to bulk-edit existing games, or change the platform\/title to import a separate game\.$/,
    (_match, line: string, title: string) =>
      t('settings.csvPreviewDuplicateMessage', { line, title }),
  )
}
const selectedLocalModel = computed(
  () => LOCAL_REVIEW_MODELS.find((model) => model.id === effectiveModelId.value) ?? null,
)

type LocalModelStatus = 'checking' | 'not-cached' | 'downloading' | 'ready' | 'error'
const localModelStatus = ref<LocalModelStatus>('checking')
const localModelProgress = ref(0)
const localModelPhase = ref<'downloading' | 'preparing'>('downloading')
const localModelError = ref('')
const localModelPercent = computed(() => (localModelProgress.value * 100).toFixed(1))
const confirmDownloadOpen = ref(false)

function updateLocalModel(value: string | null) {
  if (value) {
    setAiLocalReviewModel(value)
  }
}

// Reflect the selected model's status from the cache map, without re-checking —
// used when the user just switches the picker between known models.
function syncSelectedStatusFromMap() {
  if (localModelStatus.value === 'downloading') {
    return
  }

  const map = localModelCacheStatus.value
  if (effectiveModelId.value in map) {
    localModelStatus.value = map[effectiveModelId.value] ? 'ready' : 'not-cached'
  }
}

async function refreshLocalModelStatus() {
  if (!webGpuAvailable.value || !settings.aiLocalReviewDraftEnabled) {
    return
  }

  if (localModelStatus.value !== 'downloading') {
    localModelStatus.value = 'checking'
  }

  try {
    const { isLocalModelCached } = await import('../lib/localReviewDraft')
    // Check only the current language's models, and apply each result as it
    // resolves — checking an un-downloaded model makes WebLLM fetch its manifest,
    // which can be slow, and must not block the others or stick on "checking".
    await Promise.all(
      getModelsForLanguage(settings.language).map(async (model) => {
        const cached = await isLocalModelCached(model.id)
        localModelCacheStatus.value = { ...localModelCacheStatus.value, [model.id]: cached }
        syncSelectedStatusFromMap()
      }),
    )
  } catch {
    localModelStatus.value = 'not-cached'
  }
}

function requestLocalModelDownload() {
  confirmDownloadOpen.value = true
}

async function confirmLocalModelDownload() {
  confirmDownloadOpen.value = false
  const modelId = effectiveModelId.value
  localModelStatus.value = 'downloading'
  localModelProgress.value = 0
  localModelPhase.value = 'downloading'
  localModelError.value = ''

  try {
    const { prepareLocalModel } = await import('../lib/localReviewDraft')
    await prepareLocalModel(modelId, (progress, text) => {
      localModelProgress.value = progress
      // WebLLM runs two passes (fetch shards, then GPU load); distinguish them so
      // the second one doesn't look like a re-download.
      localModelPhase.value = /fetch|download/i.test(text) ? 'downloading' : 'preparing'
    })
    localModelCacheStatus.value = { ...localModelCacheStatus.value, [modelId]: true }
    localModelStatus.value = 'ready'
  } catch (error) {
    console.error(error)
    localModelError.value = isStorageQuotaError(error)
      ? t('feedback.localModelStorageFull')
      : isWebGpuError(error)
        ? t('settings.localAiUnsupported')
        : t('settings.localAiDownloadFailed')
    localModelStatus.value = 'error'
  }
}

async function removeLocalModelDownload() {
  const modelId = effectiveModelId.value

  try {
    const { removeLocalModel } = await import('../lib/localReviewDraft')
    await removeLocalModel(modelId)
  } catch (error) {
    console.error(error)
  } finally {
    localModelCacheStatus.value = { ...localModelCacheStatus.value, [modelId]: false }
    localModelStatus.value = 'not-cached'
  }
}

// Switching the picker (or app language) changes the effective model. If we've
// already checked it, reflect status instantly; otherwise (e.g. first switch to a
// new language's model) run a scoped check rather than leaving it unknown.
watch(effectiveModelId, (id) => {
  if (id in localModelCacheStatus.value) {
    syncSelectedStatusFromMap()
  } else {
    void refreshLocalModelStatus()
  }
})

// Turning the feature on (re)scans which models are already downloaded.
watch(
  () => settings.aiLocalReviewDraftEnabled,
  (enabled) => {
    if (enabled) {
      void refreshLocalModelStatus()
    }
  },
)

watch(isSyncConfigured, (configured) => {
  if (configured && importMode.value === 'replace') {
    importMode.value = 'merge'
  }
})

onMounted(async () => {
  webGpuAvailable.value = await detectWebGpuSupport()

  if (settings.aiLocalReviewDraftEnabled) {
    void refreshLocalModelStatus()
  }
})
const lastSyncedLabel = computed(() => {
  if (!settings.lastSyncedAt) {
    return null
  }

  return new Intl.DateTimeFormat(settings.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(settings.lastSyncedAt))
})
const backupReminderMeta = computed(() =>
  isSyncConfigured.value
    ? t('settings.backupReminderDisabledBySync')
    : settings.lastBackupExportedAt
      ? t('settings.backupReminderLastExported', {
          date: settings.lastBackupExportedAt.slice(0, 10),
        })
      : t('settings.backupReminderNeverExported'),
)

function triggerImport() {
  fileInput.value?.click()
}

function triggerCsvImport() {
  csvFileInput.value?.click()
}

function updateLanguage(value: string | null) {
  if (value && APP_LANGUAGES.includes(value as typeof settings.language)) {
    setLanguage(value as typeof settings.language)
  }
}

function updateTheme(value: string | null) {
  if (value && APP_THEMES.includes(value as typeof settings.theme)) {
    setTheme(value as typeof settings.theme)
  }
}

function updateImportMode(value: string | null) {
  if (value === 'merge' || value === 'replace') {
    importMode.value = value
  }
}

async function handleExport() {
  const payload = await exportBackup()

  downloadBackupPayload(payload)
  setFeedback(t('feedback.backupExported', { date: payload.exportedAt.slice(0, 10) }))
  backupNoticeTone.value = 'success'
  backupNotice.value = t('feedback.backupExportedNotice', { date: payload.exportedAt.slice(0, 10) })
}

function handleTemplateCsvExport() {
  downloadTextFile(
    'miolog-library-template.csv',
    exportLibraryCsvTemplate(),
    'text/csv;charset=utf-8',
  )
  csvNoticeTone.value = 'success'
  csvNotice.value = t('settings.csvTemplateExported')
}

async function handleLibraryCsvExport() {
  const payload = await exportLibraryCsv()
  const dateLabel = payload.exportedAt.slice(0, 10)

  downloadTextFile(
    `miolog-library-${dateLabel}.csv`,
    payload.csv,
    'text/csv;charset=utf-8',
  )
  csvNoticeTone.value = 'success'
  csvNotice.value = t('settings.csvLibraryExported')
}

async function handleLibraryCsvImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  try {
    csvImportPlan.value = await previewLibraryCsvImport(await file.text())
    csvImportDialogOpen.value = true
  } catch (error) {
    console.error(error)
    csvNoticeTone.value = 'error'
    csvNotice.value = t('settings.csvImportFailed')
  } finally {
    input.value = ''
  }
}

function cancelLibraryCsvImport() {
  csvImportDialogOpen.value = false
  csvImportPlan.value = null
}

async function confirmLibraryCsvImport() {
  const plan = csvImportPlan.value

  if (!plan || plan.gamesToSave.length === 0) {
    return
  }

  try {
    const result = await importLibraryCsv(plan)

    csvNoticeTone.value = 'success'
    csvNotice.value = t('settings.csvImportCompleted', {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    })
    setFeedback(csvNotice.value)
  } catch (error) {
    console.error(error)
    csvNoticeTone.value = 'error'
    csvNotice.value = t('settings.csvImportFailed')
    setFeedback(csvNotice.value, 'error')
  } finally {
    csvImportDialogOpen.value = false
    csvImportPlan.value = null
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  if (importMode.value === 'replace') {
    pendingImportFile.value = file
    pendingImportInput.value = input
    replaceImportDialogOpen.value = true
    return
  }

  await importSelectedBackup(file, input)
}

function cancelReplaceImport() {
  replaceImportDialogOpen.value = false

  if (pendingImportInput.value) {
    pendingImportInput.value.value = ''
  }

  pendingImportFile.value = null
  pendingImportInput.value = null
}

async function confirmReplaceImport() {
  const file = pendingImportFile.value
  const input = pendingImportInput.value

  replaceImportDialogOpen.value = false
  pendingImportFile.value = null
  pendingImportInput.value = null

  if (!file || !input) {
    return
  }

  await importSelectedBackup(file, input)
}

async function importSelectedBackup(file: File, input: HTMLInputElement) {
  try {
    const raw = await file.text()
    const payload = JSON.parse(raw) as BackupData
    const result = await importBackup(payload, importMode.value)
    backupNoticeTone.value = 'success'
    backupNotice.value =
      importMode.value === 'replace'
        ? t('feedback.backupRestoredNotice', { games: result.games, logs: result.logs })
        : t('feedback.backupMergedNotice', { games: result.games, logs: result.logs })
  } catch (error) {
    console.error(error)
    const message =
      importMode.value === 'replace' && isSyncConfigured.value
        ? t('feedback.backupReplaceSyncBlocked')
        : t('feedback.importFailed')
    setFeedback(message, 'error')
    backupNoticeTone.value = 'error'
    backupNotice.value = message
  } finally {
    input.value = ''
  }
}

async function handleTestConnection() {
  try {
    const result = await testSyncConnection()
    syncNoticeTone.value = 'success'
    syncNotice.value = t('settings.syncConnectedAs', {
      name: result.user.displayName || result.user.email || `#${result.user.id}`,
    })
  } catch (error) {
    console.error(error)
    syncNoticeTone.value = 'error'
    syncNotice.value =
      error instanceof Error ? error.message : t('feedback.syncConnectionFailed')
  }
}

async function handleSyncNow() {
  try {
    const result = await syncNow()
    syncNoticeTone.value = 'success'
    syncNotice.value = t('settings.syncCompletedNotice', {
      games: result.games.filter((game) => game.deletedAt === null).length,
      logs: result.logs.filter((logEntry) => logEntry.deletedAt === null).length,
    })
  } catch (error) {
    console.error(error)
    syncNoticeTone.value = 'error'
    syncNotice.value = error instanceof Error ? error.message : t('feedback.syncFailed')
  }
}
</script>

<template>
  <div class="view-stack">
    <section v-if="isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.demoKicker') }}</p>
          <h2>{{ t('settings.demoTitle') }}</h2>
          <p class="section-helper">{{ t('settings.demoHelper') }}</p>
        </div>
      </div>

      <div class="settings-actions">
        <VBtn class="miolog-primary-action" type="button" color="primary" @click="resetDemoLibrary">
          {{ t('settings.resetDemo') }}
        </VBtn>
      </div>
    </section>

    <section class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.languageKicker') }}</p>
          <h2>{{ t('settings.languageTitle') }}</h2>
          <p class="section-helper">{{ t('settings.languageHelper') }}</p>
        </div>
      </div>

      <div class="settings-grid">
        <VSelect
          class="settings-control"
          :label="t('settings.languageLabel')"
          :items="languageOptions"
          :model-value="settings.language"
          @update:model-value="updateLanguage"
        />
      </div>
    </section>

    <section class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.themeKicker') }}</p>
          <h2>{{ t('settings.themeTitle') }}</h2>
          <p class="section-helper">{{ t('settings.themeHelper') }}</p>
        </div>
      </div>

      <div class="settings-grid">
        <VSelect
          class="settings-control"
          :label="t('settings.themeLabel')"
          :items="themeOptions"
          :model-value="settings.theme"
          @update:model-value="updateTheme"
        />
      </div>
    </section>

    <section v-if="!isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.syncKicker') }}</p>
          <h2>{{ t('settings.syncTitle') }}</h2>
          <p class="section-helper">{{ t('settings.syncHelper') }}</p>
        </div>
      </div>

      <div class="settings-grid">
        <VSwitch
          v-model="settings.autoSyncEnabled"
          class="settings-control settings-switch"
          color="primary"
          hide-details
          :label="t('settings.autoSyncLabel')"
        />

        <VTextField
          v-model="settings.syncApiBaseUrl"
          class="settings-control"
          type="url"
          inputmode="url"
          autocomplete="url"
          :label="t('settings.syncUrlLabel')"
          :placeholder="t('settings.syncUrlPlaceholder')"
        />

        <VTextField
          v-model="settings.syncToken"
          class="settings-control"
          type="password"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :label="t('settings.syncTokenLabel')"
          :placeholder="t('settings.syncTokenPlaceholder')"
        />

        <div class="settings-actions">
          <VBtn
            type="button"
            variant="outlined"
            color="primary"
            :disabled="isTestingSyncConnection"
            @click="handleTestConnection"
          >
            {{ isTestingSyncConnection ? t('settings.testingConnection') : t('settings.testConnection') }}
          </VBtn>
          <VBtn
            class="miolog-primary-action"
            type="button"
            color="primary"
            :disabled="isSyncing"
            @click="handleSyncNow"
          >
            {{ isSyncing ? t('settings.syncingNow') : t('settings.syncNow') }}
          </VBtn>
        </div>

        <VAlert
          v-if="syncNotice"
          class="settings-notice"
          density="comfortable"
          variant="tonal"
          :type="syncNoticeTone === 'success' ? 'success' : 'error'"
          aria-live="polite"
        >
          {{ syncNotice }}
        </VAlert>

        <p v-if="lastSyncedLabel" class="settings-meta">
          {{ t('settings.lastSyncedAt', { date: lastSyncedLabel }) }}
        </p>
        <p v-else class="settings-meta">
          {{ t('settings.lastSyncedNever') }}
        </p>

        <p v-if="settings.lastSyncError" class="settings-meta settings-meta--error">
          {{ t('settings.lastSyncError', { message: settings.lastSyncError }) }}
        </p>
      </div>
    </section>

    <section v-if="!isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.localAiKicker') }}</p>
          <h2>{{ t('settings.localAiTitle') }}</h2>
          <p class="section-helper">{{ t('settings.localAiHelper') }}</p>
        </div>
      </div>

      <div v-if="webGpuAvailable" class="settings-grid">
        <VSwitch
          v-model="settings.aiLocalReviewDraftEnabled"
          class="settings-control settings-switch"
          color="primary"
          hide-details
          :label="t('settings.localAiEnableLabel')"
        />

        <template v-if="settings.aiLocalReviewDraftEnabled">
          <template v-if="hasModelForLanguage">
          <VSelect
            class="settings-control"
            :label="t('settings.localAiModelLabel')"
            :items="localModelOptions"
            :model-value="effectiveModelId"
            :disabled="localModelStatus === 'downloading'"
            @update:model-value="updateLocalModel"
          />
          <p class="settings-meta">{{ t('settings.localAiModelMeta') }}</p>

          <div v-if="localModelStatus === 'checking'" class="settings-meta local-ai-status">
            <VProgressCircular indeterminate size="18" width="2" color="primary" />
            <span>{{ t('settings.localAiChecking') }}</span>
          </div>

          <template v-else-if="localModelStatus === 'downloading'">
            <VProgressLinear
              :model-value="localModelProgress * 100"
              color="primary"
              height="8"
              rounded
            />
            <p class="settings-meta">
              {{
                t(
                  localModelPhase === 'downloading'
                    ? 'settings.localAiDownloading'
                    : 'settings.localAiPreparing',
                  { percent: localModelPercent },
                )
              }}
            </p>
          </template>

          <template v-else-if="localModelStatus === 'ready'">
            <div class="settings-actions">
              <VBtn
                type="button"
                variant="outlined"
                color="primary"
                @click="removeLocalModelDownload"
              >
                {{ t('settings.localAiRemove') }}
              </VBtn>
            </div>
          </template>

          <template v-else>
            <VAlert
              v-if="localModelStatus === 'error' && localModelError"
              class="settings-notice"
              density="comfortable"
              variant="tonal"
              type="error"
            >
              {{ localModelError }}
            </VAlert>
            <p v-else class="settings-meta">{{ t('settings.localAiNotCached') }}</p>

            <div class="settings-actions">
              <VBtn
                class="miolog-primary-action"
                type="button"
                color="primary"
                @click="requestLocalModelDownload"
              >
                {{ t('settings.localAiDownloadModel', { size: selectedLocalModel?.sizeLabel ?? '' }) }}
              </VBtn>
            </div>
          </template>
          </template>

          <p v-else class="settings-meta">{{ t('settings.localAiLanguageUnavailable') }}</p>
        </template>
      </div>

      <VAlert
        v-else
        class="settings-notice"
        density="comfortable"
        variant="tonal"
        type="info"
      >
        {{ t('settings.localAiUnsupported') }}
      </VAlert>
    </section>

    <section v-if="!isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.backupKicker') }}</p>
          <h2>{{ t('settings.backupTitle') }}</h2>
          <p class="section-helper">{{ t('settings.backupHelper') }}</p>
        </div>
      </div>

      <div class="settings-grid">
        <VSwitch
          v-model="settings.backupReminderEnabled"
          class="settings-control settings-switch"
          color="primary"
          hide-details
          :disabled="isSyncConfigured"
          :label="t('settings.backupReminderLabel')"
        />

        <p class="settings-meta">
          {{ backupReminderMeta }}
        </p>

        <VSelect
          class="settings-control"
          :aria-label="t('settings.importMode')"
          :label="t('settings.importMode')"
          :items="importModeOptions"
          :model-value="importMode"
          @update:model-value="updateImportMode"
        />
        <p v-if="isSyncConfigured" class="settings-meta">
          {{ t('settings.replaceDisabledBySync') }}
        </p>

        <div class="settings-actions">
          <VBtn class="miolog-primary-action" type="button" color="primary" @click="handleExport">
            {{ t('settings.exportBackup') }}
          </VBtn>
          <VBtn type="button" variant="outlined" color="primary" @click="triggerImport">
            {{ t('settings.importBackup') }}
          </VBtn>
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept="application/json"
            @change="handleImport"
          />
        </div>

        <VAlert
          v-if="backupNotice"
          class="settings-notice"
          density="comfortable"
          variant="tonal"
          :type="backupNoticeTone === 'success' ? 'success' : 'error'"
          aria-live="polite"
        >
          {{ backupNotice }}
        </VAlert>
      </div>
    </section>

    <section v-if="!isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.csvKicker') }}</p>
          <h2>{{ t('settings.csvTitle') }}</h2>
          <p class="section-helper">{{ t('settings.csvHelper') }}</p>
          <div class="settings-actions settings-actions--inline">
            <VBtn type="button" variant="outlined" color="primary" @click="handleTemplateCsvExport">
              {{ t('settings.csvExportTemplate') }}
            </VBtn>
          </div>
        </div>
      </div>

      <div class="settings-grid">
        <VExpansionPanels class="settings-help-panel" variant="accordion">
          <VExpansionPanel>
            <VExpansionPanelTitle>{{ t('settings.csvRulesTitle') }}</VExpansionPanelTitle>
            <VExpansionPanelText>
              <ul class="settings-message-list">
                <li>{{ t('settings.csvRuleTitle') }}</li>
                <li>{{ t('settings.csvRuleBlank') }}</li>
                <li>{{ t('settings.csvRuleStatus') }}</li>
                <li>{{ t('settings.csvRulePlayTime') }}</li>
                <li>{{ t('settings.csvRuleFinishedDate') }}</li>
                <li>{{ t('settings.csvRuleMioIdNew') }}</li>
                <li>{{ t('settings.csvRuleMioIdEdit') }}</li>
                <li>{{ t('settings.csvRuleBackup') }}</li>
              </ul>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>

        <div class="settings-actions">
          <VBtn type="button" variant="outlined" color="primary" @click="handleLibraryCsvExport">
            {{ t('settings.csvExportLibrary') }}
          </VBtn>
          <VBtn class="miolog-primary-action" type="button" color="primary" @click="triggerCsvImport">
            {{ t('settings.csvImport') }}
          </VBtn>
          <input
            ref="csvFileInput"
            class="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            @change="handleLibraryCsvImport"
          />
        </div>

        <VAlert
          v-if="csvNotice"
          class="settings-notice"
          density="comfortable"
          variant="tonal"
          :type="csvNoticeTone === 'success' ? 'success' : 'error'"
          aria-live="polite"
        >
          {{ csvNotice }}
        </VAlert>
      </div>
    </section>

    <section v-if="isDemoMode" class="panel settings-section">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('settings.syncKicker') }}</p>
          <h2>{{ t('settings.demoNoSyncTitle') }}</h2>
          <p class="section-helper">{{ t('settings.demoNoSyncBody') }}</p>
        </div>
      </div>
    </section>

    <p class="settings-version">{{ t('settings.version', { version: appVersion }) }}</p>

    <VDialog v-model="confirmDownloadOpen" class="confirm-dialog" max-width="420">
      <VCard>
        <VCardTitle>{{ t('settings.localAiConfirmTitle') }}</VCardTitle>
        <VCardText>
          {{ t('settings.localAiConfirmBody', { size: selectedLocalModel?.sizeLabel ?? '' }) }}
        </VCardText>
        <VCardActions>
          <VBtn type="button" variant="outlined" color="primary" @click="confirmDownloadOpen = false">
            {{ t('settings.localAiConfirmCancel') }}
          </VBtn>
          <VBtn class="miolog-primary-action" type="button" color="primary" @click="confirmLocalModelDownload">
            {{ t('settings.localAiConfirmDownload') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="replaceImportDialogOpen" class="confirm-dialog" max-width="420">
      <VCard>
        <VCardTitle>{{ t('settings.replaceMode') }}</VCardTitle>
        <VCardText>{{ t('settings.replaceConfirm') }}</VCardText>
        <VCardActions>
          <VBtn type="button" variant="outlined" color="primary" @click="cancelReplaceImport">
            {{ t('settings.cancelImport') }}
          </VBtn>
          <VBtn class="miolog-primary-action" type="button" color="primary" @click="confirmReplaceImport">
            {{ t('settings.replaceImport') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="csvImportDialogOpen" class="confirm-dialog" max-width="560">
      <VCard>
        <VCardTitle>{{ t('settings.csvPreviewTitle') }}</VCardTitle>
        <VCardText>
          <p v-if="csvImportPlan" class="settings-meta">
            {{
              t('settings.csvPreviewSummary', {
                created: csvImportPlan.createCount,
                updated: csvImportPlan.updateCount,
                skipped: csvImportPlan.skippedCount,
              })
            }}
          </p>
          <p v-if="csvPreviewIssueSummary" class="settings-meta">
            {{ csvPreviewIssueSummary }}
          </p>

          <VExpansionPanels
            v-if="csvImportPlan?.errors.length || csvImportPlan?.warnings.length"
            class="settings-help-panel settings-preview-panel"
            variant="accordion"
          >
            <VExpansionPanel v-if="csvImportPlan?.errors.length">
              <VExpansionPanelTitle>{{ csvPreviewErrorsTitle }}</VExpansionPanelTitle>
              <VExpansionPanelText>
                <ul class="settings-message-list settings-message-list--error">
                  <li v-for="error in csvPreviewErrors" :key="error">
                    {{ error }}
                  </li>
                </ul>
              </VExpansionPanelText>
            </VExpansionPanel>
            <VExpansionPanel v-if="csvImportPlan?.warnings.length">
              <VExpansionPanelTitle>{{ csvPreviewWarningsTitle }}</VExpansionPanelTitle>
              <VExpansionPanelText>
                <ul class="settings-message-list settings-message-list--warning">
                  <li v-for="warning in csvPreviewWarnings" :key="warning">
                    {{ warning }}
                  </li>
                </ul>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </VCardText>
        <VCardActions>
          <VBtn type="button" variant="outlined" color="primary" @click="cancelLibraryCsvImport">
            {{ t('settings.cancelImport') }}
          </VBtn>
          <VBtn
            class="miolog-primary-action"
            type="button"
            color="primary"
            :disabled="!csvImportPlan || csvImportPlan.gamesToSave.length === 0"
            @click="confirmLibraryCsvImport"
          >
            {{ t('settings.csvConfirmImport') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
