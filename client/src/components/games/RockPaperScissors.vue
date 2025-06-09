<template>
  <div class="w-full p-2">
    <!-- Game Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-purple-400">
        <span class="hidden sm:inline">Rock Paper Scissors</span>
        <span class="sm:hidden">RPS Game</span>
      </h2>
      <div class="text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm shadow-lg" 
        :class="{
          'bg-yellow-600/40 border border-yellow-500/30': gameState === 'waiting',
          'bg-green-600/40 border border-green-500/30': gameState === 'ready',
          'bg-blue-600/40 border border-blue-500/30': gameState === 'choosing',
          'bg-purple-600/40 border border-purple-500/30': gameState === 'result'
        }">
        <span v-if="gameState === 'waiting'" class="text-yellow-300 animate-pulse flex items-center">
          <span class="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-ping"></span>
          Waiting...
        </span>
        <span v-else-if="gameState === 'ready'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-green-400 rounded-full mr-2"></span>
          Ready!
        </span>
        <span v-else-if="gameState === 'choosing'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
          Choose
        </span>
        <span v-else-if="gameState === 'result'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
          {{ resultText }}
        </span>
      </div>
    </div>
    
    <!-- Game Board -->
    <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 md:p-6 mb-4 border border-gray-700/50 shadow-xl">
      <div class="flex flex-col items-center" :class="{'opacity-70': gameState === 'waiting'}">
        <!-- Score Board -->
        <div class="flex justify-center items-center gap-4 md:gap-8 mb-6 w-full">
          <div class="text-center p-2 bg-blue-900/20 rounded-lg backdrop-blur-sm border border-blue-800/30 min-w-[70px]">
            <div class="text-sm text-gray-300 mb-1">You</div>
            <div class="text-2xl font-bold text-blue-400">{{ playerScore }}</div>
          </div>
          <div class="text-center px-4 py-2 bg-gray-700/50 rounded-lg border border-gray-600/30">
            <div class="text-sm text-gray-300">Round</div>
            <div class="text-xl font-bold text-white">{{ roundNumber }}</div>
          </div>
          <div class="text-center p-2 bg-green-900/20 rounded-lg backdrop-blur-sm border border-green-800/30 min-w-[70px]">
            <div class="text-sm text-gray-300 mb-1">Partner</div>
            <div class="text-2xl font-bold text-green-400">{{ partnerScore }}</div>
          </div>
        </div>
        
        <!-- Game Area -->
        <div class="w-full mb-4">
          <!-- Result Display -->
          <div v-if="gameState === 'result'" class="flex flex-col items-center mb-6 animate__animated animate__fadeIn">
            <div class="flex justify-center items-center gap-6 md:gap-10 mb-6">
              <div class="text-center">
                <div class="w-20 h-20 md:w-24 md:h-24 bg-blue-500/20 rounded-full flex items-center justify-center text-4xl md:text-5xl mb-2 shadow-lg border border-blue-400/30 transform transition-all" 
                  :class="{'scale-110 ring-2 ring-blue-400 ring-opacity-50': result === 'win'}">
                  {{ getEmoji(playerChoice) }}
                </div>
                <div class="text-sm text-blue-400">You</div>
              </div>
              <div class="text-2xl font-bold text-white bg-gray-700/50 rounded-full h-10 w-10 flex items-center justify-center">VS</div>
              <div class="text-center">
                <div class="w-20 h-20 md:w-24 md:h-24 bg-green-500/20 rounded-full flex items-center justify-center text-4xl md:text-5xl mb-2 shadow-lg border border-green-400/30 transform transition-all"
                  :class="{'scale-110 ring-2 ring-green-400 ring-opacity-50': result === 'lose'}">
                  {{ getEmoji(partnerChoice) }}
                </div>
                <div class="text-sm text-green-400">Partner</div>
              </div>
            </div>
            <div class="text-xl font-bold mb-4 py-2 px-4 rounded-lg" :class="{
              'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30': result === 'tie',
              'bg-green-500/10 text-green-400 border border-green-500/30': result === 'win',
              'bg-red-500/10 text-red-400 border border-red-500/30': result === 'lose'
            }">
              {{ resultText }}
            </div>
            <button 
              @click="playAgain" 
              class="mt-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              Play Again
            </button>
          </div>
          
          <!-- Choice Selection -->
          <div v-else-if="gameState === 'choosing'" class="animate__animated animate__fadeIn">
            <div class="text-center mb-6">
              <p class="text-lg text-white mb-1">Choose your move:</p>
              <div class="inline-block px-3 py-1 rounded-full bg-gray-700/70 text-sm text-gray-300 mb-2">
                Time: <span class="font-mono text-white" :class="{'text-red-400': countdownTimer <= 3}">{{ countdownTimer }}s</span>
              </div>
            </div>
            
            <div class="flex justify-center items-center gap-3 md:gap-6">
              <button 
                v-for="choice in choices" 
                :key="choice.value"
                @click="makeChoice(choice.value)"
                class="w-[90px] h-[90px] md:w-24 md:h-24 rounded-lg flex flex-col items-center justify-center transition-all shadow-lg hover:shadow-xl"
                :class="{
                  'bg-blue-600/30 border border-blue-500/30 scale-105': playerChoice === choice.value, 
                  'bg-gray-800/80 border border-gray-700/50 hover:bg-gray-700/70 hover:scale-105 active:scale-95': playerChoice !== choice.value
                }"
              >
                <span class="text-4xl mb-2">{{ choice.emoji }}</span>
                <span class="text-xs text-gray-300">{{ choice.name }}</span>
              </button>
            </div>
          </div>
          
          <!-- Waiting for Partner -->
          <div v-else-if="gameState === 'waiting'" class="text-center">
            <div class="bg-yellow-600/20 rounded-lg p-4 border border-yellow-500/30 shadow-lg animate-pulse">
              <div class="w-16 h-16 mx-auto mb-3 relative">
                <div class="absolute inset-0 bg-yellow-500/20 rounded-full animate-ping"></div>
                <div class="absolute inset-2 bg-yellow-500/30 rounded-full animate-ping animation-delay-300"></div>
                <div class="absolute inset-4 bg-yellow-500/40 rounded-full animate-ping animation-delay-600"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-2xl">👥</span>
                </div>
              </div>
              <p class="text-yellow-300 mb-1 font-medium">Waiting for your partner to join...</p>
              <p class="text-sm text-gray-300">Game will start automatically</p>
            </div>
          </div>
          
          <!-- Ready to Play -->
          <div v-else-if="gameState === 'ready'" class="text-center">
            <div class="bg-green-600/20 rounded-lg p-4 border border-green-500/30 shadow-lg mb-4">
              <div class="w-16 h-16 mx-auto mb-3 flex items-center justify-center bg-green-500/30 rounded-full">
                <span class="text-2xl">🎮</span>
              </div>
              <p class="text-lg text-white mb-1">Both players are ready!</p>
              <p class="text-sm text-gray-300 mb-4">Prepare for an epic battle</p>
            </div>
            <button 
              @click="startRound" 
              class="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
            >
              Start Game
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Game Controls -->
    <div class="flex justify-between">
      <button 
        @click="$emit('back')" 
        class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
      >
        Back to Games
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSocket } from '@/services/socket';

