<template>
  <div class="w-full">
    <!-- Game Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-purple-400">Rock Paper Scissors</h2>
      <div class="text-white text-sm">
        <span v-if="gameState === 'waiting'" class="text-yellow-300 animate-pulse">
          Waiting for partner...
        </span>
        <span v-else-if="gameState === 'playing' && !playerChoice">
          Your Turn
        </span>
        <span v-else-if="gameState === 'playing' && playerChoice && !bothPlayersReady">
          Waiting for partner...
        </span>
      </div>
    </div>
    
    <!-- Room Info & Invite - Hidden visually but kept for functionality -->
    <div v-if="roomId" class="hidden">
      <div class="text-sm text-gray-300">Room: <span class="text-purple-400">{{ roomId }}</span></div>
      <button 
        @click="copyInviteLink" 
        class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
      >
        {{ copied ? 'Copied!' : 'Invite' }}
      </button>
    </div>
    
    <!-- Game Board -->
    <div class="bg-gray-800 rounded-lg p-4 mb-4">
      <div class="flex flex-col items-center" :class="{'opacity-60': gameState !== 'playing'}">
        <!-- Your Choice -->
        <div class="mb-6 text-center">
          <p class="text-gray-300 text-sm mb-1">Your Choice</p>
          <div class="text-5xl mb-4 h-16 flex items-center justify-center">{{ playerChoice || '❓' }}</div>
          
          <div v-if="!playerChoice && gameState === 'playing'" class="flex justify-center gap-4 mb-6">
            <button 
              @click="makeChoice('rock')" 
              class="text-3xl bg-gray-700 hover:bg-purple-700 w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95"
            >
              👊
            </button>
            <button 
              @click="makeChoice('paper')" 
              class="text-3xl bg-gray-700 hover:bg-purple-700 w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95"
            >
              ✋
            </button>
            <button 
              @click="makeChoice('scissors')" 
              class="text-3xl bg-gray-700 hover:bg-purple-700 w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 active:scale-95"
            >
              ✌️
            </button>
          </div>
          
          <div class="w-full h-px bg-gray-700 my-4"></div>
          
          <!-- Partner's Choice - Only show when game is complete -->
          <p class="text-gray-300 text-sm mb-1">Partner's Choice</p>
          <div class="text-5xl mb-2 h-16 flex items-center justify-center">
            <span v-if="gameResult && partnerChoice">{{ partnerChoice }}</span>
            <span v-else-if="playerChoice" class="animate-pulse">⏳</span>
            <span v-else>❓</span>
          </div>
        </div>
        
        <!-- Game Result -->
        <div v-if="gameResult" class="text-center mt-4">
          <div class="text-xl font-bold mb-4" 
              :class="{
                'text-green-400': gameResult === 'win',
                'text-red-400': gameResult === 'lose',
                'text-yellow-400': gameResult === 'tie'
              }">
            {{ gameResult === 'win' ? 'You Win! 🎉' : gameResult === 'lose' ? 'You Lose! 😢' : 'It\'s a Tie! 🤝' }}
          </div>
          <button 
            @click="resetGame" 
            class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm transition-colors mb-2"
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
    
    <!-- Game Controls -->
    <div class="flex justify-between">
      <button 
        @click="$emit('back')" 
        class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
      >
        Back to Games
      </button>
      
      <button 
        v-if="gameState === 'waiting'"
        @click="sendInvite" 
        class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
      >
        Invite Partner
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useSocket } from '@/services/socket';

const props = defineProps({
  partnerId: {
    type: String,
    required: true
  },
  initialRoomId: {
    type: String,
    default: undefined
  },
  isFirstPlayer: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['back', 'error']);

const { socket } = useSocket();

// Game state
const gameState = ref<'waiting' | 'playing' | 'finished'>('waiting');
const playerChoice = ref('');
const partnerChoice = ref('');
const gameResult = ref<'win' | 'lose' | 'tie' | ''>('');
const partnerReady = ref(false);
const bothPlayersReady = ref(false);
const connectionLostTimeout = ref<number | null>(null);
const lastActivityTime = ref<number>(Date.now());

// Constants
const CONNECTION_TIMEOUT = 30000; // 30 seconds without activity considered disconnection

// Computed for both players ready
const bothReady = computed(() => {
  return playerChoice.value !== '' && partnerChoice.value !== '';
});

// Choices mapping
const choices = {
  rock: '👊',
  paper: '✋',
  scissors: '✌️'
};

// Generate a unique room ID or use the initial one
const roomId = ref(props.initialRoomId && props.initialRoomId.startsWith('rps-') 
  ? props.initialRoomId 
  : `rps-${Math.random().toString(36).substring(2, 8)}`);

// Copy invite link
const copied = ref(false);
const copyInviteLink = () => {
  const link = `${window.location.origin}/game/${roomId.value}`;
  navigator.clipboard.writeText(link).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }).catch(() => {
    handleError("Failed to copy invite link to clipboard.");
  });
};

