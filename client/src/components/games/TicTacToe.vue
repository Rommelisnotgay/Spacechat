<template>
  <div class="w-full p-2">
    <!-- Game Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-purple-400">Tic Tac Toe</h2>
      <div class="text-white text-sm px-3 py-1 rounded-full" 
        :class="{
          'bg-yellow-600/30': gameState === 'waiting',
          'bg-green-600/30': isMyTurn && gameState === 'playing',
          'bg-red-600/30': !isMyTurn && gameState === 'playing',
          'bg-purple-600/30': winner
        }">
        <span v-if="gameState === 'waiting'" class="text-yellow-300 animate-pulse">
          Waiting for partner...
        </span>
        <span v-else-if="winner">
          {{ winner === playerSymbol ? 'You Won! 🎉' : winner === 'tie' ? "It's a Tie! 🤝" : 'You Lost! 😢' }}
        </span>
        <span v-else>
          {{ isMyTurn ? 'Your Turn' : "Partner's Turn" }}
        </span>
      </div>
    </div>
    
    <!-- Game Board -->
    <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 mb-4">
      <div class="flex flex-col items-center" :class="{'opacity-70': gameState === 'waiting' || (!isMyTurn && !winner)}">
        <!-- Player Info -->
        <div class="mb-4 text-center">
          <div class="flex items-center justify-center gap-4">
            <div :class="{'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800': playerSymbol === 'X'}" 
                class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold">
              X
            </div>
            <div class="text-center">
              <p class="text-gray-300 text-sm">You are</p>
              <p class="font-bold text-lg" :class="{'text-blue-400': playerSymbol === 'X', 'text-green-400': playerSymbol === 'O'}">
                {{ playerSymbol }}
              </p>
            </div>
            <div :class="{'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800': playerSymbol === 'O'}" 
                class="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-lg font-bold">
              O
            </div>
          </div>
        </div>
        
        <!-- Board -->
        <div class="grid grid-cols-3 gap-3 mb-4">
          <button 
            v-for="(cell, index) in board" 
            :key="index"
            @click="makeMove(index)"
            :disabled="cell !== '' || !isMyTurn || winner !== null || gameState === 'waiting'"
            class="w-20 h-20 rounded-lg flex items-center justify-center text-3xl font-bold transition-all duration-300"
            :class="{
              'bg-gray-700 hover:bg-gray-600': cell === '' && isMyTurn && !winner && gameState !== 'waiting',
              'bg-gray-700/50': cell === '' && (!isMyTurn || winner !== null || gameState === 'waiting'),
              'bg-blue-600/20': cell === 'X',
              'bg-green-600/20': cell === 'O',
              'cursor-not-allowed': cell !== '' || !isMyTurn || winner !== null || gameState === 'waiting',
              'hover:bg-purple-700/50': isMyTurn && cell === '' && !winner && gameState === 'playing'
            }"
          >
            <span v-if="cell === 'X'" class="text-blue-400">X</span>
            <span v-else-if="cell === 'O'" class="text-green-400">O</span>
          </button>
        </div>
        
        <!-- Game Result Actions -->
        <div v-if="winner" class="text-center mt-4 animate__animated animate__fadeIn">
          <button 
            @click="resetGame" 
            class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm transition-colors mb-2"
          >
            Play Again
          </button>
        </div>
        
        <!-- Waiting Message -->
        <div v-if="gameState === 'waiting'" class="text-center mt-4">
          <div class="bg-yellow-600/20 rounded-lg p-4 animate-pulse">
            <p class="text-yellow-300 mb-1">Waiting for your partner to join...</p>
            <p class="text-sm text-gray-300">You'll play as <span class="font-bold text-blue-400">X</span></p>
          </div>
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
  isFirstPlayer: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['back', 'error']);

const { socket } = useSocket();

// Game state
const gameState = ref<'waiting' | 'playing' | 'finished'>('waiting');
const board = ref<string[]>(['', '', '', '', '', '', '', '', '']);
const playerSymbol = ref(props.isFirstPlayer ? 'X' : 'O');
const partnerSymbol = ref(props.isFirstPlayer ? 'O' : 'X');
const currentTurn = ref('X'); // X always goes first
const winner = ref<string | null>(null);
const connectionLostTimeout = ref<number | null>(null);
const lastMoveTime = ref<number>(Date.now());

// Constants
const CONNECTION_TIMEOUT = 30000; // 30 seconds without moves considered disconnection

// Computed property to determine if it's the current player's turn
const isMyTurn = computed(() => {
  return currentTurn.value === playerSymbol.value;
});