const props = defineProps({
  partnerId: {
    type: String,
    required: true
  },
  partnerReady: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['back', 'error']);

const { socket } = useSocket();

// Game constants
const CHOICE_TIMEOUT = 10; // seconds to make a choice
const choices = [
  { value: 'rock', name: 'Rock', emoji: '👊' },
  { value: 'paper', name: 'Paper', emoji: '✋' },
  { value: 'scissors', name: 'Scissors', emoji: '✌️' }
];

// Game state
const gameState = ref<'waiting' | 'ready' | 'choosing' | 'result'>('waiting');
const playerChoice = ref<string | null>(null);
const partnerChoice = ref<string | null>(null);
const playerScore = ref(0);
const partnerScore = ref(0);
const roundNumber = ref(1);
const result = ref<'win' | 'lose' | 'tie' | null>(null);
const countdownTimer = ref(CHOICE_TIMEOUT);
const countdownInterval = ref<number | null>(null);

// Computed properties
const resultText = computed(() => {
  if (result.value === 'win') return 'You Win!';
  if (result.value === 'lose') return 'You Lose!';
  if (result.value === 'tie') return 'It\'s a Tie!';
  return '';
});

// Get emoji for a choice
const getEmoji = (choice: string | null) => {
  if (!choice) return '❓';
  const found = choices.find(c => c.value === choice);
  return found ? found.emoji : '❓';
};

// Start a new round
const startRound = () => {
  gameState.value = 'choosing';
  playerChoice.value = null;
  partnerChoice.value = null;
  result.value = null;
  startCountdown();
  
  // Notify partner
  socket.value?.emit('game-start-round', {
    gameType: 'rock-paper-scissors',
    to: props.partnerId,
    round: roundNumber.value
  });
};

// Make a choice
const makeChoice = (choice: string) => {
  playerChoice.value = choice;
  
  // Send choice to partner
  socket.value?.emit('game-move', {
    gameType: 'rock-paper-scissors',
    move: {
      choice,
      round: roundNumber.value
    },
    to: props.partnerId
  });
  
  // If both players have chosen, determine the result
  if (partnerChoice.value) {
    determineResult();
  }
};

// Determine the winner
const determineResult = () => {
  if (!playerChoice.value || !partnerChoice.value) return;
  
  stopCountdown();
  gameState.value = 'result';
  
  if (playerChoice.value === partnerChoice.value) {
    result.value = 'tie';
  } else if (
    (playerChoice.value === 'rock' && partnerChoice.value === 'scissors') ||
    (playerChoice.value === 'paper' && partnerChoice.value === 'rock') ||
    (playerChoice.value === 'scissors' && partnerChoice.value === 'paper')
  ) {
    result.value = 'win';
    playerScore.value++;
  } else {
    result.value = 'lose';
    partnerScore.value++;
  }
  
  // Increment round number for next round
  roundNumber.value++;
};

// Play again
const playAgain = () => {
  startRound();
};

// Start countdown timer
const startCountdown = () => {
  countdownTimer.value = CHOICE_TIMEOUT;
  
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value);
  }
  
  countdownInterval.value = window.setInterval(() => {
    countdownTimer.value--;
    
    if (countdownTimer.value <= 0) {
      stopCountdown();
      
      // If player hasn't chosen, choose randomly
      if (!playerChoice.value) {
        const randomIndex = Math.floor(Math.random() * choices.length);
        makeChoice(choices[randomIndex].value);
      }
    }
  }, 1000);
};

