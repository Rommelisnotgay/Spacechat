<template>
  <div class="bg-white/5 backdrop-blur-sm rounded-2xl p-4 sm:p-6 text-center border border-white/10">
    <transition 
      :name="getTransitionName" 
      mode="out-in"
      @before-leave="beforeLeave"
      @enter="enter"
      @after-enter="afterEnter">
      <!-- Disconnected/Ready State -->
      <div v-if="status === 'disconnected'" key="disconnected">
        <div class="status-container">
          <div class="status-circle">
            <img src="@/assets/Circle.png" alt="Connection Circle" class="circle-image" />
            <div class="thin-ring idle-ring"></div>
          </div>
        </div>
        <h2 class="text-base sm:text-lg font-semibold mb-1 sm:mb-2 text-white">Ready to Connect</h2>
        <p class="text-xs sm:text-sm text-gray-300">Press "Next" to find someone to talk with</p>
      </div>

      <!-- Searching State -->
      <div v-else-if="status === 'searching'" key="searching">
        <div class="status-container">
          <div class="status-circle">
            <img src="@/assets/Circle.png" alt="Connection Circle" class="circle-image pulse-effect" />
            <div class="thin-ring search-ring"></div>
          </div>
        </div>
        <h2 class="text-base sm:text-lg font-semibold mb-1 sm:mb-2 text-white">Searching...</h2>
        <p class="text-xs sm:text-sm text-gray-300">Looking for someone to talk to</p>
      </div>

      <!-- Matched State -->
      <div v-else-if="status === 'matched'" key="matched">
        <div class="status-container">
          <div class="status-circle">
            <img src="@/assets/Circle.png" alt="Connection Circle" class="circle-image fast-rotate" />
            <div class="thin-ring match-ring"></div>
          </div>
        </div>
        <h2 class="text-base sm:text-lg font-semibold mb-1 sm:mb-2 text-white">{{ partnerInfo?.vibe ? getVibeDisplayName(partnerInfo.vibe) : 'Match Found!' }}</h2>
        <div v-if="partnerInfo" class="flex items-center justify-center gap-2 text-gray-300">
          <span class="text-lg sm:text-xl">{{ partnerInfo.flag || '🌍' }}</span>
          <span class="text-xs sm:text-sm font-medium">{{ partnerInfo.country }}</span>
        </div>
        <p class="text-xs sm:text-sm text-yellow-400 mt-1 sm:mt-2">Setting up voice connection...</p>
      </div>

      <!-- Connected State -->
      <div v-else-if="status === 'connected'" key="connected">
        <div class="status-container">
          <div class="status-circle">
            <img src="@/assets/Circle.png" alt="Connection Circle" class="circle-image" />
            <div class="thin-ring connect-ring"></div>
          </div>
        </div>
        <h2 class="text-base sm:text-lg font-semibold mb-1 sm:mb-2 text-white">{{ partnerInfo?.vibe ? getVibeDisplayName(partnerInfo.vibe) : 'Connected!' }}</h2>
        <div v-if="partnerInfo" class="flex items-center justify-center gap-2 text-gray-300">
          <span class="text-lg sm:text-xl">{{ partnerInfo.flag || '🌍' }}</span>
          <span class="text-xs sm:text-sm font-medium">{{ partnerInfo.country }}</span>
        </div>
        <p class="text-xs sm:text-sm text-green-400 mt-1 sm:mt-2">You can talk now</p>
      </div>
    </transition>
    
    <!-- Connection Status Indicator -->
    <div v-if="showStatus && status !== 'disconnected'" class="mt-3 sm:mt-4 text-xs">
      <div class="flex items-center justify-center gap-1 sm:gap-2">
        <span :class="{
          'text-green-400': status === 'connected',
          'text-yellow-400': status === 'matched',
          'text-blue-400': status === 'searching'
        }">●</span>
        <span class="text-gray-300">{{ connectionStatusText }}</span>
      </div>
      
      <!-- Error message if exists -->
      <p v-if="errorMessage" class="text-red-400 mt-1 text-xs">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

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

