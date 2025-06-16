<template>
  <div 
    class="relative w-full h-full bg-gray-900/80 backdrop-blur-md p-4 md:p-6 rounded-lg shadow-lg overflow-auto"
  >
    <!-- العنوان -->
    <h2 class="text-2xl font-bold text-purple-400 mb-6 pt-6 text-center">
      Games
    </h2>
    
    <!-- رسالة الخطأ -->
    <div v-if="errorMessage" class="bg-red-500/20 text-red-200 p-3 rounded-md mb-4 fade-in">
      {{ errorMessage }}
    </div>
    
    <!-- اختيار اللعبة -->
    <div v-if="!selectedGameComponent" class="fade-in">
      <GameSelector 
        :onSelect="selectGame" 
        class="game-transition game-fade-in"
      />
    </div>
    
    <!-- عرض اللعبة المحددة -->
    <div v-if="selectedGameComponent" class="fade-in">
      <!-- Tic-Tac-Toe -->
      <TicTacToe
        v-if="selectedGameComponent === 'tic-tac-toe'"
        :partnerId="partnerId"
        :isFirstPlayer="isFirstPlayer"
        @back="backToGameSelector"
        @error="handleError"
      />
      
      <!-- Rock-Paper-Scissors -->
      <RockPaperScissors
        v-if="selectedGameComponent === 'rock-paper-scissors'"
        :partnerId="partnerId"
        :isFirstPlayer="isFirstPlayer"
        @back="backToGameSelector"
        @error="handleError"
      />
      
      <!-- Word Galaxy -->
      <WordGalaxy
        v-if="selectedGameComponent === 'word-galaxy'"
        :partnerId="partnerId"
        :isFirstPlayer="isFirstPlayer"
        @back="backToGameSelector"
        @error="handleError"
      />

      <!-- Trivia Game -->
      <TriviaGame
        v-if="selectedGameComponent === 'trivia'"
        :partnerId="partnerId"
        :isFirstPlayer="isFirstPlayer"
        @back="backToGameSelector"
        @error="handleError"
      />
    </div>
    
    <!-- زر الخروج -->
    <div class="mt-6">
      <button
        @click="closePanel"
        class="game-button bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors game-interactive w-full md:w-auto"
      >
        Close Games
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSocket } from '@/services/socket';
import GameSelector from './GameSelector.vue';
import TicTacToe from './TicTacToe.vue';
import RockPaperScissors from './RockPaperScissors.vue';
import WordGalaxy from './WordGalaxy.vue';
import TriviaGame from './TriviaGame.vue';
import { gameSoundEffects } from './GameEffects';

const props = defineProps({
  partnerId: {
    type: String,
    required: true
  },
  closePanel: {
    type: Function,
    required: true
  }
});

const { socket } = useSocket();
const selectedGameComponent = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const isFirstPlayer = ref(true);
const isSoundMuted = ref(gameSoundEffects.isSoundMuted());

// التبديل بين كتم الصوت وتشغيله
const toggleSound = () => {
  isSoundMuted.value = gameSoundEffects.toggleMute();
};

// اختيار لعبة
const selectGame = (gameType: string) => {
  try {
    gameSoundEffects.playSound('click');
    errorMessage.value = null;
    
    // إرسال طلب اللعبة
    socket.value?.emit('game-request', {
      gameType,
      to: props.partnerId
    });
    
    // تعيين مكون اللعبة المختار
    selectedGameComponent.value = gameType;
    
    // افتراض أننا اللاعب الأول
    isFirstPlayer.value = true;

    // تشغيل صوت بدء اللعبة
    gameSoundEffects.playSound('gameStart');
  } catch (error) {
    handleError("Could not initialize game. Please try again.");
  }
};

// العودة لاختيار الألعاب
const backToGameSelector = () => {
  try {
    gameSoundEffects.playSound('click');
    selectedGameComponent.value = null;
    errorMessage.value = null;
    
    // إبلاغ الشريك بأننا غادرنا اللعبة
    if (socket.value && selectedGameComponent.value) {
      socket.value.emit('game-leave', {
        gameType: selectedGameComponent.value,
        to: props.partnerId
      });
    }
  } catch (error) {
    handleError("Error returning to game selection.");
  }
};

// معالجة الخطأ
const handleError = (message: string) => {
  errorMessage.value = message;
  
  // تشغيل صوت إشعار الخطأ
  gameSoundEffects.playSound('notification');
  
  // إخفاء الخطأ بعد 5 ثوان
  setTimeout(() => {
    errorMessage.value = null;
  }, 5000);
};

// إعداد مستمعي الأحداث
onMounted(() => {
  if (!socket.value) {
    handleError("Socket connection not available. Games may not work properly.");
    return;
  }
  
  // استقبال طلب لعبة
  socket.value.on('game-request', (data: any) => {
    try {
      if (data.from === props.partnerId) {
        // نحن الشريك الثاني
        selectedGameComponent.value = data.gameType;
        isFirstPlayer.value = false;
        
        // إعلام الطرف الأول بانضمامنا
        socket.value?.emit('game-partner-joined', {
          gameType: data.gameType,
          to: props.partnerId
        });

        // تشغيل صوت بدء اللعبة
        gameSoundEffects.playSound('gameStart');
      }
    } catch (error) {
      handleError("Error accepting game request.");
    }
  });
  
  // معالجة مغادرة الشريك
  socket.value.on('game-leave', (data: any) => {
    try {
      if (data.from === props.partnerId) {
        // العودة إلى اختيار اللعبة بدون رسالة خطأ
        selectedGameComponent.value = null;
        
        // تشغيل صوت خفيف للإشعار فقط
        gameSoundEffects.playSound('click');
      }
    } catch (error) {
      console.error("Error processing game leave event:", error);
    }
  });
});

// تنظيف مستمعي الأحداث
onUnmounted(() => {
  if (socket.value) {
    socket.value.off('game-request');
    socket.value.off('game-leave');
  }
});
</script>

<style scoped>
@import '../../assets/games-responsive.css';

.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style> 