<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { createTrophyViews } from '../lib/trophies'
import type { EarnedTrophy, TrophyUnlockSource } from '../types'
import TrophyIcon from './TrophyIcon.vue'

const props = defineProps<{
  unlocks: EarnedTrophy[]
  source: TrophyUnlockSource | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const open = computed(() => props.unlocks.length > 0)
const trophyViews = computed(() => {
  const viewsById = new Map(createTrophyViews(props.unlocks).map((trophy) => [trophy.id, trophy]))

  return props.unlocks
    .map((unlock) => viewsById.get(unlock.trophyId))
    .filter((trophy): trophy is NonNullable<typeof trophy> => Boolean(trophy))
})
const isRetroactiveBatch = computed(
  () => props.source === 'startup' || props.source === 'import' || props.unlocks.length > 3,
)
const visibleTrophies = computed(() => trophyViews.value.slice(0, isRetroactiveBatch.value ? 4 : 3))
</script>

<template>
  <VDialog :model-value="open" class="trophy-dialog" max-width="460" @update:model-value="emit('close')">
    <VCard>
      <VCardText>
        <div class="trophy-dialog-header">
          <p class="section-kicker">
            {{ isRetroactiveBatch ? t('trophies.retroTitle') : t('trophies.unlockedTitle') }}
          </p>
          <h2 v-if="isRetroactiveBatch">
            {{ t('trophies.retroBody', { count: unlocks.length }) }}
          </h2>
          <h2 v-else>{{ t(visibleTrophies[0]?.titleKey ?? 'trophies.unlockedTitle') }}</h2>
        </div>

        <div class="trophy-dialog-list">
          <article v-for="trophy in visibleTrophies" :key="trophy.id" class="trophy-dialog-item">
            <TrophyIcon :icon-key="trophy.iconKey" earned />
            <div>
              <h3>{{ t(trophy.titleKey) }}</h3>
              <p>{{ t(trophy.descriptionKey) }}</p>
            </div>
          </article>
        </div>
      </VCardText>
      <VCardActions>
        <VBtn class="miolog-primary-action" color="primary" type="button" @click="emit('close')">
          {{ t('trophies.close') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
