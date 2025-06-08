<template>
  <div class="game-selector">
    <div class="text-center p-6">
      <div class="mb-4">
        <div class="w-16 h-16 bg-purple-600/30 rounded-full flex items-center justify-center mx-auto mb-2">
          <span class="text-2xl">🎮</span>
        </div>
        <h3 class="text-xl font-bold text-purple-400">Game Coming Soon</h3>
        <p class="text-gray-300 mt-2">We're working on implementing games. Please check back later!</p>
      </div>
      
      <button 
        @click="$emit('close')" 
        class="px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
      >
        Back to Menu
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  partnerId: {
    type: String,
    required: true
  }
});

defineEmits(['close', 'error']);
</script>

<style scoped>
/* No custom styles needed */
</style> 