// Отслеживаем последнее состояние для определения анимации перехода
const lastStatus = ref(props.status);

watch(() => props.status, (newStatus, oldStatus) => {
  lastStatus.value = oldStatus;
});

// Определяем имя перехода на основе предыдущего и текущего состояния
const getTransitionName = computed(() => {
  if (lastStatus.value === 'disconnected' && props.status === 'searching') {
    return 'idle-to-search';
  } else if (lastStatus.value === 'searching' && props.status === 'matched') {
    return 'search-to-match';
  } else if (lastStatus.value === 'matched' && props.status === 'connected') {
    return 'match-to-connect';
  } else if (props.status === 'disconnected') {
    return 'to-idle';
  } else {
    return 'fade';
  }
});

// Hooks для анимации переходов
const beforeLeave = (el: Element) => {
  // Можно добавить специальные эффекты перед исчезновением элемента
};

const enter = (el: Element, done: () => void) => {
  // Можно добавить специальные эффекты при появлении элемента
};

const afterEnter = (el: Element) => {
  // Можно добавить специальные эффекты после появления элемента
};

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
/* Base Container and Circle Styles */
.status-container {
  position: relative;
  width: 90px;
  height: 90px;
  margin: 0 auto 15px;
  z-index: 1;
  transition: all 0.5s ease;
}

@media (min-width: 640px) {
  .status-container {
    width: 100px;
    height: 100px;
    margin: 0 auto 20px;
  }
}

.status-circle {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: visible;
  z-index: 2;
  box-shadow: none;
  transition: all 0.3s ease;
  background: transparent;
}

.circle-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
  filter: none;
  background: transparent;
  transition: all 0.5s ease;
}

/* Thin Ring - Common for all states */
.thin-ring {
  position: absolute;
  top: -0.05px;
  left: -0.05px;
  right: -0.05px;
  bottom: -0.05px;
  border-radius: 50%;
  border: 0.05px solid transparent;
  background-origin: border-box;
  background-clip: border-box;
  box-sizing: border-box;
  z-index: -1;
}

/* Idle State - Pulsing visibility */
.idle-ring {
  background-image: linear-gradient(90deg, #9c27b0, #3498db);
  animation: fade-ring 3s ease-in-out infinite;
}

/* Searching State */
.search-ring {
  background-image: linear-gradient(90deg, #3498db, #9c27b0);
  animation: rotate-ring 3s linear infinite;
}

/* Matching State */
.match-ring {
  background-image: linear-gradient(90deg, #9c27b0, #3498db);
  animation: rotate-ring 1.5s linear infinite;
}

/* Connected State */
.connect-ring {
  background-image: linear-gradient(90deg, #3498db, #2ecc71, #3498db);
  animation: rotate-ring 4s linear infinite;
}

/* Ring animations */
@keyframes rotate-ring {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes fade-ring {
  0%, 100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
}

/* Searching State - Pulsing effect */
.pulse-effect {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

/* Matching State - Fast Rotation effect */
.fast-rotate {
  animation: fast-rotate 2s linear infinite;
}

@keyframes fast-rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Transition animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

/* Idle to Search transition */
.idle-to-search-enter-active {
  transition: all 0.3s ease;
}

.idle-to-search-leave-active {
  transition: all 0.2s ease;
}

.idle-to-search-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.idle-to-search-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* Search to Match transition */
.search-to-match-enter-active {
  transition: all 0.3s ease;
}

.search-to-match-leave-active {
  transition: all 0.2s ease;
}

.search-to-match-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.search-to-match-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* Match to Connect transition */
.match-to-connect-enter-active {
  transition: all 0.3s ease;
}

.match-to-connect-leave-active {
  transition: all 0.2s ease;
}

.match-to-connect-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.match-to-connect-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* To Idle transition */
.to-idle-enter-active {
  transition: all 0.3s ease;
}

.to-idle-leave-active {
  transition: all 0.2s ease;
}

.to-idle-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.to-idle-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style> 