<template>
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black/70" @click.self="onDecline">
    <div class="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 w-full max-w-sm border border-indigo-500/50 shadow-2xl animate-bounce-in">
      <!-- Animated glow effect -->
      <div class="absolute inset-0 -z-10 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 rounded-2xl blur-xl animate-pulse"></div>
      
      <div class="text-center">
        <div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
          <span class="text-4xl">{{ getGameIcon(gameType) }}</span>
        </div>
        <p class="text-white text-xl font-semibold mb-2 text-shadow">Game Invitation</p>
        <p class="text-white/90 text-sm mb-2">
          You've been invited to play <span class="font-medium text-indigo-300">{{ getGameName(gameType) }}</span>
        </p>
        
        <!-- Timer indicator -->
        <div class="mt-4 mb-3 relative">
          <div class="h-3 bg-gray-700/70 rounded-full overflow-hidden backdrop-blur-sm shadow-inner">
            <div 
              class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse-slow"
              :style="{ width: `${timePercentage}%` }"
            ></div>
          </div>
          <p class="text-sm text-indigo-200 mt-2 font-medium">
            {{ Math.ceil(timeLeft) }}s remaining
          </p>
        </div>
      </div>
      <div class="mt-6 grid grid-cols-2 gap-4">
        <button
          @click="onDecline"
          class="bg-gray-700/80 hover:bg-gray-600 text-white px-6 py-3 rounded-xl text-sm transition-all duration-300 hover:scale-105 backdrop-blur-sm shadow-lg"
        >
          Decline
        </button>
        <button
          @click="onAccept"
          class="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 py-3 rounded-xl text-sm transition-all duration-300 hover:scale-105 shadow-lg shadow-indigo-500/30 font-medium"
        >
          Accept
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

const props = defineProps<{
  gameType: string;
  from: string;
  inviteId: string;
}>();

const emit = defineEmits(['accept', 'decline', 'timeout']);

// Timer functionality
const INVITATION_TIMEOUT = 30; // 30 seconds
const timeLeft = ref(INVITATION_TIMEOUT);
let timer: number | null = null;

const timePercentage = computed(() => {
  return (timeLeft.value / INVITATION_TIMEOUT) * 100;
});

// Start countdown timer
onMounted(() => {
  // Play a subtle sound when notification appears
  const appearSound = new Audio('/sounds/notification.mp3');
  appearSound.volume = 0.3;
  appearSound.play().catch(err => console.log('Error playing sound', err));
  
  timer = window.setInterval(() => {
    timeLeft.value -= 0.1;
    if (timeLeft.value <= 0) {
      handleTimeout();
    }
  }, 100);
});

// Clear timer on component unmount
onBeforeUnmount(() => {
  if (timer !== null) {
    clearInterval(timer);
  }
});

// Handle invitation timeout
const handleTimeout = () => {
  if (timer !== null) {
    clearInterval(timer);
  }
  emit('timeout', { inviteId: props.inviteId });
};

// Accept and decline handlers
const onAccept = () => {
  if (timer !== null) {
    clearInterval(timer);
  }
  emit('accept', { inviteId: props.inviteId, gameType: props.gameType, from: props.from });
};

const onDecline = () => {
  if (timer !== null) {
    clearInterval(timer);
  }
  
  // إرسال حدث رفض الدعوة وإغلاق الإشعار
  emit('decline', { inviteId: props.inviteId, from: props.from, gameType: props.gameType });
  
  // تشغيل صوت النقر
  const clickSound = new Audio('/sounds/click.mp3');
  clickSound.volume = 0.3;
  clickSound.play().catch(err => console.log('Error playing sound', err));
};

// Helper functions for game type display
const getGameName = (gameType: string): string => {
  const gameNames: Record<string, string> = {
    'rock-paper-scissors': 'Rock Paper Scissors',
    'tic-tac-toe': 'Tic-Tac-Toe',
    'word-galaxy': 'Word Galaxy',
    'trivia': 'Trivia Quiz'
  };
  
  return gameNames[gameType] || gameType;
};

const getGameIcon = (gameType: string): string => {
  const gameIcons: Record<string, string> = {
    'rock-paper-scissors': '✂️',
    'tic-tac-toe': '⭕',
    'word-galaxy': '🌌',
    'trivia': '❓'
  };
  
  return gameIcons[gameType] || '🎮';
};
</script>

<style scoped>
.animate-bounce-in {
  animation: bounceIn 0.6s cubic-bezier(0.215, 0.610, 0.355, 1.000);
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale3d(0.3, 0.3, 0.3);
  }
  20% {
    transform: scale3d(1.1, 1.1, 1.1);
  }
  40% {
    transform: scale3d(0.9, 0.9, 0.9);
  }
  60% {
    opacity: 1;
    transform: scale3d(1.03, 1.03, 1.03);
  }
  80% {
    transform: scale3d(0.97, 0.97, 0.97);
  }
  100% {
    opacity: 1;
    transform: scale3d(1, 1, 1);
  }
}

.animate-pulse-slow {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.text-shadow {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
</style> 