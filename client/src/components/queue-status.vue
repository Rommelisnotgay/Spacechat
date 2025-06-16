<template>
  <div v-if="isVisible" class="queue-status" :class="statusClass">
    <div class="flex items-center">
      <div v-if="isWaiting" class="spinner mr-3"></div>
      <div v-else-if="isTimeout" class="timeout-icon mr-3">⏱️</div>
      <div class="content flex-grow">
        <div class="message">{{ message }}</div>
        <div v-if="waitTime > 0" class="wait-time">
          Wait time: {{ formatWaitTime(waitTime) }}
        </div>
      </div>
      <div v-if="isTimeout" class="flex-shrink-0">
        <button @click="tryAgain" class="retry-button">
          Try Again
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '@/services/socket';

const socket = useSocket();
const status = ref<'idle' | 'waiting' | 'timeout' | 'matched'>(socket.queueStatus.value);
const message = ref<string>(socket.queueMessage.value);
const waitTime = ref<number>(socket.queueWaitTime.value);

// Compute visibility and classes based on status
const isVisible = computed(() => status.value !== 'idle' && status.value !== 'matched');
const isWaiting = computed(() => status.value === 'waiting');
const isTimeout = computed(() => status.value === 'timeout');

// Compute CSS classes based on status
const statusClass = computed(() => ({
  'waiting': isWaiting.value,
  'timeout': isTimeout.value
}));

// Format wait time in seconds to a readable format
function formatWaitTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}${remainingSeconds > 0 ? ` and ${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}` : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}${remainingMinutes > 0 ? ` and ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}` : ''}`;
  }
}

// Try searching again
function tryAgain() {
  if (socket.socket.value) {
    // Reset status
    status.value = 'idle';
    
    // Emit event to notify parent component
    emit('retry');
  }
}

// Listen for queue status changes
function onQueueStatusChanged(event: CustomEvent) {
  const data = event.detail;
  status.value = data.status;
  message.value = data.message;
  waitTime.value = data.waitTime;
}

// Define emits
const emit = defineEmits<{
  (e: 'retry'): void;
}>();

// Listen for queue status changes
onMounted(() => {
  // Update initial values
  status.value = socket.queueStatus.value;
  message.value = socket.queueMessage.value;
  waitTime.value = socket.queueWaitTime.value;
  
  // Add event listener
  window.addEventListener('queue-status-changed', onQueueStatusChanged as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('queue-status-changed', onQueueStatusChanged as EventListener);
});
</script>

<style scoped>
.queue-status {
  background: linear-gradient(to right, rgba(67, 56, 202, 0.4), rgba(79, 70, 229, 0.3));
  border-radius: 12px;
  padding: 10px 14px;
  margin: 6px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  border: 1px solid rgba(124, 58, 237, 0.25);
  max-width: 100%;
  overflow: hidden;
}

.queue-status.waiting {
  border-left: 3px solid #7c3aed;
}

.queue-status.timeout {
  border-left: 3px solid #38bdf8; /* Azul celeste */
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(124, 58, 237, 0.3);
  border-radius: 50%;
  border-top-color: #7c3aed;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.timeout-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.message {
  font-weight: 500;
  font-size: 0.9rem;
  color: #ffffff;
}

.wait-time {
  font-size: 0.8rem;
  color: #f8fafc;
  margin-top: 2px;
}

.retry-button {
  background: linear-gradient(to right, #0ea5e9, #38bdf8);
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(56, 189, 248, 0.2);
}

.retry-button:hover {
  background: linear-gradient(to right, #38bdf8, #7dd3fc);
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(56, 189, 248, 0.3);
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .queue-status {
    padding: 8px 10px;
    margin: 4px 0;
  }
  
  .spinner, .timeout-icon {
    width: 18px;
    height: 18px;
    font-size: 18px;
  }
  
  .message {
    font-size: 0.8rem;
  }
  
  .wait-time {
    font-size: 0.7rem;
  }
  
  .retry-button {
    padding: 3px 8px;
    font-size: 0.7rem;
  }
}
</style> 