// Stop countdown timer
const stopCountdown = () => {
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value);
    countdownInterval.value = null;
  }
};

// Handle socket events
onMounted(() => {
  // Set initial game state based on whether partner is ready
  if (props.partnerReady) {
    gameState.value = 'ready';
  }
  
  // Listen for partner's moves
  socket.value?.on('game-move', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
      partnerChoice.value = data.move.choice;
      
      // If both players have chosen, determine the result
      if (playerChoice.value) {
        determineResult();
      }
    }
  });
  
  // Listen for game start
  socket.value?.on('game-start-round', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
      gameState.value = 'choosing';
      playerChoice.value = null;
      partnerChoice.value = null;
      result.value = null;
      roundNumber.value = data.round;
      startCountdown();
    }
  });
  
  // Listen for partner joining
  socket.value?.on('game-partner-joined', (data: any) => {
    if (data.from === props.partnerId) {
      gameState.value = 'ready';
    }
  });
  
  // Listen for partner leaving
  socket.value?.on('game-partner-left', () => {
    gameState.value = 'waiting';
    stopCountdown();
    emit('error', 'Your partner has left the game.');
  });
  
  // Listen for game reset
  socket.value?.on('game-reset', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'rock-paper-scissors') {
      playerScore.value = 0;
      partnerScore.value = 0;
      roundNumber.value = 1;
      gameState.value = 'ready';
    }
  });
});

// Clean up
onUnmounted(() => {
  stopCountdown();
  
  // Remove event listeners
  socket.value?.off('game-move');
  socket.value?.off('game-start-round');
  socket.value?.off('game-partner-joined');
  socket.value?.off('game-partner-left');
  socket.value?.off('game-reset');
});
</script>

<style scoped>
.animate__animated {
  animation-duration: 0.5s;
}

.animate__fadeIn {
  animation-name: fadeIn;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-ping {
  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes ping {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  75%, 100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.animation-delay-300 {
  animation-delay: 0.3s;
}

.animation-delay-600 {
  animation-delay: 0.6s;
}
</style> 