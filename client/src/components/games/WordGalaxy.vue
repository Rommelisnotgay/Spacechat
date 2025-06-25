<template>
  <div class="w-full p-2" dir="auto">
    <!-- Game Header -->
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-purple-400">
        <span class="hidden sm:inline">Word Galaxy</span>
        <span class="sm:hidden">Word Game</span>
      </h2>
      <div class="text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm shadow-lg" 
        :class="{
          'bg-yellow-600/40 border border-yellow-500/30': gameState === 'waiting',
          'bg-green-600/40 border border-green-500/30': gameState === 'setup',
          'bg-blue-600/40 border border-blue-500/30': gameState === 'guessing',
          'bg-purple-600/40 border border-purple-500/30': gameState === 'complete'
        }">
        <span v-if="gameState === 'waiting'" class="text-yellow-300 animate-pulse flex items-center">
          <span class="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-ping"></span>
          Waiting...
        </span>
        <span v-else-if="gameState === 'setup'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-green-400 rounded-full mr-2"></span>
          Setup
        </span>
        <span v-else-if="gameState === 'guessing'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
          Guessing
        </span>
        <span v-else-if="gameState === 'complete'" class="flex items-center">
          <span class="inline-block w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
          Complete
        </span>
      </div>
    </div>
    
    <!-- Game Board -->
    <div class="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 md:p-6 mb-4 border border-gray-700/50 shadow-xl">
      <div class="flex flex-col items-center" :class="{'opacity-70': gameState === 'waiting'}">
        <!-- Game Statistics -->
        <div class="flex justify-center items-center gap-4 md:gap-8 mb-6 w-full">
          <div class="text-center p-2 bg-blue-900/20 rounded-lg backdrop-blur-sm border border-blue-800/30 min-w-[80px]">
            <div class="text-sm text-gray-300 mb-1">Attempts</div>
            <div class="text-2xl font-bold text-blue-400">{{ attemptCount }}/{{ maxAttempts }}</div>
          </div>
          <div v-if="gameState === 'guessing' && !isWordCreator" class="text-center px-4 py-2 bg-gray-700/50 rounded-lg border border-gray-600/30">
            <div class="text-sm text-gray-300">Time</div>
            <div class="text-xl font-bold" :class="{'text-red-400': timer < 10, 'text-yellow-400': timer < 20, 'text-white': timer >= 20}">{{ timer }}s</div>
          </div>
          <div class="text-center p-2 bg-green-900/20 rounded-lg backdrop-blur-sm border border-green-800/30 min-w-[80px]">
            <div class="text-sm text-gray-300 mb-1">Score</div>
            <div class="text-2xl font-bold text-green-400">{{ isWordCreator ? creatorScore : guesserScore }}</div>
          </div>
          <div class="text-center p-2 bg-purple-900/20 rounded-lg backdrop-blur-sm border border-purple-800/30 min-w-[80px]">
            <div class="text-sm text-gray-300 mb-1">Round</div>
            <div class="text-2xl font-bold text-purple-400">{{ roundCount }}</div>
          </div>
        </div>
        
        <!-- Game Area -->
        <div class="w-full mb-4">
          <!-- Waiting for Partner Message -->
          <div v-if="gameState === 'waiting'" class="text-center animate__animated animate__fadeIn">
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
          
          <!-- Word Setup (Word Creator) -->
          <div v-else-if="gameState === 'setup' && isWordCreator" class="animate__animated animate__fadeIn">
            <div class="text-center mb-6">
              <div class="w-16 h-16 mx-auto mb-3 flex items-center justify-center bg-green-500/30 rounded-full">
                <span class="text-2xl">💬</span>
              </div>
              <h3 class="text-xl font-bold text-white mb-2">Create a Word</h3>
              <p class="text-gray-300 mb-4">Enter a word for your partner to guess</p>
            </div>
            
            <div class="bg-gray-700/50 rounded-lg p-4 mb-4">
              <div class="mb-4">
                <label class="block text-gray-300 text-sm mb-2">Your Word:</label>
                <input 
                  v-model="secretWord" 
                  :dir="isArabicWord(secretWord) ? 'rtl' : 'ltr'"
                  class="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
                  placeholder="Enter a word..."
                  maxlength="15"
                  :disabled="gameState !== 'setup'"
                  @input="validateSecretWord"
                />
                <p v-if="wordError" class="text-xs text-red-400 mt-1">{{ wordError }}</p>
                <p v-else class="text-xs text-gray-400 mt-1">The word should be 3-15 letters long</p>
              </div>
              
              <div class="mb-4">
                <label class="block text-gray-300 text-sm mb-2">Difficulty:</label>
                <div class="flex gap-2">
                  <button
                    @click="difficulty = 'easy'"
                    class="flex-1 px-4 py-2 rounded-lg text-sm transition-all"
                    :class="difficulty === 'easy' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
                  >
                    Easy
                  </button>
                  <button
                    @click="difficulty = 'medium'"
                    class="flex-1 px-4 py-2 rounded-lg text-sm transition-all"
                    :class="difficulty === 'medium' ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
                  >
                    Medium
                  </button>
                  <button
                    @click="difficulty = 'hard'"
                    class="flex-1 px-4 py-2 rounded-lg text-sm transition-all"
                    :class="difficulty === 'hard' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'"
                  >
                    Hard
                  </button>
                </div>
              </div>
            </div>
            
            <div class="text-center">
              <button 
                @click="startGame" 
                class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                :disabled="!isValidWord"
              >
                Start Game
              </button>
            </div>
          </div>
          
          <!-- Waiting for Word Setup (Guesser) -->
          <div v-else-if="gameState === 'setup' && !isWordCreator" class="animate__animated animate__fadeIn">
            <div class="text-center mb-6">
              <div class="w-16 h-16 mx-auto mb-3 relative">
                <div class="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                <div class="absolute inset-2 bg-blue-500/30 rounded-full animate-ping animation-delay-300"></div>
                <div class="absolute inset-4 bg-blue-500/40 rounded-full animate-ping animation-delay-600"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-2xl">🔤</span>
                </div>
              </div>
              <h3 class="text-xl font-bold text-white mb-2">Get Ready!</h3>
              <p class="text-gray-300">Your partner is creating a word for you to guess...</p>
            </div>
            
            <div class="bg-gray-700/50 rounded-lg p-4 mb-4">
              <h4 class="font-bold text-white mb-2">How to Play:</h4>
              <ul class="text-gray-300 text-sm space-y-2 list-disc pl-4">
                <li>Your partner will create a secret word</li>
                <li>You'll see a blurred version of the word</li>
                <li>Type guesses to reveal more letters</li>
                <li>You need to guess the word before the timer runs out</li>
                <li>You win if you guess correctly, your partner wins if you don't</li>
              </ul>
            </div>
          </div>
          
          <!-- Guessing View (Guesser) -->
          <div v-else-if="gameState === 'guessing' && !isWordCreator" class="animate__animated animate__fadeIn">
            <div class="mb-6">
              <div class="bg-gray-700/50 rounded-lg p-4 shadow-inner mb-4">
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm text-gray-400">The Secret Word:</span>
                  <span class="text-xs text-gray-400">{{ revealedCount }}/{{ secretWordLength }} letters revealed</span>
                </div>
                
                <div class="flex justify-center gap-1 md:gap-2 flex-wrap" :dir="currentWordDirection">
                  <div 
                    v-for="(char, index) in blurredWord" 
                    :key="index"
                    class="w-8 h-10 md:w-10 md:h-12 flex items-center justify-center rounded bg-gray-800/80 border text-lg md:text-xl font-bold"
                    :class="char === '_' ? 'border-gray-700 text-gray-500' : 'border-purple-500 text-white'"
                  >
                    {{ char }}
                  </div>
                </div>
              </div>
              
              <div class="mb-4">
                <label class="block text-gray-300 text-sm mb-2">Your Guess:</label>
                <div class="flex gap-2">
                  <input 
                    v-model="currentGuess" 
                    :dir="isArabicWord(currentGuess) || isArabicWord(secretWord.value) ? 'rtl' : 'ltr'"
                    class="flex-1 bg-gray-900 text-white px-4 py-2 rounded-l border border-gray-600 focus:border-purple-500 focus:outline-none"
                    placeholder="Type your guess..."
                    :maxlength="secretWordLength"
                    @keyup.enter="submitGuess"
                    @input="validateGuess"
                  />
                  <button 
                    @click="submitGuess" 
                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r transition-all"
                    :disabled="!currentGuess || currentGuess.length !== secretWordLength"
                  >
                    Submit
                  </button>
                </div>
                <p v-if="guessError" class="text-xs text-red-400 mt-1">{{ guessError }}</p>
                <p v-else class="text-xs text-gray-400 mt-1">
                  {{ attemptsLeft }} attempts remaining
                </p>
              </div>
              
              <div class="bg-gray-700/30 rounded-lg p-3 max-h-28 overflow-y-auto">
                <p v-if="guessHistory.length === 0" class="text-gray-400 italic text-sm">Your previous guesses will appear here...</p>
                <div v-for="(guess, index) in guessHistory" :key="index" class="text-sm flex items-center mb-1">
                  <span class="text-gray-400 w-5">{{ index + 1 }}.</span>
                  <span :dir="isArabicWord(guess.word) || isArabicWord(secretWord.value) ? 'rtl' : 'ltr'" class="text-gray-300 mr-2">{{ guess.word }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded" :class="getMatchClass(guess.matches)">
                    {{ guess.matches }} matching
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Word Creator View -->
          <div v-else-if="gameState === 'guessing' && isWordCreator" class="animate__animated animate__fadeIn">
            <div class="bg-gray-700/50 rounded-lg p-4 mb-4">
              <div class="flex justify-between items-center mb-2">
                <span class="text-gray-300">Your Secret Word:</span>
                <span class="text-white font-bold" :dir="isArabicWord(secretWord) ? 'rtl' : 'ltr'">{{ secretWord }}</span>
              </div>
              
              <div class="flex justify-center gap-1 md:gap-2 flex-wrap" :dir="currentWordDirection">
                <div 
                  v-for="(char, index) in secretWord" 
                  :key="index"
                  class="w-8 h-10 md:w-10 md:h-12 flex items-center justify-center rounded border border-purple-500 text-lg md:text-xl font-bold"
                  :class="revealedLetters.includes(index) ? 'bg-purple-600/30 text-white' : 'bg-gray-800 text-gray-500'"
                >
                  {{ char }}
                </div>
              </div>
              
              <div class="mt-4 text-sm text-gray-300">
                <p v-if="timerStarted">
                  <span class="text-yellow-400 font-bold">Time remaining:</span> {{ timer }}s
                </p>
                <p class="mt-2">
                  <span class="text-purple-400 font-bold">Status:</span>
                  {{ partnerStatus }}
                </p>
              </div>
            </div>
            
            <div class="bg-gray-700/30 rounded-lg p-3 max-h-36 overflow-y-auto">
              <p v-if="guessHistory.length === 0" class="text-gray-400 italic text-sm">Partner's guesses will appear here...</p>
              <div v-for="(guess, index) in guessHistory" :key="index" class="text-sm flex items-center mb-1">
                <span class="text-gray-400 w-5">{{ index + 1 }}.</span>
                <span :dir="isArabicWord(guess.word) || isArabicWord(secretWord) ? 'rtl' : 'ltr'" class="text-gray-300 mr-2">{{ guess.word }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded" :class="getMatchClass(guess.matches)">
                  {{ guess.matches }} matching
                </span>
              </div>
            </div>
          </div>
          
          <!-- Game Complete View -->
          <div v-else-if="gameState === 'complete'" class="animate__animated animate__fadeIn">
            <div class="text-center mb-6">
              <div class="w-16 h-16 mx-auto mb-3 flex items-center justify-center rounded-full"
                :class="gameResult === 'win' ? 'bg-green-500/30' : 'bg-red-500/30'">
                <span class="text-3xl">{{ gameResult === 'win' ? '🎉' : '😢' }}</span>
              </div>
              <h3 class="text-xl font-bold mb-2" :class="gameResult === 'win' ? 'text-green-400' : 'text-red-400'">
                {{ isWordCreator 
                  ? (gameResult === 'win' ? 'Your word was too hard!' : 'Your word was guessed!') 
                  : (gameResult === 'win' ? 'You guessed it!' : 'You ran out of attempts!') 
                }}
              </h3>
              <p class="text-gray-300 mb-4">
                {{ isWordCreator 
                  ? 'Your partner failed to guess your word.' 
                  : `The word was: ${secretWord.value}` 
                }}
              </p>
            </div>
            
            <div class="bg-gray-700/50 rounded-lg p-4 mb-6">
              <h4 class="font-bold text-white mb-2">Game Summary:</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="text-gray-300">Secret Word:</div>
                <div class="text-white font-medium">{{ secretWord.value }}</div>
                
                <div class="text-gray-300">Difficulty:</div>
                <div class="text-white font-medium capitalize">{{ difficulty }}</div>
                
                <div class="text-gray-300">Attempts Used:</div>
                <div class="text-white font-medium">{{ attemptCount }}/{{ maxAttempts }}</div>
                
                <div class="text-gray-300">Time Spent:</div>
                <div class="text-white font-medium">{{ formatTime(gameTime) }}</div>
              </div>
            </div>
            
            <div class="text-center">
              <button 
                @click="playAgain" 
                class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                Play Again
              </button>
              <p class="text-sm text-gray-400 mt-2">
                In the next round, roles will be swapped
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Game Controls -->
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
          @click="leaveGame" 
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
  partnerReady: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['back', 'error']);

const { socket, userId } = useSocket();

// UI state
const wordError = ref('');
const guessError = ref('');
const showConfirmation = ref(false);

// Game state
const gameState = ref<'waiting' | 'setup' | 'guessing' | 'complete'>('waiting');
const isWordCreator = ref(false);
const secretWord = ref('');
const secretWordLength = ref(0);
const blurredWord = ref<string[]>([]);
const revealedLetters = ref<number[]>([]);
const revealedCount = ref(0);
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium');
const currentGuess = ref('');
const guessHistory = ref<{word: string, matches: number}[]>([]);
const attemptCount = ref(0);
const isWinner = ref(false);
const score = ref(0);
const partnerStatus = ref('Watching you set up the game...');

// New score tracking
const guesserScore = ref(0);
const creatorScore = ref(0);
const roundCount = ref(1);
const roundScores = ref<{creator: number, guesser: number}[]>([]);

// Timer
const timer = ref(0);
const timerInterval = ref<number | null>(null);
const timerStarted = ref(false);

// Difficulty settings
const difficultySettings = {
  easy: { attempts: 10, time: 60, multiplier: 1 },
  medium: { attempts: 8, time: 45, multiplier: 1.5 },
  hard: { attempts: 6, time: 30, multiplier: 2 }
};

// Sound state
const isSoundMuted = ref(gameSoundEffects.isSoundMuted());

// Helper function to detect if text contains Arabic
const isArabicWord = (text: string): boolean => {
  const arabicPattern = /[\u0600-\u06FF]/;
  return arabicPattern.test(text);
};

// Helper function to check if input contains only valid characters (Arabic or English letters)
const isValidCharacters = (text: string): boolean => {
  // Arabic letters (ا-ي) or English letters (a-z, A-Z) only
  const validCharsRegex = /^[a-zA-Z\u0600-\u06FF]+$/;
  return validCharsRegex.test(text);
};

// Get current word direction based on content
const currentWordDirection = computed(() => {
  if (!secretWord.value) return 'ltr';
  return isArabicWord(secretWord.value) ? 'rtl' : 'ltr';
});

// Validate the secret word
const validateSecretWord = () => {
  // Clear previous error
  wordError.value = '';
  
  // Check for minimum length
  if (secretWord.value.length > 0 && secretWord.value.length < 3) {
    wordError.value = 'The word must be at least 3 letters';
    return;
  }
  
  // Check for valid characters (only Arabic or English letters)
  if (secretWord.value.length > 0 && !isValidCharacters(secretWord.value)) {
    // Filter to keep only valid characters
    secretWord.value = secretWord.value.replace(/[^a-zA-Z\u0600-\u06FF]/g, '');
    wordError.value = 'Only Arabic or English letters are allowed';
  }
};

// Validate the user's guess
const validateGuess = () => {
  // Clear previous error
  guessError.value = '';
  
  // Check length
  if (currentGuess.value.length > 0 && currentGuess.value.length !== secretWordLength.value) {
    guessError.value = `The word must be ${secretWordLength.value} letters long`;
    return;
  }
  
  // Check for valid characters (only Arabic or English letters)
  if (currentGuess.value.length > 0 && !isValidCharacters(currentGuess.value)) {
    // Filter to keep only valid characters
    currentGuess.value = currentGuess.value.replace(/[^a-zA-Z\u0600-\u06FF]/g, '');
    guessError.value = 'Only Arabic or English letters are allowed';
  }
};

// Computed properties
const maxAttempts = computed(() => {
  return difficultySettings[difficulty.value].attempts;
});

const maxTime = computed(() => {
  return difficultySettings[difficulty.value].time;
});

const attemptsLeft = computed(() => {
  return maxAttempts.value - attemptCount.value;
});

const isValidWord = computed(() => {
  // Allow Arabic and English words, minimum 3 letters, and only valid characters
  return secretWord.value.length >= 3 && 
         secretWord.value.length <= 15 && 
         isValidCharacters(secretWord.value) &&
         !wordError.value;
});

// Start the game with the created word
const startGame = () => {
  if (!isValidWord.value) return;
  
  // Convert word to lowercase and trim spaces
  secretWord.value = secretWord.value.trim();
  
  // Play game start sound
  gameSoundEffects.playSound('gameStart');
  
  // Send the word and settings to partner
  socket.value?.emit('game-word-setup', {
    gameType: 'word-galaxy',
    to: props.partnerId,
    wordLength: secretWord.value.length,
    difficulty: difficulty.value
  });
  
  // Initialize game state
  gameState.value = 'guessing';
  secretWordLength.value = secretWord.value.length;
  initializeBlurredWord();
};

// Initialize the blurred word with underscores
const initializeBlurredWord = () => {
  blurredWord.value = Array(secretWordLength.value).fill('_');
  revealedLetters.value = [];
  revealedCount.value = 0;
};

// Start the timer
const startTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
  }
  
  timer.value = maxTime.value;
  timerStarted.value = true;
  
  timerInterval.value = window.setInterval(() => {
    timer.value--;
    
    if (timer.value <= 0) {
      stopTimer();
      
      // Time's up, guesser loses
      if (!isWordCreator.value) {
        gameState.value = 'complete';
        isWinner.value = false;
        
        // Notify partner
        socket.value?.emit('game-move', {
          gameType: 'word-galaxy',
          move: "timeout",
          to: props.partnerId
        });
      }
    }
  }, 1000);
};

