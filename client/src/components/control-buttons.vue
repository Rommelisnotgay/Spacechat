<template>
  <div class="space-y-2 sm:space-y-3 md:space-y-4 px-1 sm:px-2">
    <!-- Main Control Buttons -->
    <div class="flex justify-center items-center gap-2 sm:gap-3 md:gap-4">
      <!-- Mute Button -->
      <button
        @click="toggleMute"
        class="w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all shadow-xl transform hover:scale-110"
        :class="internalMuteState ? 'bg-gradient-to-r from-red-400 to-pink-400 shadow-red-400/70' : 'bg-gradient-to-r from-emerald-400 to-green-400 hover:from-green-400 hover:to-emerald-400 shadow-emerald-400/70'"
        :disabled="isProcessing"
      >
        <div class="relative">
          <span v-if="!internalMuteState" class="text-white text-base sm:text-lg md:text-xl">🎤</span>
          <span v-else class="text-white text-base sm:text-lg md:text-xl">🔇</span>
          <span v-if="isProcessing" class="absolute -top-1 -right-1 w-2 h-2 sm:w-3 sm:h-3 bg-yellow-300 rounded-full animate-pulse"></span>
        </div>
      </button>

      <!-- Next/Find Partner Button -->
      <button
        @click="$emit('find-next')"
        class="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-gradient-to-r from-orange-400 to-yellow-400 hover:from-yellow-400 hover:to-orange-400 rounded-full flex items-center justify-center shadow-2xl shadow-orange-400/80 transition-all transform hover:scale-110"
      >
        <span class="text-white text-xl sm:text-2xl md:text-3xl">📞</span>
      </button>

      <!-- Chat Button -->
      <button
        @click="$emit('toggle-chat')"
        :disabled="isDisabled"
        class="w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shadow-xl transition-all transform hover:scale-110"
        :class="isDisabled ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-blue-400 to-cyan-400 hover:from-cyan-400 hover:to-blue-400 shadow-blue-400/70'"
      >
        <span class="text-white text-base sm:text-lg md:text-xl">💬</span>
      </button>
    </div>

    <!-- Secondary Controls -->
    <div class="flex flex-wrap justify-center gap-1 sm:gap-2 md:gap-3">
      <button
        @click="$emit('toggle-games')"
        class="bg-gradient-to-r from-purple-400 to-pink-400 hover:from-pink-400 hover:to-purple-400 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-xs md:text-sm shadow-xl shadow-purple-400/70 transition-all transform hover:scale-110 whitespace-nowrap"
      >
        🎮 Games
      </button>
      <button
        @click="$emit('toggle-history')"
        class="bg-gradient-to-r from-indigo-400 to-blue-400 hover:from-blue-400 hover:to-indigo-400 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-xs md:text-sm shadow-xl shadow-indigo-400/70 transition-all transform hover:scale-110 whitespace-nowrap"
      >
        📞 History
      </button>
      <button
        @click="$emit('toggle-donation')"
        class="bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-orange-400 hover:to-yellow-400 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-xs md:text-sm shadow-xl shadow-yellow-400/70 transition-all animate-pulse transform hover:scale-110 whitespace-nowrap"
      >
        ❤️ Support
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useMicrophoneState } from '@/services/storage';

const props = defineProps({
  isMuted: {
    type: Boolean,
    default: false
  },
  isDisabled: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits([
  'toggle-mute',
  'find-next',
  'toggle-chat',
  'toggle-games',
  'toggle-history',
  'toggle-donation'
]);

// منع النقرات المتكررة
const isProcessing = ref(false);

// استخدام حالة داخلية لكتم الصوت لتتبع التغييرات من مصادر مختلفة
const internalMuteState = ref(props.isMuted);

// مشاهدة تغييرات حالة كتم الصوت من الخارج
watch(() => props.isMuted, (newValue) => {
  internalMuteState.value = newValue;
});

// الاستماع لحدث تغيير حالة كتم الصوت
function onMicrophoneStateChanged(event: CustomEvent) {
  const { isMuted } = event.detail;
  internalMuteState.value = isMuted;
}

// Enhanced mute toggle function to ensure audio works properly
function toggleMute() {
  if (isProcessing.value) return; // منع النقرات المتكررة
  
  isProcessing.value = true;
  emit('toggle-mute');
  
  // تحديث الحالة الداخلية مؤقتًا (سيتم تحديثها بشكل نهائي عند استلام الحدث)
  // internalMuteState.value = !internalMuteState.value;
  
  // تقليل وقت القفل لزيادة الاستجابة
  setTimeout(() => {
    isProcessing.value = false;
  }, 200); // تقليل الوقت من 500 إلى 200 مللي ثانية
  
  // محاولة تشغيل الصوت بعد تفاعل المستخدم
  setTimeout(() => {
    try {
      const audioElement = document.querySelector('audio');
      if (audioElement && audioElement.paused) {
        audioElement.play().catch(err => {
          console.warn('Could not auto-play audio after mute toggle:', err);
        });
      }
    } catch (error) {
      console.error('Error trying to auto-play:', error);
    }
  }, 300);
}

// استعادة حالة كتم الصوت من التخزين عند تحميل المكون
onMounted(() => {
  const { getSavedMicrophoneState } = useMicrophoneState();
  const savedState = getSavedMicrophoneState();
  if (savedState !== null) {
    internalMuteState.value = savedState;
  }
  
  // إضافة مستمع لحدث تغيير حالة كتم الصوت
  window.addEventListener('microphone-state-changed', onMicrophoneStateChanged as EventListener);
});

// تنظيف المستمعين عند إزالة المكون
onUnmounted(() => {
  window.removeEventListener('microphone-state-changed', onMicrophoneStateChanged as EventListener);
});
</script> 