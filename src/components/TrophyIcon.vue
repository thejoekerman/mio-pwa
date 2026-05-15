<script setup lang="ts">
const props = defineProps<{
  iconKey: string
  earned?: boolean
}>()

const iconUrl = `/trophies/${props.iconKey}.svg`
</script>

<template>
  <span class="trophy-icon" :class="[`trophy-icon--${iconKey}`, { earned }]" aria-hidden="true">
    <img :src="iconUrl" alt="" loading="lazy" />
  </span>
</template>