// Stop the timer
const stopTimer = () => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
    timerInterval.value = null;
  }
};

// Submit a guess (guesser)
const submitGuess = () => {
  if (!currentGuess.value || currentGuess.value.length !== secretWordLength.value) return;
  
  // Validate input - only allow Arabic or English letters
  if (!isValidCharacters(currentGuess.value)) {
    // Filter to keep only valid characters
    currentGuess.value = currentGuess.value.replace(/[^a-zA-Z\u0600-\u06FF]/g, '');
    guessError.value = 'Only Arabic or English letters are allowed';
    return;
  }
  
  const guess = currentGuess.value.trim();
  guessError.value = '';
  
  // Play move sound
  gameSoundEffects.playSound('move');
  
  // Send guess to partner
  socket.value?.emit('game-move', {
    gameType: 'word-galaxy',
    move: guess,
    to: props.partnerId
  });
  
  // Clear current guess
  currentGuess.value = '';
  
  // Increment attempt count
  attemptCount.value++;
  
  // Check if out of attempts
  if (attemptCount.value >= maxAttempts.value) {
    gameState.value = 'complete';
    isWinner.value = false;
    stopTimer();
    
    // Play lose sound
    gameSoundEffects.playSound('lose');
    
    // Notify partner
    socket.value?.emit('game-move', {
      gameType: 'word-galaxy',
      move: "out-of-attempts",
      to: props.partnerId
    });
  }
};

