<template>
  <div class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-purple-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="bg-purple-800 p-4 flex justify-between items-center">
        <h2 class="text-xl font-bold text-white">Connection History</h2>
        <button @click="$emit('close')" class="text-white opacity-70 hover:opacity-100">✕</button>
      </div>
      
      <div class="p-4">
        <!-- History List -->
        <div v-if="history.length === 0" class="text-center py-8 text-white">
          <p>No previous connections found</p>
          <p class="text-sm text-gray-400 mt-2">Your connection history will appear here</p>
        </div>
        
        <div v-else class="space-y-3">
          <div 
            v-for="(item, index) in history" 
            :key="index"
            class="bg-purple-800 rounded-lg p-4"
          >
            <div class="flex justify-between items-center mb-2">
              <div>
                <h3 class="text-white font-medium">{{ item.nickname || 'Anonymous User' }}</h3>
                <p class="text-sm text-gray-300">{{ formatDate(item.timestamp) }}</p>
              </div>
              <div>
                <button 
                  @click="reconnect(item.userId)"
                  class="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-500 transition-colors"
                >
                  Reconnect
                </button>
              </div>
            </div>
            
            <div class="flex items-center text-sm text-gray-300">
              <div class="mr-4">
                <span class="text-gray-400 mr-1">Duration:</span>
                {{ formatDuration(item.duration) }}
              </div>
              <div v-if="item.vibe" class="mr-4">
                <span class="text-gray-400 mr-1">Vibe:</span>
                {{ getVibeName(item.vibe) }}
              </div>
              <div v-if="item.rating" class="flex items-center">
                <span class="text-gray-400 mr-1">Rating:</span>
                <span class="text-yellow-400">{{ '★'.repeat(item.rating) }}</span>
                <span class="text-gray-600">{{ '★'.repeat(5 - item.rating) }}</span>
              </div>
            </div>
            
            <div v-if="item.note" class="mt-2 text-sm text-white bg-purple-700 rounded p-2">
              {{ item.note }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'connect', userId: string): void;
}>();

// Mock history data - in a real app this would come from a database
const history = ref([
  {
    userId: 'user1',
    nickname: 'StarGazer42',
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    duration: 15 * 60, // 15 minutes
    vibe: 'friendly',
    rating: 5,
    note: 'Great conversation about astronomy!'
  },
  {
    userId: 'user2',
    nickname: 'MusicFan99',
    timestamp: Date.now() - 1000 * 60 * 60 * 3, // 3 hours ago
    duration: 45 * 60, // 45 minutes
    vibe: 'deep',
    rating: 4,
    note: 'Shared some amazing music recommendations'
  },
  {
    userId: 'user3',
    nickname: 'TravelBuddy',
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    duration: 22 * 60, // 22 minutes
    vibe: 'chill',
    rating: 3,
    note: null
  },
  {
    userId: 'user4',
    nickname: null,
    timestamp: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    duration: 5 * 60, // 5 minutes
    vibe: 'any',
    rating: null,
    note: null
  }
]);

onMounted(() => {
  // In a real implementation, this would load history from local storage or an API
  console.log('History panel mounted');
});

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 24) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffInHours < 48) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
           ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function getVibeName(vibe: string): string {
  const vibeNames: Record<string, string> = {
    any: 'Any Vibe',
    friendly: 'Friendly',
    deep: 'Deep',
    funny: 'Funny',
    chill: 'Chill'
  };
  
  return vibeNames[vibe] || vibe;
}

function reconnect(userId: string) {
  emit('connect', userId);
}
</script>

<style scoped>
.fixed {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style> 