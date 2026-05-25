<script setup lang="ts">
import { useI18n } from '../i18n'

const { t } = useI18n()
</script>

<template>
  <section class="panel home-empty-panel">
    <div class="empty-state compact">
      <h3>{{ t('home.noCurrentGame') }}</h3>
      <p>{{ t('home.noCurrentGameBody') }}</p>
    </div>
  </section>
</template>
