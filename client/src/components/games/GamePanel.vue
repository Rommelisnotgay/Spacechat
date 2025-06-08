<template>
  <div class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-purple-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="bg-purple-800 p-4 flex justify-between items-center">
        <h2 class="text-xl font-bold text-white">Games</h2>
        <button @click="$emit('close')" class="text-white opacity-70 hover:opacity-100">✕</button>
      </div>
      
      <div class="p-4">
        <!-- Game Selection -->
        <div v-if="!currentGame">
          <p class="text-white mb-4">Choose a game to play with your partner</p>
          
          <div class="grid grid-cols-2 gap-4">
            <button 
              @click="selectGame('tictactoe')"
              class="bg-purple-800 rounded-lg p-4 flex flex-col items-center hover:bg-purple-700 transition-colors"
            >
              <span class="text-3xl mb-2">⭕❌</span>
              <span class="text-white font-medium">Tic Tac Toe</span>
            </button>
            
            <button 
              @click="selectGame('trivia')"
              class="bg-purple-800 rounded-lg p-4 flex flex-col items-center hover:bg-purple-700 transition-colors"
            >
              <span class="text-3xl mb-2">❓</span>
              <span class="text-white font-medium">Trivia</span>
            </button>
          </div>
          
          <div class="mt-6">
            <h3 class="text-white font-medium mb-2">Game Invitations</h3>
            <div v-if="invitations.length === 0" class="text-gray-400 text-sm">
              No invitations right now
            </div>
            <div 
              v-for="(invite, index) in invitations" 
              :key="index"
              class="bg-purple-800 p-3 rounded-lg mb-2 flex justify-between items-center"
            >
              <div>
                <p class="text-white">{{ getGameName(invite.gameType) }} Invitation</p>
                <p class="text-sm text-gray-300">From your partner</p>
              </div>
              <div class="flex space-x-2">
                <button 
                  @click="acceptInvitation(invite)"
                  class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-500 transition-colors"
                >
                  Accept
                </button>
                <button 
                  @click="declineInvitation(invite)"
                  class="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-500 transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- TicTacToe Game -->
        <div v-if="currentGame === 'tictactoe'" class="text-white">
          <div class="mb-4 flex justify-between items-center">
            <h3 class="font-medium">Tic Tac Toe</h3>
            <div>
              <span v-if="gameState.winner" class="text-green-400 font-bold mr-3">
                {{ gameState.winner === 'draw' ? 'Draw!' : (gameState.winner === playerSymbol ? 'You won!' : 'Partner won!') }}
              </span>
              <button 
                @click="exitGame"
                class="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm hover:bg-gray-600 transition-colors"
              >
                Exit
              </button>
              <button 
                v-if="gameState.winner"
                @click="resetTicTacToe"
                class="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm ml-2 hover:bg-blue-500 transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
          
          <!-- Game Board -->
          <div class="grid grid-cols-3 gap-2 mb-4">
            <button 
              v-for="(cell, index) in gameState.board" 
              :key="index"
              @click="makeMove(index)"
              class="bg-purple-800 aspect-square flex items-center justify-center text-2xl font-bold rounded-lg hover:bg-purple-700 transition-colors"
              :disabled="cell !== '' || gameState.winner !== null || gameState.currentPlayer !== playerSymbol ? true : false"
              :class="{'opacity-70': cell !== '' || gameState.winner || gameState.currentPlayer !== playerSymbol}"
            >
              {{ cell }}
            </button>
          </div>
          
          <div class="text-center text-sm" v-if="!gameState.winner">
            <p v-if="gameState.currentPlayer === playerSymbol">Your turn ({{ playerSymbol }})</p>
            <p v-else>Partner's turn ({{ partnerSymbol }})</p>
          </div>
        </div>
        
        <!-- Trivia Game -->
        <div v-if="currentGame === 'trivia'" class="text-white">
          <div class="mb-4 flex justify-between items-center">
            <h3 class="font-medium">Trivia Challenge</h3>
            <div>
              <span class="mr-3">Score: {{ triviaScore }}</span>
              <button 
                @click="exitGame"
                class="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm hover:bg-gray-600 transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
          
          <div v-if="!currentQuestion" class="text-center py-8">
            <p class="mb-4">Loading question...</p>
            <div class="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
          </div>
          
          <div v-else>
            <div class="mb-4">
              <p class="mb-2 font-medium">{{ currentQuestion.question }}</p>
              <p class="text-sm text-gray-300">Category: {{ currentQuestion.category }}</p>
            </div>
            
            <div class="space-y-2 mb-4">
              <button 
                v-for="(answer, index) in shuffledAnswers" 
                :key="index"
                @click="answerTrivia(answer)"
                class="w-full text-left p-3 rounded-lg"
                :class="getAnswerClass(answer)"
                :disabled="triviaAnswered"
              >
                {{ answer }}
              </button>
            </div>
            
            <div class="flex justify-end">
              <button 
                v-if="triviaAnswered"
                @click="nextQuestion"
                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Next Question
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '@/services/socket';