// Process a guess (word creator)
const processGuess = (guess: string) => {
  const targetWord = secretWord.value;
  const guessWord = guess;
  
  // Count matching positions
  let matches = 0;
  const newRevealed: number[] = [...revealedLetters.value];
  
  // Check if we're handling an Arabic word
  const isArabic = isArabicWord(targetWord);
  
  // For Arabic words, we need to adjust the comparison to account for RTL direction
  if (isArabic) {
    for (let i = 0; i < targetWord.length; i++) {
      // For Arabic, the letter comparison should be done with consideration of RTL order
      // If the target word index i matches the guess word index i, mark it as a match
      if (guessWord[i] === targetWord[i]) {
        matches++;
        if (!newRevealed.includes(i)) {
          newRevealed.push(i);
        }
      }
    }
  } else {
    // For non-Arabic words, use the original logic
    for (let i = 0; i < targetWord.length; i++) {
      if (guessWord[i] === targetWord[i]) {
        matches++;
        if (!newRevealed.includes(i)) {
          newRevealed.push(i);
        }
      }
    }
  }
  
  // Update revealed letters
  revealedLetters.value = newRevealed;
  revealedCount.value = newRevealed.length;
  
  // Add to guess history - use the actual guessed word
  guessHistory.value.push({
    word: guessWord,
    matches: matches
  });
  
  // Update partner status
  partnerStatus.value = `Made guess: "${guessWord}" (${matches} matches)`;
  
  // Award points to word creator for wrong guesses (if not fully correct)
  if (matches < targetWord.length) {
    // Word creator gets 10 points for each wrong guess
    const pointsEarned = 10 * difficultySettings[difficulty.value].multiplier;
    creatorScore.value += Math.round(pointsEarned);
    
    // Play sound based on matches
    if (matches > 0) {
      gameSoundEffects.playSound('correct');
    } else {
      gameSoundEffects.playSound('incorrect');
    }
  } else {
    // Play win sound for correct guess
    gameSoundEffects.playSound('win');
  }
  
  // Send result back to guesser - send the actual secret word for revealed positions
  // but also include the original guess for the history
  socket.value?.emit('game-guess-result', {
    gameType: 'word-galaxy',
    to: props.partnerId,
    result: {
      word: targetWord, // Send actual word for letter revealing
      originalGuess: guessWord, // Send original guess for history display
      matches: matches,
      revealedPositions: newRevealed,
      isCorrect: matches === targetWord.length,
      creatorEarnedPoints: matches < targetWord.length ? Math.round(10 * difficultySettings[difficulty.value].multiplier) : 0
    }
  });
  
  // Check if word is guessed
  if (matches === targetWord.length) {
    // If the word is correct, show the entire word
    blurredWord.value = targetWord.split('');
    revealedCount.value = secretWordLength.value;
    
    gameState.value = 'complete';
    isWinner.value = false; // Creator loses when word is guessed correctly
    secretWord.value = targetWord;
    stopTimer();
    
    // Calculate score
    calculateScore();
  }
};

