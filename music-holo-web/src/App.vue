<template>
  <div class="app-shell">
    <HoloEnvironment />
    <div class="route-root">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import HoloEnvironment from '@/components/HoloEnvironment.vue'
</script>

<style>
.app-shell {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  transform-style: preserve-3d;
}
.route-root {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  transform-style: preserve-3d;
}
</style>