const props = defineProps<{
  partnerId: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { socket } = useSocket();

// Game selection
const currentGame = ref<string | null>(null);
const invitations = ref<{gameType: string; from: string}[]>([]);

// TicTacToe state
const playerSymbol = ref('X');
const partnerSymbol = computed(() => playerSymbol.value === 'X' ? 'O' : 'X');
const gameState = reactive({
  board: ['', '', '', '', '', '', '', '', ''],
  currentPlayer: 'X', // X starts
  winner: null as string | null,
});

// Trivia state
const triviaScore = ref(0);
const currentQuestion = ref<{
  question: string;
  category: string;
  correct_answer: string;
  incorrect_answers: string[];
} | null>(null);
const triviaAnswered = ref(false);
const shuffledAnswers = ref<string[]>([]);
const selectedAnswer = ref<string | null>(null);

onMounted(() => {
  // Set up socket listeners for games
  if (socket.value) {
    // Game invitations
    socket.value.on('game-invite', (data: { gameType: string; from: string }) => {
      invitations.value.push(data);
    });
    
    // Game invitation responses
    socket.value.on('game-invite-accept', (data: { gameType: string; from: string }) => {
      selectGame(data.gameType);
      if (data.gameType === 'tictactoe') {
        // Partner accepted, they get to be X (first player)
        playerSymbol.value = 'O';
        resetTicTacToe();
      } else if (data.gameType === 'trivia') {
        loadTriviaQuestion();
      }
    });
    
    socket.value.on('game-invite-decline', () => {
      alert('Your partner declined the game invitation.');
    });
    
    // TicTacToe moves
    socket.value.on('game-move', (data: { gameType: string; move: number; from: string }) => {
      if (data.gameType === 'tictactoe' && data.from === props.partnerId) {
        // Apply partner's move
        gameState.board[data.move] = partnerSymbol.value;
        gameState.currentPlayer = playerSymbol.value;
        checkWinner();
      }
    });
    
    // Trivia answers
    socket.value.on('game-answer', (data: { gameType: string; answer: string; from: string }) => {
      if (data.gameType === 'trivia' && data.from === props.partnerId) {
        // Partner answered trivia question
        console.log('Partner answered:', data.answer);
      }
    });
    
    // Game reset
    socket.value.on('game-reset', (data: { gameType: string; from: string }) => {
      if (data.gameType === 'tictactoe' && data.from === props.partnerId) {
        resetTicTacToe();
      }
    });
  }
});

onUnmounted(() => {
  // Clean up socket listeners
  if (socket.value) {
    socket.value.off('game-invite');
    socket.value.off('game-invite-accept');
    socket.value.off('game-invite-decline');
    socket.value.off('game-move');
    socket.value.off('game-answer');
    socket.value.off('game-reset');
  }
});

// Game selection
function selectGame(game: string) {
  currentGame.value = game;
  
  if (game === 'tictactoe') {
    resetTicTacToe();
    // Send game invitation
    socket.value?.emit('game-invite', {
      gameType: 'tictactoe',
      to: props.partnerId
    });
  } else if (game === 'trivia') {
    loadTriviaQuestion();
    // Send game invitation
    socket.value?.emit('game-invite', {
      gameType: 'trivia',
      to: props.partnerId
    });
  }
}

function getGameName(gameType: string): string {
  switch (gameType) {
    case 'tictactoe': return 'Tic Tac Toe';
    case 'trivia': return 'Trivia';
    default: return gameType;
  }
}

function acceptInvitation(invite: { gameType: string; from: string }) {
  // Accept the invitation
  socket.value?.emit('game-invite-accept', {
    gameType: invite.gameType,
    to: invite.from
  });
  
  // Remove from invitations list
  invitations.value = invitations.value.filter(i => i.from !== invite.from || i.gameType !== invite.gameType);
  
  // Set current game
  currentGame.value = invite.gameType;
  
  // Setup game based on type
  if (invite.gameType === 'tictactoe') {
    // Partner invited, they get to be X (first player)
    playerSymbol.value = 'O';
    resetTicTacToe();
  } else if (invite.gameType === 'trivia') {
    loadTriviaQuestion();
  }
}

function declineInvitation(invite: { gameType: string; from: string }) {
  // Decline the invitation
  socket.value?.emit('game-invite-decline', {
    to: invite.from
  });
  
  // Remove from invitations list
  invitations.value = invitations.value.filter(i => i.from !== invite.from || i.gameType !== invite.gameType);
}

function exitGame() {
  // Notify partner that you're leaving the game
  socket.value?.emit('game-close', {
    to: props.partnerId
  });
  
  // Reset game state
  currentGame.value = null;
}

// TicTacToe functions
function resetTicTacToe() {
  gameState.board = ['', '', '', '', '', '', '', '', ''];
  gameState.currentPlayer = 'X';
  gameState.winner = null;
}

function makeMove(index: number) {
  // Check if the move is valid
  if (gameState.board[index] !== '' || gameState.winner || gameState.currentPlayer !== playerSymbol.value) {
    return;
  }
  
  // Make the move
  gameState.board[index] = playerSymbol.value;
  gameState.currentPlayer = partnerSymbol.value;
  
  // Send move to partner
  socket.value?.emit('game-move', {
    gameType: 'tictactoe',
    move: index,
    to: props.partnerId
  });
  
  // Check for winner
  checkWinner();
}

function checkWinner() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]            // Diagonals
  ];
  
  // Check for winner
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (gameState.board[a] && gameState.board[a] === gameState.board[b] && gameState.board[a] === gameState.board[c]) {
      gameState.winner = gameState.board[a];
      return;
    }
  }
  
  // Check for draw
  if (gameState.board.every(cell => cell !== '')) {
    gameState.winner = 'draw';
  }
}