// Handle guess result (guesser)
const handleGuessResult = (result: {
  word: string;
  originalGuess?: string;
  matches: number;
  revealedPositions: number[];
  isCorrect: boolean;
  creatorEarnedPoints?: number;
}) => {
  // Update guess history with the original guess if available, otherwise current guess
  guessHistory.value.push({
    word: result.originalGuess || currentGuess.value, // Use originalGuess from server or fallback to currentGuess
    matches: result.matches
  });
  
  // Update partner's score if they earned points
  if (result.creatorEarnedPoints) {
    creatorScore.value += result.creatorEarnedPoints;
  }
  
  // Update revealed letters - Fix: Only update positions that are newly revealed
  for (let i = 0; i < secretWordLength.value; i++) {
    if (result.revealedPositions.includes(i)) {
      blurredWord.value[i] = result.word[i]; // Use target word for revealing
    }
  }
  
  revealedCount.value = result.revealedPositions.length;
  
  // Check if word is guessed
  if (result.isCorrect) {
    // If the word is correct, show the entire word
    blurredWord.value = result.word.split('');
    revealedCount.value = secretWordLength.value;
    
    gameState.value = 'complete';
    isWinner.value = true;
    secretWord.value = result.word;
    stopTimer();
    
    // Play win sound
    gameSoundEffects.playSound('win');
    
    // Calculate score
    calculateScore();
  } else if (result.matches > 0) {
    // Play correct sound for partial matches
    gameSoundEffects.playSound('correct');
  } else {
    // Play incorrect sound for no matches
    gameSoundEffects.playSound('incorrect');
  }
};