// Make a move
const makeMove = (index: number) => {
  if (
    gameState.value !== 'playing' || 
    board.value[index] !== '' || 
    !isMyTurn.value || 
    winner.value !== null
  ) return;
  
  try {
    // Update the board locally
    board.value[index] = playerSymbol.value;
    currentTurn.value = partnerSymbol.value;
    lastMoveTime.value = Date.now();
      
    // Send the move to the partner
    socket.value?.emit('game-move', {
      gameType: 'tic-tac-toe',
      move: index,
      to: props.partnerId
    });
    
    // Check for a winner
    checkWinner();
    
    // Reset connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to make a move. Please try again.");
  }
};

// Check for a winner
const checkWinner = () => {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]             // diagonals
  ];
  
  // Check for winning combinations
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (
      board.value[a] && 
      board.value[a] === board.value[b] && 
      board.value[a] === board.value[c]
    ) {
      winner.value = board.value[a];
      gameState.value = 'finished';
      
      // Clear connection timeout
      if (connectionLostTimeout.value) {
        clearTimeout(connectionLostTimeout.value);
        connectionLostTimeout.value = null;
      }
      
      return;
    }
  }
  
  // Check for a tie
  if (!board.value.includes('')) {
    winner.value = 'tie';
    gameState.value = 'finished';
    
    // Clear connection timeout
    if (connectionLostTimeout.value) {
      clearTimeout(connectionLostTimeout.value);
      connectionLostTimeout.value = null;
    }
  }
};

// Reset the game
const resetGame = () => {
  try {
    board.value = ['', '', '', '', '', '', '', '', ''];
    currentTurn.value = 'X'; // X always starts
    winner.value = null;
    gameState.value = 'playing';
    lastMoveTime.value = Date.now();
    
    // Send reset to the partner
    socket.value?.emit('game-reset', {
      gameType: 'tic-tac-toe',
      to: props.partnerId
    });
    
    // Start connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to reset the game. Please try again.");
  }
};

// Handle errors
const handleError = (message: string) => {
  console.error(`Tic-Tac-Toe Error: ${message}`);
  emit('error', message);
};

// Start connection timeout
const startConnectionTimeout = () => {
  // Clear any existing timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
  }
  
  // Only set timeout if the game is in progress and not finished
  if (gameState.value === 'playing' && !winner.value) {
    connectionLostTimeout.value = window.setTimeout(() => {
      // Check if no moves for a while
      if (Date.now() - lastMoveTime.value > CONNECTION_TIMEOUT) {
        handleError("Connection with your partner appears to be lost. The game will be closed.");
        emit('back');
      }
    }, CONNECTION_TIMEOUT);
  }
};

// Watch for changes in the first player status
watch(() => props.isFirstPlayer, (newValue) => {
  playerSymbol.value = newValue ? 'X' : 'O';
  partnerSymbol.value = newValue ? 'O' : 'X';
  
  // If we're the second player, we're already in a playing state
  if (!newValue) {
    gameState.value = 'playing';
  }
});

// Setup socket event handlers
onMounted(() => {
  try {
    // Partner joined
    socket.value?.on('game-partner-joined', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'tic-tac-toe') {
        console.log('Partner joined the game!', data);
        gameState.value = 'playing';
        lastMoveTime.value = Date.now();
        
        // Start connection timeout
        startConnectionTimeout();
      }
    });
    
    // Handle partner moves
    socket.value?.on('game-move', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'tic-tac-toe') {
        const moveIndex = data.move;
        
        if (
          typeof moveIndex === 'number' && 
          moveIndex >= 0 && 
          moveIndex < 9 &&
          board.value[moveIndex] === ''
        ) {
          board.value[moveIndex] = partnerSymbol.value;
          currentTurn.value = playerSymbol.value;
          lastMoveTime.value = Date.now();
          
          // Check for a winner
          checkWinner();
          
          // Reset connection timeout
          startConnectionTimeout();
        } else {
          handleError("Received invalid move from partner.");
        }
      }
    });
    
    // Handle game reset
    socket.value?.on('game-reset', (data: any) => {
      if (data.from === props.partnerId && data.gameType === 'tic-tac-toe') {
        board.value = ['', '', '', '', '', '', '', '', ''];
        currentTurn.value = 'X'; // X always starts
        winner.value = null;
        gameState.value = 'playing';
        lastMoveTime.value = Date.now();
        
        // Start connection timeout
        startConnectionTimeout();
      }
    });
    
    // Special case for second player: set game to playing immediately
    if (!props.isFirstPlayer) {
      gameState.value = 'playing';
    }
  } catch (error) {
    handleError("Failed to initialize game connection.");
  }
});

// Clean up event listeners and timeouts
onUnmounted(() => {
  socket.value?.off('game-partner-joined');
  socket.value?.off('game-move');
  socket.value?.off('game-reset');
  
  // Clear connection timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
    connectionLostTimeout.value = null;
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