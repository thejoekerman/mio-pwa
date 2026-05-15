<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBacklog } from '../composables/useBacklog'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import { APP_LANGUAGES, APP_THEMES, type BackupData, type BackupImportMode } from '../types'
import { isDemoMode } from '../lib/appMode'
import { downloadBackupPayload } from '../lib/backupDownload'

const appVersion = __APP_VERSION__
const {
  exportBackup,
  importBackup,
  isSyncConfigured,
  isSyncing,
  isTestingSyncConnection,
  resetDemoLibrary,
  setFeedback,
  syncNow,
  testSyncConnection,
} = useBacklog()
const { settings, setLanguage, setTheme } = useSettings()
const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const importMode = ref<BackupImportMode>('merge')
const backupNotice = ref('')
const backupNoticeTone = ref<'success' | 'error'>('success')
const pendingImportFile = ref<File | null>(null)
const pendingImportInput = ref<HTMLInputElement | null>(null)
const replaceImportDialogOpen = ref(false)
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
  { title: t('settings.replaceMode'), value: 'replace' },
])
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
    setFeedback(t('feedback.importFailed'), 'error')
    backupNoticeTone.value = 'error'
    backupNotice.value = t('feedback.importFailed')
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
    <section class="view-intro">
      <div>
        <p class="section-kicker">{{ t('settings.kicker') }}</p>
        <h1 class="view-title">{{ t('settings.title') }}</h1>
      </div>
    </section>

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
  </div>
</template>