// Calculate score based on performance
const calculateScore = () => {
  if (isWinner.value) {
    // Guesser wins and gets points
    if (!isWordCreator.value) {
      // Base score for correct guess
      const baseScore = 50;
      
      // Difficulty multiplier
      const difficultyMultiplier = difficultySettings[difficulty.value].multiplier;
      
      // Calculate bonus based on attempts left (more attempts left = higher bonus)
      const attemptBonus = (maxAttempts.value - attemptCount.value) * 5;
      
      // Calculate bonus based on time left
      const timeBonus = Math.round(timer.value / 3);
      
      // Calculate final score
      const earnedPoints = Math.round((baseScore + attemptBonus + timeBonus) * difficultyMultiplier);
      guesserScore.value += earnedPoints;
      
      // Send score update to partner
      socket.value?.emit('game-score-update', {
        gameType: 'word-galaxy',
        to: props.partnerId,
        guesserScore: guesserScore.value,
        creatorScore: creatorScore.value
      });
    }
  } else {
    // Word creator wins if guesser fails
    if (isWordCreator.value) {
      // Base score for stumping the guesser
      const baseScore = 30;
      
      // Difficulty multiplier
      const difficultyMultiplier = difficultySettings[difficulty.value].multiplier;
      
      // Calculate final score
      const earnedPoints = Math.round(baseScore * difficultyMultiplier);
      creatorScore.value += earnedPoints;
      
      // Send score update to partner
      socket.value?.emit('game-score-update', {
        gameType: 'word-galaxy',
        to: props.partnerId,
        guesserScore: guesserScore.value,
        creatorScore: creatorScore.value
      });
    }
  }
  
  // Save round score - simplified to avoid complex calculations that might be inaccurate
  roundScores.value.push({
    creator: isWordCreator.value && !isWinner.value ? Math.round(30 * difficultySettings[difficulty.value].multiplier) : 0,
    guesser: !isWordCreator.value && isWinner.value ? Math.round((50 + (maxAttempts.value - attemptCount.value) * 5 + Math.round(timer.value / 3)) * difficultySettings[difficulty.value].multiplier) : 0
  });
};

