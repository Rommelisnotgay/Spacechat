<template>
  <div class="w-full p-2">
    <!-- Game Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-purple-400">
        <span class="hidden sm:inline">Tic Tac Toe</span>
        <span class="sm:hidden">TicTacToe</span>
      </h2>
      <div class="text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm shadow-lg" 
        :class="{
          'bg-yellow-600/40 border border-yellow-500/30': gameState === 'waiting',
          'bg-green-600/40 border border-green-500/30': isMyTurn && gameState === 'playing',
          'bg-blue-600/40 border border-blue-500/30': !isMyTurn && gameState === 'playing',
          'bg-purple-600/40 border border-purple-500/30': winner
        }">
        <span v-if="gameState === 'waiting'" class="text-yellow-300 animate-pulse flex items-center">
          <span class="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-ping"></span>
          Waiting...
        </span>
        <span v-else-if="winner" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
          {{ winner === playerSymbol 
            ? 'You Won! 🎉' 
            : winner === 'tie' 
              ? "It's a Tie! 🤝" 
              : 'You Lost! 😢' 
          }}
        </span>
        <span v-else class="flex items-center">
          <span class="inline-block w-2 h-2 rounded-full mr-2" 
                :class="{'bg-green-400': isMyTurn, 'bg-blue-400': !isMyTurn}"></span>
          {{ isMyTurn ? 'Your Turn' : "Partner's Turn" }}
        </span>
      </div>
    </div>
    
    <!-- Game Board -->
    <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 md:p-6 mb-4 border border-gray-700/50 shadow-xl">
      <div class="flex flex-col items-center" :class="{'opacity-70': gameState === 'waiting'}">
        <!-- Player Info with Stats -->
        <div class="mb-4 w-full">
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="flex items-center">
              <div :class="{'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800': playerSymbol === 'X'}" 
                   class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold">
                X
              </div>
              <div class="text-center ml-2">
                <p class="text-gray-300 text-sm">You</p>
                <p class="font-bold text-lg" :class="{'text-blue-400': playerSymbol === 'X', 'text-green-400': playerSymbol === 'O'}">
                  {{ playerSymbol }}
                </p>
              </div>
            </div>
            
            <!-- مؤشر الدور الحالي -->
            <div v-if="gameState === 'playing'" class="flex items-center">
              <div class="flex items-center justify-center p-1 bg-gray-700/50 rounded-lg">
                <div class="w-2 h-2 rounded-full" :class="{'bg-green-400 animate-pulse': isMyTurn, 'bg-red-400': !isMyTurn}"></div>
                <span class="ml-2 text-sm text-gray-300">
                  {{ isMyTurn ? 'Your Turn' : 'Partner\'s Turn' }}
                </span>
              </div>
            </div>
            
            <div class="flex items-center">
              <div class="text-center mr-2">
                <p class="text-gray-300 text-sm">Partner</p>
                <p class="font-bold text-lg" :class="{'text-blue-400': partnerSymbol === 'X', 'text-green-400': partnerSymbol === 'O'}">
                  {{ partnerSymbol }}
                </p>
              </div>
              <div :class="{'ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-800': playerSymbol === 'O'}" 
                  class="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-lg font-bold">
                O
              </div>
            </div>
          </div>
          
          <!-- Game Statistics -->
          <div v-if="showStats" class="bg-gray-700/40 rounded-lg p-2 text-sm text-gray-300 mb-3">
            <div class="flex justify-between mb-1">
              <span>Moves:</span>
              <span>{{ gameStats.moves }}</span>
            </div>
            <div class="flex justify-between mb-1">
              <span>Your Moves:</span>
              <span>{{ gameStats.movesByPlayer[props.partnerId] || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span>Game Time:</span>
              <span>{{ formatTime(gameStats.gameTime) }}</span>
            </div>
          </div>
          
          <!-- Toggle Stats Button -->
          <button 
            @click="showStats = !showStats" 
            class="w-full text-xs bg-gray-700/30 hover:bg-gray-700/50 py-1 rounded-lg transition-colors text-gray-400"
          >
            {{ showStats ? 'Hide Stats' : 'Show Stats' }}
          </button>
        </div>
        
        <!-- Board -->
        <div class="grid grid-cols-3 gap-3 mb-4">
          <button 
            v-for="(cell, index) in board" 
            :key="index"
            @click="makeMove(index)"
            :disabled="cell !== '' || !isMyTurn || winner !== null || gameState === 'waiting'"
            :ref="el => { if(el) cellRefs[index] = el }"
            class="w-20 h-20 rounded-lg flex items-center justify-center text-3xl font-bold transition-all duration-300 game-cell game-transition"
            :class="{
              'game-interactive bg-gray-700 hover:bg-gray-600': cell === '' && isMyTurn && !winner && gameState !== 'waiting',
              'bg-gray-700/50': cell === '' && (!isMyTurn || winner !== null || gameState === 'waiting'),
              'bg-blue-600/20': cell === 'X',
              'bg-green-600/20': cell === 'O',
              'cursor-not-allowed': cell !== '' || !isMyTurn || winner !== null || gameState === 'waiting',
              'hover:bg-purple-700/50': isMyTurn && cell === '' && !winner && gameState === 'playing',
              'win-effect': winningCells.includes(index)
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
            class="game-button bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm transition-colors mb-2 game-interactive"
          >
            Play Again
          </button>
          <p class="text-sm text-gray-400 mt-1">
            In the next round, symbols (X/O) will be swapped
          </p>
        </div>
        
        <!-- تعديل الشرط ليظهر الزر عندما تكون اللعبة منتهية -->
        <div v-else-if="gameState === 'finished'" class="text-center mt-4 animate__animated animate__fadeIn">
          <button 
            @click="resetGame" 
            class="game-button bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm transition-colors mb-2 game-interactive"
          >
            Play Again
          </button>
          <p class="text-sm text-gray-400 mt-1">
            In the next round, symbols (X/O) will be swapped
          </p>
        </div>
        
        <!-- Waiting Message -->
        <div v-if="gameState === 'waiting'" class="text-center mt-4 w-full">
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
            <p class="text-sm text-gray-300 mt-2">
              You'll play as
              <span class="font-bold text-blue-400">{{ playerSymbol }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Sound Controls -->
    <div class="flex justify-between mb-4">
      <button 
        @click="confirmBackToGames" 
        class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
      >
        Back to Games
      </button>
    </div>
  </div>

  <!-- Confirmation Dialog -->
  <div v-if="showConfirmation" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-4 rounded-lg max-w-xs w-full text-center">
      <h3 class="text-lg font-semibold mb-3 text-white">Are you sure?</h3>
      <p class="text-sm text-gray-300 mb-4">
        Leaving the game will end it for your partner too.
      </p>
      <div class="flex justify-center gap-3">
        <button 
          @click="showConfirmation = false" 
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
        >
          Cancel
        </button>
        <button 
          @click="confirmExit" 
          class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
        >
          Leave
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSocket } from '@/services/socket';
import { gameSoundEffects, GameVisualEffects } from './GameEffects';

const props = defineProps({
  partnerId: {
    type: String,
    required: true
  },
  isFirstPlayer: {
    type: Boolean,
    default: true
  },
  partnerReady: {
    type: Boolean,
    default: false
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
const winningCells = ref<number[]>([]);
const cellRefs = ref<HTMLElement[]>([]);
const isSoundMuted = ref(gameSoundEffects.isSoundMuted());
const showStats = ref(false);

// Game statistics
const gameStats = ref({
  moves: 0,
  movesByPlayer: {} as Record<string, number>,
  gameTime: 0,
  gameStartTime: Date.now()
});

// Constants
const CONNECTION_TIMEOUT = 60000; // زيادة المهلة إلى 60 ثانية بدلاً من 30 ثانية

// Computed property to determine if it's the current player's turn
const isMyTurn = computed(() => {
  return currentTurn.value === playerSymbol.value;
});

// Sound controls
const toggleSound = () => {
  isSoundMuted.value = gameSoundEffects.toggleMute();
};

// Format time function
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// Make a move
const makeMove = (index: number) => {
  if (
    gameState.value !== 'playing' || 
    board.value[index] !== '' || 
    !isMyTurn.value || 
    winner.value !== null
  ) return;
  
  try {
    // Play move sound
    gameSoundEffects.playSound('move');
    
    // Update the board locally
    board.value[index] = playerSymbol.value;
    currentTurn.value = partnerSymbol.value;
    lastMoveTime.value = Date.now();
    
    // Add visual effect to the cell
    if (cellRefs.value[index]) {
      GameVisualEffects.addPulseEffect(cellRefs.value[index], playerSymbol.value === 'X' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(16, 185, 129, 0.5)');
    }
    
    // تحويل الحركة إلى تنسيق متوافق مع السيرفر
    // استخدام كائن مع خاصية index
    const moveData = {
      index: index
    };
    
    // Send the move to the partner
    socket.value?.emit('game-move', {
      gameType: 'tic-tac-toe',
      move: moveData,
      to: props.partnerId
    });
    
    // فحص إضافي للفوز محليًا بعد كل حركة
    checkWinLocally();
    
    // Reset connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to make a move. Please try again.");
  }
};

// فحص الفوز محليًا
const checkWinLocally = () => {
  // أنماط الفوز
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // الصفوف
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // الأعمدة
    [0, 4, 8], [2, 4, 6]             // القطريات
  ];
  
  // فحص كل نمط فوز
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (
      board.value[a] !== '' &&
      board.value[a] === board.value[b] &&
      board.value[a] === board.value[c]
    ) {
      // تحديث حالة الفوز
      gameState.value = 'finished';
      winner.value = board.value[a];
      winningCells.value = pattern;
      
      // تطبيق تأثيرات مرئية على الخلايا الفائزة
      setTimeout(() => {
        pattern.forEach(cellIndex => {
          if (cellRefs.value[cellIndex]) {
            GameVisualEffects.addWinEffect(cellRefs.value[cellIndex]);
          }
        });
      }, 100);
      
      // تشغيل صوت الفوز أو الخسارة
      if (winner.value === playerSymbol.value) {
        gameSoundEffects.playSound('win');
      } else {
        gameSoundEffects.playSound('lose');
      }
      
      return true;
    }
  }
  
  // فحص التعادل
  if (board.value.every(cell => cell !== '')) {
    gameState.value = 'finished';
    winner.value = 'tie';
    gameSoundEffects.playSound('draw');
    return true;
  }
  
  return false;
};

// Start a timeout to detect disconnection
const startConnectionTimeout = () => {
  // Clear any existing timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
  }
  
  // Set a new timeout
  connectionLostTimeout.value = window.setTimeout(() => {
    if (gameState.value === 'playing' && winner.value === null) {
      // إرسال نبضة للتحقق من اتصال الشريك قبل اعتباره مفقودًا
      socket.value?.emit('game-ping', {
        to: props.partnerId,
        gameType: 'tic-tac-toe'
      });
      
      // انتظار 5 ثوانٍ إضافية للرد قبل اعتبار الاتصال مفقودًا
      setTimeout(() => {
        if (gameState.value === 'playing' && winner.value === null) {
          handleConnectionLost();
        }
      }, 5000);
    }
  }, CONNECTION_TIMEOUT);
};

// Handle connection lost
const handleConnectionLost = () => {
  // تغيير حالة اللعبة فقط إذا كانت لا تزال في حالة اللعب
  if (gameState.value === 'playing') {
    gameState.value = 'finished';
    handleError("Lost connection with your partner. The game has ended.");
    
    // Play notification sound
    gameSoundEffects.playSound('notification');
  }
};

// Reset the game
const resetGame = () => {
  try {
    // Play button click sound
    gameSoundEffects.playSound('click');
    
    // Reset the board
    board.value = ['', '', '', '', '', '', '', '', ''];
    winner.value = null;
    gameState.value = 'playing';
    winningCells.value = [];
    
    // تبديل الرموز (X/O) بين اللاعبين
    const tempSymbol = playerSymbol.value;
    playerSymbol.value = partnerSymbol.value;
    partnerSymbol.value = tempSymbol;
    
    // X يبدأ دائمًا
    currentTurn.value = 'X';
    
    // تحديث isMyTurn بناءً على الرموز الجديدة
    // isMyTurn سيتم تحديثه تلقائيًا من خلال الخاصية المحسوبة
    
    // Send reset to partner with swapRoles flag
    socket.value?.emit('game-reset', {
      gameType: 'tic-tac-toe',
      to: props.partnerId,
      swapRoles: true // إضافة علامة لتبديل الأدوار
    });
    
    // Start connection timeout
    startConnectionTimeout();
  } catch (error) {
    handleError("Failed to reset the game. Please try again.");
  }
};

// Handle errors
const handleError = (message: string) => {
  emit('error', message);
  console.error(message);
};

// Update local game state from server state
const updateFromServerState = (serverState: any) => {
  console.log('Received server state update:', serverState);

  // Update board
  if (serverState.board) {
    board.value = serverState.board.map((cell: string | null) => cell === null ? '' : cell);
  }
  
  // Update current turn
  if (serverState.currentSymbol) {
    currentTurn.value = serverState.currentSymbol;
  } else if (serverState.currentTurn && serverState.marks) {
    // استخراج الرمز من معرّف اللاعب الحالي
    currentTurn.value = serverState.marks[serverState.currentTurn] || 'X';
  }
  
  // Update player symbols
  if (serverState.playerSymbols) {
    const myId = socket.value?.id;
    const partnerId = props.partnerId;
    
    if (myId && serverState.playerSymbols[myId]) {
      playerSymbol.value = serverState.playerSymbols[myId];
      partnerSymbol.value = serverState.playerSymbols[partnerId];
    }
  } else if (serverState.marks) {
    // استخراج الرموز من خريطة الرموز
    const myId = socket.value?.id || '';
    playerSymbol.value = serverState.marks[myId] || 'X';
    
    // البحث عن رمز الشريك
    const partnerIds = Object.keys(serverState.marks).filter(id => id !== myId);
    if (partnerIds.length > 0) {
      partnerSymbol.value = serverState.marks[partnerIds[0]] || 'O';
    }
  }
  
  // Update game status
  if (serverState.gameOver) {
    gameState.value = 'finished';
    
    // تحديث الفائز بناءً على معرّف الفائز أو الرمز الفائز
    if (serverState.winner) {
      const myId = socket.value?.id || '';
      
      if (serverState.winner === myId) {
        winner.value = playerSymbol.value;
        gameSoundEffects.playSound('win');
      } else {
        winner.value = partnerSymbol.value;
        gameSoundEffects.playSound('lose');
      }
    } else if (serverState.isDraw) {
      winner.value = 'tie';
      gameSoundEffects.playSound('draw');
    }
  } else {
    // إذا لم تكن اللعبة منتهية، تأكد من أن الحالة هي "playing"
    gameState.value = 'playing';
  }
  
  // Update winning cells
  if (serverState.winningLine) {
    winningCells.value = serverState.winningLine;
    
    // Apply visual effects to winning cells
    if (winningCells.value.length > 0) {
      setTimeout(() => {
        winningCells.value.forEach(cellIndex => {
          if (cellRefs.value[cellIndex]) {
            GameVisualEffects.addWinEffect(cellRefs.value[cellIndex]);
          }
        });
      }, 100);
    }
  }
  
  // Update statistics
  if (serverState.stats) {
    gameStats.value = serverState.stats;
  }
  
  // فحص إضافي للفوز محليًا بعد تحديث الحالة
  if (!serverState.gameOver) {
    checkWinLocally();
  }
};

// Set up socket listeners
onMounted(() => {
  if (!socket.value) {
    handleError("Socket connection not available");
    return;
  }
  
  // Listen for partner moves
  socket.value.on('game-move', (data: any) => {
    if (data.gameType === 'tic-tac-toe' && data.from === props.partnerId) {
      try {
        // If data contains a complete game state, use it
        if (data.gameState) {
          updateFromServerState(data.gameState);
          
          // Play move sound
          gameSoundEffects.playSound('move');
          
          // Reset connection timeout
          startConnectionTimeout();
          return;
        }
        
        // استخراج رقم الحركة بطريقة آمنة تدعم مختلف التنسيقات
        let moveIndex = -1;
        
        if (typeof data.move === 'object' && data.move !== null) {
          // تنسيق الكائن مع خاصية index
          if (typeof data.move.index === 'number') {
            moveIndex = data.move.index;
          }
          // تنسيق الكائن مع خاصيات row و col
          else if (typeof data.move.row === 'number' && typeof data.move.col === 'number') {
            moveIndex = data.move.row * 3 + data.move.col;
          }
        } 
        // تنسيق قديم (رقم مباشر)
        else if (typeof data.move === 'number') {
          moveIndex = data.move;
        }
        
        if (moveIndex < 0 || moveIndex >= 9) {
          handleError("Received invalid move from partner");
          return;
        }
        
        // Update the board
        board.value[moveIndex] = partnerSymbol.value;
        currentTurn.value = playerSymbol.value;
        lastMoveTime.value = Date.now();
        
        // Play move sound
        gameSoundEffects.playSound('move');
        
        // Add visual effect to the cell
        if (cellRefs.value[moveIndex]) {
          GameVisualEffects.addPulseEffect(cellRefs.value[moveIndex], partnerSymbol.value === 'X' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(16, 185, 129, 0.5)');
        }
        
        // فحص إضافي للفوز محليًا بعد حركة الشريك
        checkWinLocally();
        
        // Reset connection timeout
        startConnectionTimeout();
      } catch (error) {
        handleError("Error processing partner's move");
      }
    }
  });
  
  // Listen for game reset
  socket.value.on('game-reset', (data: any) => {
    if (data.gameType === 'tic-tac-toe' && data.from === props.partnerId) {
      try {
        // If data contains a complete game state, use it
        if (data.gameState) {
          updateFromServerState(data.gameState);
          
          // Play game start sound
          gameSoundEffects.playSound('gameStart');
          
          // Start connection timeout
          startConnectionTimeout();
          return;
        }
        
        // Reset the board
        board.value = ['', '', '', '', '', '', '', '', ''];
        winner.value = null;
        gameState.value = 'playing';
        winningCells.value = [];
        
        // تبديل الرموز فقط إذا كانت هناك علامة swapRoles
        if (data.swapRoles) {
          const tempSymbol = playerSymbol.value;
          playerSymbol.value = partnerSymbol.value;
          partnerSymbol.value = tempSymbol;
        }
        
        // X يبدأ دائمًا
        currentTurn.value = 'X';
        
        // Play game start sound
        gameSoundEffects.playSound('gameStart');
        
        // Start connection timeout
        startConnectionTimeout();
        
        console.log(`Game reset received. My symbol is now ${playerSymbol.value}, partner's symbol is ${partnerSymbol.value}`);
      } catch (error) {
        handleError("Error resetting the game");
      }
    }
  });
  
  // Listen for game state updates
  socket.value.on('game-state', (data: any) => {
    if (data.gameType === 'tic-tac-toe') {
      try {
        updateFromServerState(data);
      } catch (error) {
        handleError("Error updating game state");
      }
    }
  });
  
  // Listen for game pings and respond to them
  socket.value.on('game-ping', (data: any) => {
    if (data.from === props.partnerId) {
      // الرد على نبضة الاتصال لتأكيد أننا متصلون
      socket.value?.emit('game-pong', {
        to: props.partnerId,
        gameType: 'tic-tac-toe'
      });
      
      // تحديث وقت آخر نشاط
      lastMoveTime.value = Date.now();
    }
  });
  
  // Listen for game pongs (responses to our pings)
  socket.value.on('game-pong', (data: any) => {
    if (data.from === props.partnerId) {
      // تحديث وقت آخر نشاط عند استلام الرد
      lastMoveTime.value = Date.now();
      console.log('Received pong from partner, connection is active');
    }
  });
  
  // Listen for notifications
  socket.value.on('game-notification', (data: any) => {
    if (data.from === props.partnerId) {
      if (data.type === 'leave') {
        // Partner is leaving the game
        console.log('Partner is leaving the game');
        // Don't show error yet, wait for the official leave event
      } else {
        // Other notifications
        console.log(`Game notification from partner: ${data.message}`);
      }
    }
  });
  
  // Listen for partner joining
  socket.value.on('game-partner-joined', (data: any) => {
    if (data.from === props.partnerId) {
      gameState.value = 'playing';
      
      // Play game start sound
      gameSoundEffects.playSound('gameStart');
      
      // Start connection timeout
      startConnectionTimeout();
    }
  });
  
  // Listen for partner leaving
  socket.value.on('game-partner-left', (data: any) => {
    if (data.from === props.partnerId) {
      console.log('Partner left the game');
      
      // Change game state
      gameState.value = 'waiting';
      
      // Create an overlay with partner left message
      const partnerLeftOverlay = document.createElement('div');
      partnerLeftOverlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg';
      partnerLeftOverlay.innerHTML = `
        <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-3xl mb-4">😢</div>
        <h3 class="text-lg font-medium text-white mb-2">Partner Left</h3>
        <p class="text-sm text-gray-300 text-center max-w-xs">
          Your partner has left the game.<br>
          Returning to game menu...
        </p>
      `;
      
      // Find the game container and append the overlay
      const gameContainer = document.querySelector('.game-board') || document.body;
      gameContainer.appendChild(partnerLeftOverlay);
      
      // After 2 seconds, return to the games menu
      setTimeout(() => {
        // Remove the overlay
        gameContainer.removeChild(partnerLeftOverlay);
        // Return to games menu
        emit('back');
      }, 2000);
    }
  });
  
  // Check if partner is already connected
  if (!props.isFirstPlayer) {
    gameState.value = 'playing';
    
    // Play game start sound
    gameSoundEffects.playSound('gameStart');
    
    // Start connection timeout
    startConnectionTimeout();
  }
});

// Clean up on unmount
onUnmounted(() => {
  if (socket.value) {
    socket.value.off('game-move');
    socket.value.off('game-reset');
    socket.value.off('game-partner-joined');
    socket.value.off('game-partner-left');
    socket.value.off('game-state');
    socket.value.off('game-notification');
    socket.value.off('game-ping');
    socket.value.off('game-pong');
    
    // إرسال إشعار للشريك بأننا نغادر اللعبة
    if (props.partnerId) {
      socket.value.emit('game-notification', {
        to: props.partnerId,
        message: 'Your partner has left the game',
        type: 'leave'
      });
      
      // تأخير صغير قبل مغادرة الغرفة للتأكد من إرسال الإشعار
      setTimeout(() => {
        socket.value?.emit('game-leave-room', {
          roomId: `tictactoe-${props.partnerId}`,
          to: props.partnerId
        });
      }, 200);
    }
  }
  
  // Clear connection timeout
  if (connectionLostTimeout.value) {
    clearTimeout(connectionLostTimeout.value);
    connectionLostTimeout.value = null;
  }
});

// Confirmation dialog
const showConfirmation = ref(false);

const confirmExit = () => {
  showConfirmation.value = false;
  
  // إرسال إشعار للشريك قبل المغادرة
  if (socket.value && props.partnerId) {
    socket.value.emit('game-notification', {
      to: props.partnerId,
      message: 'Your partner has left the game',
      type: 'leave'
    });
    
    // تأخير صغير قبل مغادرة الغرفة للتأكد من إرسال الإشعار
    setTimeout(() => {
      socket.value?.emit('game-leave-room', {
        roomId: `tictactoe-${props.partnerId}`,
        to: props.partnerId
      });
      
      // العودة إلى قائمة الألعاب
      emit('back');
    }, 200);
  } else {
    // إذا لم يكن هناك اتصال، العودة مباشرة
    emit('back');
  }
};

const confirmBackToGames = () => {
  // تشغيل صوت النقر
  gameSoundEffects.playSound('click');
  showConfirmation.value = true;
};
</script>

<style scoped>
/* أنماط إضافية للمكون */
@import '../../assets/games-responsive.css';

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