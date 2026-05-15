<script setup lang="ts">
import AppHeader from '../components/AppHeader.vue'
import { useBacklog } from '../composables/useBacklog'

const { stats } = useBacklog()
</script>

<template>
  <main class="view-stack journal-view">
    <AppHeader :stats="stats" />
  </main>
</template>