// Get CSS class for match count display
const getMatchClass = (matches: number) => {
  if (matches === 0) return 'bg-red-500/30 text-red-300';
  if (matches === secretWordLength.value) return 'bg-green-500/30 text-green-300';
  if (matches >= secretWordLength.value / 2) return 'bg-yellow-500/30 text-yellow-300';
  return 'bg-blue-500/30 text-blue-300';
};

// Play again
const playAgain = () => {
  // Reset game state
  gameState.value = 'setup';
  secretWord.value = '';
  blurredWord.value = [];
  revealedLetters.value = [];
  revealedCount.value = 0;
  currentGuess.value = '';
  guessHistory.value = [];
  attemptCount.value = 0;
  isWinner.value = false;
  score.value = 0;
  timerStarted.value = false;
  
  // Increment round counter
  roundCount.value++;
  
  // Swap roles - مهم: هذا التغيير محلي فقط، ولا ينبغي أن يعكس الطرفان أدوارهما
  const previousRole = isWordCreator.value;
  isWordCreator.value = !previousRole;
  
  console.log(`Play Again clicked: Round ${roundCount.value}, Swapping roles - I was ${previousRole ? 'creator' : 'guesser'}, now I am ${isWordCreator.value ? 'creator' : 'guesser'}`);
  
  // Notify partner with instructions to switch to the opposite role
  socket.value?.emit('game-reset', {
    gameType: 'word-galaxy',
    to: props.partnerId,
    swapRoles: false, // نحن لا نريد أن يقوم الشريك بتبديل دوره مرة أخرى
    shouldBeCreator: !isWordCreator.value, // يجب أن يكون هذا عكس دورنا الحالي
    roundCount: roundCount.value,
    guesserScore: guesserScore.value,
    creatorScore: creatorScore.value
  });
};

