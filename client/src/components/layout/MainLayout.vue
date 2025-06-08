<template>
  <div class="min-h-screen bg-gradient-to-br from-purple-900 via-violet-800 to-indigo-900 text-white font-sans">
    <!-- Background effects -->
    <div class="fixed inset-0">
      <div class="absolute top-1/4 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute top-1/3 right-1/3 w-24 h-24 bg-violet-500/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
      <div class="absolute bottom-1/4 left-1/3 w-28 h-28 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      <div class="absolute top-1/2 right-1/4 w-20 h-20 bg-fuchsia-500/20 rounded-full blur-2xl animate-pulse delay-500"></div>
    </div>
    
    <!-- Content container -->
    <div class="relative min-h-screen z-10">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
// No props or additional logic needed for this simple layout
</script>

<style scoped>
.delay-500 {
  animation-delay: 0.5s;
}

.delay-1000 {
  animation-delay: 1s;
}

.delay-2000 {
  animation-delay: 2s;
}
</style> 