<template>
  <div class="bg-white/5 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10">
    <!-- Searching State -->
    <div v-if="status === 'searching'">
      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center animate-pulse">
        <div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h2 class="text-lg font-semibold mb-2">Searching...</h2>
      <p class="text-sm text-gray-300">Looking for someone to talk to</p>
    </div>

    <!-- Matched State - New state for quick transition -->
    <div v-else-if="status === 'matched'">
      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-yellow-500 to-green-500 rounded-full flex items-center justify-center animate-pulse">
        <span v-if="partnerInfo?.flag" class="text-2xl">{{ partnerInfo.flag }}</span>
        <span v-else class="text-2xl">🔄</span>
      </div>
      <h2 class="text-lg font-semibold mb-2 text-yellow-400">{{ partnerInfo?.vibe ? getVibeDisplayName(partnerInfo.vibe) : 'Match Found!' }}</h2>
      <div v-if="partnerInfo" class="flex items-center justify-center gap-2 text-gray-300">
        <span class="text-xl">{{ partnerInfo.flag || '🌍' }}</span>
        <span class="text-sm font-medium">{{ partnerInfo.country }}</span>
      </div>
      <p class="text-sm text-yellow-400 mt-2">Setting up voice connection...</p>
      
      <!-- Connection progress indicator -->
      <div class="mt-3 relative h-1.5 w-3/4 mx-auto bg-gray-700 rounded-full overflow-hidden">
        <div class="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-500 to-green-500 rounded-full animate-progress"></div>
      </div>
    </div>

    <!-- Connected State -->
    <div v-else-if="status === 'connected'">
      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
        <span v-if="partnerInfo?.flag" class="text-2xl">{{ partnerInfo.flag }}</span>
        <span v-else class="text-2xl">👥</span>
      </div>
      <h2 class="text-lg font-semibold mb-2">{{ partnerInfo?.vibe ? getVibeDisplayName(partnerInfo.vibe) : 'Connected!' }}</h2>
      <div v-if="partnerInfo" class="flex items-center justify-center gap-2 text-gray-300">
        <span class="text-xl">{{ partnerInfo.flag || '🌍' }}</span>
        <span class="text-sm font-medium">{{ partnerInfo.country }}</span>
      </div>
      <p class="text-sm text-green-400 mt-2">You can talk now</p>
    </div>

    <!-- Disconnected/Ready State -->
    <div v-else>
      <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full flex items-center justify-center">
        <span class="text-2xl">🌟</span>
      </div>
      <h2 class="text-lg font-semibold mb-2">Ready to Connect</h2>
      <p class="text-sm text-gray-300">Press "Next" to find someone to talk with</p>
    </div>
    
    <!-- Connection Status Indicator -->
    <div v-if="showStatus && status !== 'disconnected'" class="mt-4 text-xs">
      <div class="flex items-center justify-center gap-2">
        <span :class="{
          'text-green-400': status === 'connected',
          'text-yellow-400': status === 'matched',
          'text-blue-400': status === 'searching'
        }">●</span>
        <span>{{ connectionStatusText }}</span>
      </div>
      
      <!-- Error message if exists -->
      <p v-if="errorMessage" class="text-red-400 mt-1 text-xs">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface PartnerInfo {
  flag?: string;
  country?: string;
  id?: string;
  vibe?: string;
}

const props = defineProps({
  status: {
    type: String,
    default: 'disconnected', // 'searching', 'matched', 'connected', 'disconnected'
  },
  partnerInfo: {
    type: Object as () => PartnerInfo | null,
    default: null
  },
  errorMessage: {
    type: String,
    default: ''
  },
  showStatus: {
    type: Boolean,
    default: true
  }
});

// Computed text for connection status
const connectionStatusText = computed(() => {
  switch (props.status) {
    case 'searching': return 'Searching...';
    case 'matched': return 'Partner found, connecting...';
    case 'connected': return 'Connected';
    default: return 'Disconnected';
  }
});

const getVibeDisplayName = (vibe: string) => {
  // تحويل قيم الفايب إلى أسماء عرض سهلة الفهم
  switch (vibe.toLowerCase()) {
    case 'any':
      return 'Go With the Flow';
    case 'chill':
      return 'Chill';
    case 'fun':
      return 'Fun';
    case 'curious':
      return 'Curious';
    case 'creative':
      return 'Creative';
    default:
      return vibe; // إرجاع القيمة الأصلية إذا لم يتم التعرف عليها
  }
};
</script>

<style scoped>
@keyframes progress {
  0% { width: 0; }
  100% { width: 100%; }
}

.animate-progress {
  animation: progress 3s ease-in-out infinite;
}
</style> 