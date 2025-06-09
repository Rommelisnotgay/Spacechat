<template>
  <div class="game-selector">
    <div v-if="selectedGame === null" class="p-4">
      <div class="text-center mb-6">
        <h3 class="text-xl font-bold text-purple-400 mb-2">Space Games</h3>
        <p class="text-gray-300">Choose a game to play with your partner</p>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <!-- Rock Paper Scissors -->
        <button 
          @click="selectGame('rock-paper-scissors')"
          class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors"
        >
          <div class="bg-yellow-500 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">👊</div>
          <div class="text-white font-medium">Rock Paper Scissors</div>
          <div class="text-xs text-gray-400">vs Partner</div>
        </button>
        
        <!-- Tic Tac Toe -->
        <button 
          @click="selectGame('tic-tac-toe')"
          class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors"
        >
          <div class="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">⭕</div>
          <div class="text-white font-medium">Tic-Tac-Toe</div>
          <div class="text-xs text-gray-400">vs Partner</div>
        </button>
        
        <!-- Trivia - Coming soon -->
        <button 
          class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative opacity-70"
          disabled
        >
          <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/90 rounded-lg">
            <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
          </div>
          <div class="bg-green-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">❓</div>
          <div class="text-white font-medium">Trivia</div>
          <div class="text-xs text-gray-400">Knowledge Challenge</div>
        </button>
        
        <!-- Word Game - Coming soon -->
        <button 
          class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative opacity-70"
          disabled
        >
          <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/90 rounded-lg">
            <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
          </div>
          <div class="bg-purple-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">💬</div>
          <div class="text-white font-medium">Word Game</div>
          <div class="text-xs text-gray-400">Language Challenge</div>
        </button>
      </div>
      
      <div class="text-center">
        <button 
          @click="$emit('close')" 
          class="px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
        >
          Back to Call
        </button>
      </div>
    </div>
    
    <!-- Tic Tac Toe Game -->
    <TicTacToe 
      v-if="selectedGame === 'tic-tac-toe'" 
      :partnerId="partnerId"
      :partnerReady="partnerReady"
      @back="selectedGame = null"
      @error="handleError"
    />
    
    <!-- Rock Paper Scissors Game -->
    <RockPaperScissors 
      v-if="selectedGame === 'rock-paper-scissors'" 
      :partnerId="partnerId"
      :partnerReady="partnerReady"
      @back="selectedGame = null"
      @error="handleError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSocket } from '@/services/socket';
import TicTacToe from './TicTacToe.vue';
import RockPaperScissors from './RockPaperScissors.vue';

const props = defineProps({
  partnerId: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'error']);

const { socket } = useSocket();
const selectedGame = ref<string | null>(null);
const partnerReady = ref(false);

// Select a game
const selectGame = (game: string) => {
  selectedGame.value = game;
  
  // Send game invitation to partner
  socket.value?.emit('game-invite', {
    gameType: game,
    to: props.partnerId
  });
};

// Handle errors
const handleError = (message: string) => {
  emit('error', message);
};

// Listen for partner accepting game invites
onMounted(() => {
  socket.value?.on('game-invite-accept', (data: any) => {
    if (data.from === props.partnerId) {
      partnerReady.value = true;
    }
  });
  
  socket.value?.on('game-invite-decline', (data: any) => {
    if (data.from === props.partnerId) {
      emit('error', `Your partner declined the ${data.gameType} game invitation.`);
      selectedGame.value = null;
    }
  });
});

// Clean up listeners
onUnmounted(() => {
  socket.value?.off('game-invite-accept');
  socket.value?.off('game-invite-decline');
});
</script>

<style scoped>
/* No custom styles needed */
</style> 