// Make a choice
const makeChoice = (choice: 'rock' | 'paper' | 'scissors') => {
  if (gameState.value !== 'playing' || playerChoice.value) return;
  
  try {
    playerChoice.value = choices[choice];
    lastActivityTime.value = Date.now();
    
    // Send the choice to the partner
    socket.value?.emit('game-move', {
      gameType: 'rock-paper-scissors',
      move: choice,
      to: props.partnerId,
      roomId: roomId.value
    });
    
    // Check if we can determine a result
    checkGameResult();
    
    // Reset connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to make a choice. Please try again.");
  }
};

// Check the game result
const checkGameResult = () => {
  if (!playerChoice.value || !partnerChoice.value) return;
  
  try {
    const playerChoiceText = Object.entries(choices)
      .find(([_, emoji]) => emoji === playerChoice.value)?.[0];
    
    const partnerChoiceText = Object.entries(choices)
      .find(([_, emoji]) => emoji === partnerChoice.value)?.[0];
    
    if (!playerChoiceText || !partnerChoiceText) return;
    
    if (playerChoiceText === partnerChoiceText) {
      gameResult.value = 'tie';
    } else if (
      (playerChoiceText === 'rock' && partnerChoiceText === 'scissors') ||
      (playerChoiceText === 'paper' && partnerChoiceText === 'rock') ||
      (playerChoiceText === 'scissors' && partnerChoiceText === 'paper')
    ) {
      gameResult.value = 'win';
    } else {
      gameResult.value = 'lose';
    }
    
    // Game is finished, clear timeout
    if (gameResult.value) {
      gameState.value = 'finished';
      if (connectionLostTimeout.value) {
        clearTimeout(connectionLostTimeout.value);
        connectionLostTimeout.value = null;
      }
    }
  } catch (error) {
    handleError("Failed to determine game result.");
  }
};

// Reset the game
const resetGame = () => {
  try {
    playerChoice.value = '';
    partnerChoice.value = '';
    gameResult.value = '';
    lastActivityTime.value = Date.now();
    
    // Send reset to partner
    socket.value?.emit('game-reset', {
      gameType: 'rock-paper-scissors',
      to: props.partnerId,
      roomId: roomId.value
    });
    
    // Keep state as playing if partner is ready
    gameState.value = partnerReady.value ? 'playing' : 'waiting';
    
    // Start connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to reset the game. Please try again.");
  }
};

// Send game invite
const sendInvite = () => {
  try {
    socket.value?.emit('game-invite', {
      gameType: 'rock-paper-scissors',
      to: props.partnerId,
      roomId: roomId.value
    });
  } catch (error) {
    handleError("Failed to send game invite. Please try again.");
  }
};

// Handle errors
const handleError = (message: string) => {
  console.error(`Rock-Paper-Scissors Error: ${message}`);
  emit('error', message);
};

// Start connection timeout
const startConnectionTimeout = () => {
  // Clear any existing timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
  }
  
  // Only set timeout if the game is in progress and not finished
  if (gameState.value === 'playing' && !gameResult.value) {
    connectionLostTimeout.value = window.setTimeout(() => {
      // Check if no activity for a while
      if (Date.now() - lastActivityTime.value > CONNECTION_TIMEOUT) {
        handleError("Connection with your partner appears to be lost. The game will be closed.");
        emit('back');
      }
    }, CONNECTION_TIMEOUT);
  }
};

// Socket event handlers
onMounted(() => {
  try {
    // Handle partner joining or being ready
    socket.value?.on('game-invite-accept', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
        partnerReady.value = true;
        gameState.value = 'playing';
        lastActivityTime.value = Date.now();
        
        // Start connection timeout
        startConnectionTimeout();
      }
    });
    
    // Handle partner moves
    socket.value?.on('game-move', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
        const move = data.move as keyof typeof choices;
        
        if (move && choices[move]) {
          partnerChoice.value = choices[move];
          lastActivityTime.value = Date.now();
          
          // Check if we can determine a result
          checkGameResult();
          
          // Reset connection timeout
          startConnectionTimeout();
        } else {
          handleError("Received invalid move from partner.");
        }
      }
    });
    
    // Handle game reset
    socket.value?.on('game-reset', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
        playerChoice.value = '';
        partnerChoice.value = '';
        gameResult.value = '';
        gameState.value = 'playing';
        lastActivityTime.value = Date.now();
        
        // Start connection timeout
        startConnectionTimeout();
      }
    });
    
    // If we have an initial room ID, start with waiting state
    if (props.initialRoomId) {
      gameState.value = 'waiting';
      sendInvite();
    }
  } catch (error) {
    handleError("Failed to initialize game connection.");
  }
});

// Clean up event listeners
onUnmounted(() => {
  socket.value?.off('game-invite-accept');
  socket.value?.off('game-move');
  socket.value?.off('game-reset');
  
  // Clear connection timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
    connectionLostTimeout.value = null;
  }
});

// Watch for changes in partner's choice
watch([playerChoice, partnerChoice], () => {
  if (playerChoice.value && partnerChoice.value) {
    bothPlayersReady.value = true;
    checkGameResult();
  } else {
    bothPlayersReady.value = false;
  }
});
</script>

<style scoped>
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style> 