// Trivia functions
async function loadTriviaQuestion() {
  try {
    triviaAnswered.value = false;
    selectedAnswer.value = null;
    
    // In a real implementation, this would fetch from a trivia API
    // For simplicity, we'll use a sample question
    const question = {
      question: "Which planet has the most moons?",
      category: "Astronomy",
      correct_answer: "Saturn",
      incorrect_answers: ["Jupiter", "Uranus", "Neptune"]
    };
    
    currentQuestion.value = question;
    
    // Shuffle answers
    const allAnswers = [...question.incorrect_answers, question.correct_answer];
    shuffledAnswers.value = allAnswers.sort(() => Math.random() - 0.5);
    
  } catch (error) {
    console.error('Error loading trivia question:', error);
  }
}

function answerTrivia(answer: string) {
  triviaAnswered.value = true;
  selectedAnswer.value = answer;
  
  // Send answer to partner
  socket.value?.emit('game-answer', {
    gameType: 'trivia',
    answer,
    to: props.partnerId
  });
  
  // Check if correct
  if (currentQuestion.value && answer === currentQuestion.value.correct_answer) {
    triviaScore.value += 10;
  }
}

function nextQuestion() {
  loadTriviaQuestion();
}

function getAnswerClass(answer: string) {
  if (!triviaAnswered.value) {
    return 'bg-purple-800 hover:bg-purple-700';
  }
  
  if (currentQuestion.value && answer === currentQuestion.value.correct_answer) {
    return 'bg-green-600';
  }
  
  if (selectedAnswer.value === answer && currentQuestion.value && answer !== currentQuestion.value.correct_answer) {
    return 'bg-red-600';
  }
  
  return 'bg-purple-800 opacity-70';
}
</script>

<style scoped>
.fixed {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style> 