<template>
  <div class="relative">
    <!-- Vibe Dropdown Button -->
    <button 
      @click="toggleDropdown"
      class="w-full bg-gradient-to-r from-purple-700 to-indigo-800 text-white rounded-lg px-6 py-3 flex items-center justify-between shadow-lg border border-purple-500/30"
    >
      <div class="flex items-center">
        <span class="text-yellow-300 mr-3 text-xl">{{ vibeEmojis[selectedVibe] }}</span>
        <span class="text-lg">{{ currentVibeDisplay }}</span>
      </div>
      <span :class="{'transform rotate-180 transition-transform duration-300': isOpen}" class="text-xs text-purple-300">▼</span>
    </button>
    
    <!-- Dropdown Menu -->
    <div 
      v-if="isOpen" 
      class="absolute top-full left-0 right-0 mt-2 bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl overflow-hidden z-10 shadow-2xl border border-purple-500/30 max-h-64 overflow-y-auto"
    >
      <button 
        v-for="(name, vibe) in vibeOptions" 
        :key="vibe"
        @click="selectVibe(vibe)"
        class="w-full text-left px-4 py-3 flex items-center hover:bg-purple-700/50 transition-colors"
        :class="selectedVibe === vibe ? 'bg-purple-700/70' : ''"
      >
        <span class="mr-3 text-xl">{{ vibeEmojis[vibe] }}</span>
        <span>{{ name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

type VibeType = 'any' | 'friendly' | 'deep' | 'funny' | 'chill' | 'curious' | 'creative' | 'romantic' | 'mysterious' | 'energetic' | 'philosophical';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', vibe: string): void;
}>();

const isOpen = ref(false);
const selectedVibe = ref<VibeType>('any');

const vibeOptions: Record<VibeType, string> = {
  any: 'Any Vibe',
  friendly: 'Friendly Chat',
  deep: 'Deep Conversations',
  funny: 'Humor & Fun',
  chill: 'Chill & Relaxed',
  curious: 'Curious & Inquisitive',
  creative: 'Creative & Artistic',
  romantic: 'Romantic Connection',
  mysterious: 'Mysterious & Enigmatic',
  energetic: 'Energetic & Lively',
  philosophical: 'Philosophical Thoughts'
};

const vibeEmojis: Record<VibeType, string> = {
  any: '⭐',
  friendly: '👋',
  deep: '🌌',
  funny: '😂',
  chill: '🌊',
  curious: '🔍',
  creative: '🎨',
  romantic: '❤️',
  mysterious: '🔮',
  energetic: '⚡',
  philosophical: '🧠'
};

const currentVibeDisplay = computed(() => {
  return vibeOptions[selectedVibe.value] || vibeOptions.any;
});

watch(() => props.modelValue, (newValue) => {
  if (newValue && Object.keys(vibeOptions).includes(newValue)) {
    selectedVibe.value = newValue as VibeType;
  }
}, { immediate: true });

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function selectVibe(vibe: string) {
  selectedVibe.value = vibe as VibeType;
  emit('update:modelValue', vibe);
  isOpen.value = false;
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.relative')) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
/* Dropdown animation */
.absolute {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Custom scroll bar for dropdown */
.max-h-64 {
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 92, 246, 0.5) rgba(30, 27, 75, 0.5);
}

.max-h-64::-webkit-scrollbar {
  width: 6px;
}

.max-h-64::-webkit-scrollbar-track {
  background: rgba(30, 27, 75, 0.5);
  border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.5);
  border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.8);
}
</style> 