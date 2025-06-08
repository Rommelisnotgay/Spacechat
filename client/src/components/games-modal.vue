<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-[#1e1e2e] rounded-lg w-full max-w-md mx-auto shadow-2xl relative overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-3 border-b border-gray-800">
        <div class="flex items-center gap-2">
          <span class="text-purple-400 text-xl">🎮</span>
          <h2 class="text-xl font-semibold text-[#a881fc]">Space Games</h2>
        </div>
        <button 
          @click="$emit('close')" 
          class="text-gray-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>
      
      <!-- Debug Info - HIDDEN -->
      <div v-if="false" class="bg-black/50 text-xs text-gray-400 p-1 border-b border-gray-800">
        Status: {{ debugInfo }}
      </div>
      
      <!-- Game Select View -->
      <div v-if="!selectedGame" class="p-4">
        <!-- Games Grid -->
        <div class="grid grid-cols-2 gap-4 mb-4">
          <!-- Rock Paper Scissors -->
          <button 
            class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative"
            :class="{'opacity-50 cursor-not-allowed': !isConnected}"
            :disabled="!isConnected"
          >
            <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/80 rounded-lg">
              <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
            </div>
            <div class="bg-yellow-500 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">👊</div>
            <div class="text-white font-medium">Rock Paper Scissors</div>
            <div class="text-xs text-gray-400">vs Partner</div>
          </button>
          
          <!-- Sound Game -->
          <button 
            class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center relative"
            :class="{'opacity-50 cursor-not-allowed': true}"
            disabled
          >
            <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/80 rounded-lg">
              <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
            </div>
            <div class="bg-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">🎵</div>
            <div class="text-white font-medium">Sound Game</div>
            <div class="text-xs text-gray-400">Voice Challenge</div>
          </button>
          
          <!-- Tic Tac Toe -->
          <button 
            class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative"
            :class="{'opacity-50 cursor-not-allowed': !isConnected}"
            :disabled="!isConnected"
            @click="selectGame('tic-tac-toe')"
          >
            <div class="bg-red-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">⭕</div>
            <div class="text-white font-medium">Tic-Tac-Toe</div>
            <div class="text-xs text-gray-400">vs Partner</div>
          </button>
          
          <!-- Word Galaxy -->
          <button 
            class="bg-[#2e2e42] p-4 rounded-lg flex flex-col items-center text-center relative"
            :class="{'opacity-50 cursor-not-allowed': true}"
            disabled
          >
            <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/80 rounded-lg">
              <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
            </div>
            <div class="bg-white text-gray-800 w-12 h-12 rounded-full flex items-center justify-center mb-3 text-xl">💬</div>
            <div class="text-white font-medium">Word Galaxy</div>
            <div class="text-xs text-gray-400">Brain Game</div>
          </button>
        </div>
        
        <!-- Connection Notice -->
        <p class="text-center text-sm text-gray-400 mt-2">
          Connect to play with others
        </p>
      </div>
      
      <!-- Error Message -->
      <div v-else-if="errorMessage" class="text-center p-6">
        <div class="mb-4">
          <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <span class="text-2xl">⚠️</span>
          </div>
          <h3 class="text-xl font-bold mb-2 text-red-400">Game Error</h3>
          <p class="text-gray-300">{{ errorMessage }}</p>
        </div>
        
        <button 
          @click="closeGame" 
          class="px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors mt-2"
        >
          Back to Games
        </button>
      </div>
      
      <!-- Game View -->
      <div v-else>
        <TicTacToe
          v-if="selectedGame === 'tic-tac-toe'"
          :partnerId="partnerId"
          :isFirstPlayer="isFirstPlayer"
          :partnerReady="partnerReady"
          @back="closeGame"
          @error="handleGameError"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useSocket } from '@/services/socket';
import TicTacToe from './games/TicTacToe.vue';

const { socket, userId } = useSocket();

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  partnerId: {
    type: String,
    required: true
  },
  isConnected: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

// Game state
const selectedGame = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const isFirstPlayer = ref(true);
const gameRoomId = ref<string | null>(null);
const partnerReady = ref(false);
const debugInfo = ref<string>('');

// Debug helper - only logs to console, not UI
const logDebugInfo = (msg: string) => {
  console.log(`[Game Debug] ${msg}`);
  debugInfo.value = msg;
};

// Select a game
const selectGame = (gameType: string) => {
  if (!props.isConnected) return;
  
  logDebugInfo(`Starting game: ${gameType} with partner: ${props.partnerId}`);
  
  errorMessage.value = null;
  selectedGame.value = gameType;
  isFirstPlayer.value = true;
  partnerReady.value = false;
  
  // Create a deterministic room ID based on user IDs
  // This ensures both users try to join the same room
  const userIds = [userId.value, props.partnerId].sort();
  gameRoomId.value = `${gameType}-${userIds[0]}-${userIds[1]}`;
  
  logDebugInfo(`Created game room: ${gameRoomId.value}`);
  
  // Join the game room
  socket.value?.emit('game-join-room', {
    gameType,
    roomId: gameRoomId.value,
    to: props.partnerId,
    isFirstPlayer: true
  });
};

// Close game
const closeGame = () => {
  // Notify partner if needed
  if (gameRoomId.value) {
    socket.value?.emit('game-leave-room', {
      roomId: gameRoomId.value,
      to: props.partnerId
    });
  }
  
  // Reset state
  selectedGame.value = null;
  errorMessage.value = null;
  isFirstPlayer.value = true;
  gameRoomId.value = null;
  partnerReady.value = false;
};

// Handle game error
const handleGameError = (error: string) => {
  errorMessage.value = error;
  logDebugInfo(`Error: ${error}`);
};

// Set up socket event listeners
onMounted(() => {
  logDebugInfo('Setting up game events');
  
  // Handle game invites and room joins
  socket.value?.on('game-room-invite', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Received invitation to join game room: ${data.roomId}`);
      gameRoomId.value = data.roomId;
      selectedGame.value = data.gameType;
      isFirstPlayer.value = false; // We're joining, so we're the second player
      
      // Join the room
      socket.value?.emit('game-join-room', {
        gameType: data.gameType,
        roomId: data.roomId,
        to: props.partnerId,
        isFirstPlayer: false
      });
    }
  });
  
  // Handle game partner joined
  socket.value?.on('game-partner-joined', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Partner joined the game: ${data.gameType}`);
      partnerReady.value = true;
    }
  });
  
  // Handle errors
  socket.value?.on('game-error', (data: any) => {
    if (data.from === 'system' || data.from === props.partnerId) {
      errorMessage.value = data.message || "An error occurred in the game.";
      logDebugInfo(`Game error: ${data.message}`);
    }
  });
  
  // Handle partner leaving
  socket.value?.on('game-partner-left', (data: any) => {
    if (selectedGame.value) {
      errorMessage.value = "Your partner left the game.";
      logDebugInfo('Partner left the game');
      selectedGame.value = null;
    }
  });
});

// Clean up event listeners
onUnmounted(() => {
  socket.value?.off('game-room-invite');
  socket.value?.off('game-partner-joined');
  socket.value?.off('game-error');
  socket.value?.off('game-partner-left');
  
  // Leave any active game room
  if (gameRoomId.value) {
    socket.value?.emit('game-leave-room', {
      roomId: gameRoomId.value,
      to: props.partnerId
    });
  }
});

// Watch for dialog close to reset game state
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    closeGame();
  }
});
</script>

<style scoped>
/* No custom styles needed */
</style>