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

      <!-- Disconnecting State (NEW) -->
      <div v-else-if="status === 'disconnecting'" key="disconnecting">
        <div class="status-container">
          <div class="status-circle">
            <img src="@/assets/Circle.png" alt="Connection Circle" class="circle-image pulse-effect" />
            <div class="thin-ring disconnecting-ring"></div>
          </div>
        </div>
        <h2 class="text-base sm:text-lg font-semibold mb-1 sm:mb-2 text-white">{{ disconnectTitle }}</h2>
        <p class="text-xs sm:text-sm text-red-300">{{ disconnectMessage }}</p>
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
          'text-blue-400': status === 'searching',
          'text-red-400': status === 'disconnecting'
        }">●</span>
        <span class="text-gray-300">{{ connectionStatusText }}</span>
      </div>
      
      <!-- Error message if exists -->
      <p v-if="errorMessage" class="text-red-400 mt-1 text-xs">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';

interface PartnerInfo {
  flag?: string;
  country?: string;
  id?: string;
  vibe?: string;
}

const props = defineProps({
  status: {
    type: String,
    default: 'disconnected', // 'searching', 'matched', 'connected', 'disconnected', 'disconnecting'
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
  },
  disconnectReason: {
    type: String,
    default: ''
  }
});

// Отслеживаем последнее состояние для определения анимации перехода
const lastStatus = ref(props.status);

// Custom titles and messages for disconnecting state
const disconnectTitle = computed(() => {
  switch(props.disconnectReason) {
    case 'skip':
      return 'Skipped';
    case 'network-disconnect':
      return 'Connection Lost';
    case 'inactivity':
      return 'Inactive Connection';
    case 'matching':
      return 'Finding New Partner';
    default:
      return 'Disconnected';
  }
});

const disconnectMessage = computed(() => {
  switch(props.disconnectReason) {
    case 'skip':
      return 'The conversation has been skipped';
    case 'network-disconnect':
      return 'The connection with your partner was lost';
    case 'inactivity':
      return 'The call ended due to inactivity';
    case 'matching':
      return 'Looking for a new partner...';
    default:
      return 'The call has been ended';
  }
});

// Add watch for partnerInfo to log changes
watch(() => props.partnerInfo, (newInfo, oldInfo) => {
  console.log('PartnerInfo changed in connection-card:', 
    { new: newInfo ? 'Present' : 'Null', 
      old: oldInfo ? 'Present' : 'Null',
      status: props.status });
}, { deep: true });

watch(() => props.status, (newStatus, oldStatus) => {
  console.log('Status changed in connection-card:', { new: newStatus, old: oldStatus });
  lastStatus.value = oldStatus;
  
  // Make sure partner info is null when disconnected
  if (newStatus === 'disconnected' && props.partnerInfo !== null) {
    console.warn('Warning: Partner info still present when status is disconnected');
  }
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
  } else if (props.status === 'disconnecting') {
    return 'to-disconnecting';
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
    case 'disconnecting': return 'Call ended'; // Added for disconnecting state
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

// Listen for connection-closed event
onMounted(() => {
  window.addEventListener('connection-closed', () => {
    console.log('Connection-closed event received in connection-card');
  });
});
</script>

<style scoped>
/* Base Container and Circle Styles */
.status-container {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
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
}

.circle-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  z-index: 1;
  position: relative;
}

.thin-ring {
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border-radius: 50%;
  border: 2px solid transparent;
  z-index: 0;
}

/* Animation effect for pulse */
.pulse-effect {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Fast rotate animation */
.fast-rotate {
  animation: fastRotate 2s infinite linear;
}

@keyframes fastRotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Ring colors and animations */
.idle-ring {
  border-color: rgba(139, 92, 246, 0.3); /* Purple with low opacity */
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
}

.search-ring {
  border-color: rgba(59, 130, 246, 0.5); /* Blue */
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
  animation: searchPulse 1.5s infinite alternate;
}

@keyframes searchPulse {
  0% {
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
  }
  100% {
    box-shadow: 0 0 25px rgba(59, 130, 246, 0.6);
  }
}

.match-ring {
  border-color: rgba(234, 179, 8, 0.5); /* Yellow */
  box-shadow: 0 0 20px rgba(234, 179, 8, 0.4);
  animation: matchPulse 0.8s infinite alternate;
}

@keyframes matchPulse {
  0% {
    box-shadow: 0 0 15px rgba(234, 179, 8, 0.4);
  }
  100% {
    box-shadow: 0 0 30px rgba(234, 179, 8, 0.6);
  }
}

.connect-ring {
  border-color: rgba(34, 197, 94, 0.5); /* Green */
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
  animation: connectPulse 3s infinite alternate;
}

@keyframes connectPulse {
  0% {
    box-shadow: 0 0 15px rgba(34, 197, 94, 0.4);
  }
  100% {
    box-shadow: 0 0 25px rgba(34, 197, 94, 0.5);
  }
}

/* Transition Classes */
.idle-to-search-enter-active,
.idle-to-search-leave-active,
.search-to-match-enter-active,
.search-to-match-leave-active,
.match-to-connect-enter-active,
.match-to-connect-leave-active,
.to-idle-enter-active,
.to-idle-leave-active,
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s, transform 0.5s;
}

.idle-to-search-enter-from,
.search-to-match-enter-from,
.match-to-connect-enter-from,
.to-idle-enter-from,
.fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.idle-to-search-leave-to,
.search-to-match-leave-to,
.match-to-connect-leave-to,
.to-idle-leave-to,
.fade-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

.disconnecting-ring {
  border-color: #ef4444;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.8);
  animation: pulse-border-red 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-border-red {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
}
</style> 