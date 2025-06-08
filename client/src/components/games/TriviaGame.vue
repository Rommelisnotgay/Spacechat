<template>
  <div class="w-full max-w-md mx-auto bg-purple-900 bg-opacity-80 rounded-xl p-4 shadow-lg">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-bold text-white">Trivia Challenge</h2>
      <div class="text-white">
        Score: {{ score }}
      </div>
    </div>
    
    <div v-if="loading" class="flex flex-col items-center justify-center py-8">
      <div class="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent mb-4"></div>
      <p class="text-white">Loading question...</p>
    </div>
    
    <div v-else-if="currentQuestion" class="space-y-4">
      <div class="bg-purple-800 bg-opacity-70 p-4 rounded-lg">
        <p class="text-white text-lg mb-2">{{ currentQuestion.question }}</p>
        <p class="text-gray-300 text-sm">Category: {{ currentQuestion.category }}</p>
      </div>
      
      <div class="space-y-2">
        <button 
          v-for="(answer, index) in shuffledAnswers" 
          :key="index"
          @click="selectAnswer(answer)"
          :disabled="selectedAnswer !== null"
          :class="[
            'w-full text-left p-3 rounded-lg transition-colors text-white',
            selectedAnswer === null ? 'bg-purple-800 hover:bg-purple-700' : 
              answer === currentQuestion.correct_answer ? 'bg-green-600' :
              selectedAnswer === answer ? 'bg-red-600' : 'bg-purple-800 opacity-75'
          ]"
        >
          {{ answer }}
        </button>
      </div>
      
      <div v-if="selectedAnswer" class="mt-4 text-center">
        <p class="text-lg mb-4" :class="isCorrect ? 'text-green-400' : 'text-red-400'">
          {{ isCorrect ? 'Correct! +1 point' : 'Wrong answer!' }}
        </p>
        <button 
          @click="nextQuestion"
          class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg transition-colors"
        >
          Next Question
        </button>
      </div>
    </div>
    
    <div class="mt-6 flex justify-end">
      <button 
        @click="$emit('close')"
        class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
      >
        Exit Game
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '@/services/socket';

// Define emits
const emit = defineEmits(['close']);

// Game state
interface TriviaQuestion {
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

const loading = ref(true);
const currentQuestion = ref<TriviaQuestion | null>(null);
const shuffledAnswers = ref<string[]>([]);
const selectedAnswer = ref<string | null>(null);
const score = ref(0);
const isCorrect = computed(() => 
  selectedAnswer.value === currentQuestion.value?.correct_answer
);

// Get socket connection
const { socket, userId } = useSocket();

// Initialize game
function initGame() {
  // Set up event listeners
  socket.value?.on('trivia:question', (question: TriviaQuestion) => {
    currentQuestion.value = question;
    shuffleAnswers();
    selectedAnswer.value = null;
    loading.value = false;
  });
  
  socket.value?.on('trivia:score', (data: { userId: string, score: number }) => {
    if (data.userId === userId.value) {
      score.value = data.score;
    }
  });
  
  // Request first question
  requestQuestion();
}

// Shuffle answers for the current question
function shuffleAnswers() {
  if (!currentQuestion.value) return;
  
  const answers = [
    currentQuestion.value.correct_answer,
    ...currentQuestion.value.incorrect_answers
  ];
  
  // Fisher-Yates shuffle
  for (let i = answers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [answers[i], answers[j]] = [answers[j], answers[i]];
  }
  
  shuffledAnswers.value = answers;
}

// Select an answer
function selectAnswer(answer: string) {
  if (selectedAnswer.value !== null) return;
  
  selectedAnswer.value = answer;
  
  // Send answer to server
  socket.value?.emit('trivia:answer', {
    userId: userId.value,
    answer
  });
  
  // Update score locally
  if (isCorrect.value) {
    score.value++;
  }
}

// Request new question
function requestQuestion() {
  loading.value = true;
  socket.value?.emit('trivia:request', {
    userId: userId.value
  });
}

// Get next question
function nextQuestion() {
  requestQuestion();
}

// Setup and teardown
onMounted(() => {
  initGame();
});

onUnmounted(() => {
  // Clean up listeners
  socket.value?.off('trivia:question');
  socket.value?.off('trivia:score');
});
</script>

<style scoped>
button:disabled {
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style> 