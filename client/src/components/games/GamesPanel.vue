<template>
  <div class="games-panel">
    <button 
      v-if="!showGames && partnerId"
      @click="openGames"
      class="games-button flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 rounded-full text-white font-bold shadow-lg hover:shadow-xl transition-all"
    >
      <span class="game-icon text-xl">🎮</span>
      <span>Games</span>
    </button>
    
    <div 
      v-if="showGames"
      class="games-modal fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
    >
      <div class="games-modal-content bg-space-purple-900 rounded-xl overflow-hidden shadow-2xl w-full max-w-md">
        <div class="games-modal-header bg-gradient-to-r from-purple-800 to-indigo-800 px-6 py-4 flex justify-between items-center">
          <h2 class="text-xl font-bold">SpaceChat Games</h2>
          <button 
            @click="closeGames"
            class="text-gray-300 hover:text-white"
          >
            <span class="text-xl">✖</span>
          </button>
        </div>
        
        <div class="games-modal-body p-6">
          <GameSelector 
            v-if="partnerId"
            :partnerId="partnerId"
            @close="closeGames"
          />
          <div v-else class="text-center py-8">
            <p class="text-gray-300 mb-4">You need to be connected to someone to play games.</p>
            <button 
              @click="closeGames"
              class="px-4 py-2 bg-gray-600 rounded-full hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import GameSelector from './GameSelector.vue';

export default defineComponent({
  name: 'GamesPanel',
  components: {
    GameSelector
  },
  props: {
    partnerId: {
      type: String,
      default: null
    }
  },
  setup() {
    const showGames = ref(false);
    
    const openGames = () => {
      showGames.value = true;
      // Prevent scrolling of background content
      document.body.style.overflow = 'hidden';
    };
    
    const closeGames = () => {
      showGames.value = false;
      // Restore scrolling
      document.body.style.overflow = '';
    };
    
    // Clean up when component is unmounted
    watch(() => showGames.value, (isShown) => {
      if (!isShown) {
        document.body.style.overflow = '';
      }
    });
    
    return {
      showGames,
      openGames,
      closeGames
    };
  }
});
</script>

<style scoped>
.games-button {
  transition: all 0.2s;
}

.games-button:active {
  transform: scale(0.95);
}

.games-modal {
  animation: fadeIn 0.2s ease-out;
}

.games-modal-content {
  animation: slideUp 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(50px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style> 