// Handle leaving the game
const leaveGame = () => {
  showConfirmation.value = true;
  
  // Play button sound
  gameSoundEffects.playSound('button');
};

// Toggle sound mute/unmute
const toggleSound = () => {
  isSoundMuted.value = gameSoundEffects.toggleMute();
};

// Handle socket events
onMounted(() => {
  // Set initial game state based on whether partner is ready
  if (props.partnerReady) {
    gameState.value = 'setup';
    
    // Instead of random assignment, use deterministic assignment based on user IDs
    // This ensures consistent roles between the two players
    if (roundCount.value === 1) {
      // Compare user IDs to deterministically assign roles
      // This guarantees different roles as the comparison will yield opposite results for each player
      const myId = userId.value || '';
      const partnerId = props.partnerId || '';
      
      // Use alphabetical comparison to deterministically assign roles
      // If my ID comes before partner's ID, I'm the word creator
      isWordCreator.value = myId < partnerId;
      
      console.log(`Role assignment: My ID ${myId}, Partner ID ${partnerId}, I am ${isWordCreator.value ? 'word creator' : 'guesser'}`);
    }
    
    // Play game start sound
    gameSoundEffects.playSound('gameStart');
  }
  
  // Word setup
  socket.value?.on('game-word-setup', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      // Initialize game with received word length
      secretWordLength.value = data.wordLength;
      difficulty.value = data.difficulty;
      gameState.value = 'guessing';
      isWordCreator.value = false;
      
      // Set up blurred word
      initializeBlurredWord();
      
      // Start the timer
      startTimer();
    }
  });
  
  // Handle score updates
  socket.value?.on('game-score-update', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      // Update scores from partner
      if (data.guesserScore !== undefined) {
        guesserScore.value = data.guesserScore;
      }
      if (data.creatorScore !== undefined) {
        creatorScore.value = data.creatorScore;
      }
    }
  });
  
  // Handle moves (guesses, timeouts)
  socket.value?.on('game-move', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      const move = data.move;
      
      if (typeof move === 'string') {
        if (move === 'timeout') {
          // Partner ran out of time (word creator wins)
          gameState.value = 'complete';
          isWinner.value = true;
          partnerStatus.value = 'Ran out of time!';
          
          // Award points to creator for winning by timeout
          calculateScore();
        } else if (move === 'out-of-attempts') {
          // Partner ran out of attempts (word creator wins)
          gameState.value = 'complete';
          isWinner.value = true;
          partnerStatus.value = 'Ran out of attempts!';
          
          // Award points to creator for winning by attempts
          calculateScore();
        } else {
          // Es una palabra adivinada
          // This is a guessed word
          processGuess(move);
        }
      }
    }
  });
  
  // Handle guess results
  socket.value?.on('game-guess-result', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      handleGuessResult(data.result);
    }
  });
  
  // Handle partner joining
  socket.value?.on('game-partner-joined', (data: any) => {
    if (data.from === props.partnerId) {
      gameState.value = 'setup';
      
      // Use same deterministic assignment on join to ensure consistency
      if (roundCount.value === 1) {
        const myId = userId.value || '';
        const partnerId = props.partnerId || '';
        
        // Use alphabetical comparison to deterministically assign roles
        isWordCreator.value = myId < partnerId;
        
        console.log(`Partner joined: My ID ${myId}, Partner ID ${partnerId}, I am ${isWordCreator.value ? 'word creator' : 'guesser'}`);
      }
    }
  });
  
  // Listen for partner leaving
  socket.value?.on('game-partner-left', (data: any) => {
    if (data.from === props.partnerId) {
      console.log('Partner left the game');
      
      // Reset game state
      resetLocalGameState();
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
  
  // Handle game reset
  socket.value?.on('game-reset', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      console.log(`Received game-reset from partner with data:`, 
        JSON.stringify({
          roundCount: data.roundCount,
          shouldBeCreator: data.shouldBeCreator
        })
      );
      
      // Reset game state
      gameState.value = 'setup';
      secretWord.value = '';
      blurredWord.value = [];
      revealedLetters.value = [];
      revealedCount.value = 0;
      currentGuess.value = '';
      guessHistory.value = [];
      attemptCount.value = 0;
      isWinner.value = false;
      score.value = 0;
      stopTimer();
      timerStarted.value = false;
      
      // Sync round count and scores
      if (data.roundCount) {
        roundCount.value = data.roundCount;
      }
      if (data.guesserScore !== undefined) {
        guesserScore.value = data.guesserScore;
      }
      if (data.creatorScore !== undefined) {
        creatorScore.value = data.creatorScore;
      }
      
      // IMPORTANT: Always respect the role specified by the partner
      if (data.shouldBeCreator !== undefined) {
        const previousRole = isWordCreator.value;
        isWordCreator.value = data.shouldBeCreator;
        console.log(`Reset from partner: Round ${roundCount.value}, Changing role from ${previousRole ? 'creator' : 'guesser'} to ${isWordCreator.value ? 'creator' : 'guesser'}`);
      }
    }
  });
  
  // Handle notifications (non-critical messages)
  socket.value?.on('game-notification', (data: any) => {
    if (data.from === props.partnerId && data.gameType === 'word-galaxy') {
      console.log(`Game notification from partner: ${data.message}`);
      
      // We could show this to the user if needed
      // For now, we just log it and continue the game
    }
  });
});

// Clean up socket listeners and timers
onUnmounted(() => {
  stopTimer();
  
  // Stop all game sounds
  gameSoundEffects.stopAllSounds();
  
  socket.value?.off('game-word-setup');
  socket.value?.off('game-move');
  socket.value?.off('game-guess-result');
  socket.value?.off('game-score-update');
  socket.value?.off('game-partner-joined');
  socket.value?.off('game-partner-left');
  socket.value?.off('game-reset');
  socket.value?.off('game-notification');
});

// Computed property for game result
const gameResult = computed(() => {
  if (gameState.value !== 'complete') return null;
  
  if (isWordCreator.value) {
    // Word creator's perspective
    return isWinner.value ? 'failed' : 'guessed';
  } else {
    // Guesser's perspective
    return isWinner.value ? 'guessed' : 'failed';
  }
});

// New function to handle "Back to Games" button
const confirmBackToGames = () => {
  showConfirmation.value = true;
  
  // Play button sound
  gameSoundEffects.playSound('button');
};
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