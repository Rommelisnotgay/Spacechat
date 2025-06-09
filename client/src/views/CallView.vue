<template>
  <div class="min-h-screen bg-gradient-to-b from-purple-900 to-purple-700 text-white font-sans flex flex-col">
    <!-- Header -->
    <header class="p-3 sm:p-4 flex justify-between items-center">
      <div class="flex items-center">
        <h1 class="text-xl sm:text-2xl font-bold text-white">SpaceChat.live</h1>
      </div>
      <div class="bg-space-purple-800 bg-opacity-50 rounded-full px-3 py-1 text-xs sm:text-sm flex items-center">
        <span class="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-green-500 mr-1.5 sm:mr-2"></span>
        <span>{{ onlineCount }} online</span>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col items-center justify-center p-3 sm:p-4">
      <div class="bg-space-purple-800 bg-opacity-50 rounded-3xl w-full max-w-2xl p-4 sm:p-6">
        <div class="text-center mb-4 sm:mb-6">
          <h2 class="text-xl sm:text-2xl font-bold">{{ connectionStatus }}</h2>
        </div>

        <!-- Control Buttons -->
        <div class="flex justify-center gap-2 sm:gap-4 my-4 sm:my-6">
          <button 
            class="w-12 h-12 sm:w-16 sm:h-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
            @click="handleDisconnect"
          >
            <span class="text-lg sm:text-2xl">❌</span>
          </button>
          <button 
            class="w-16 h-16 sm:w-20 sm:h-20 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg"
            @click="handleNext"
          >
            <span class="text-lg sm:text-2xl">➡️</span>
          </button>
          <button 
            class="w-12 h-12 sm:w-16 sm:h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
            :class="{ 'bg-red-500': isMuted }"
            @click="toggleMute"
          >
            <span class="text-lg sm:text-2xl">{{ isMuted ? '🔇' : '🎤' }}</span>
          </button>
        </div>
      </div>
    </main>

    <!-- Tab Navigation -->
    <nav class="flex justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto px-2 flex-wrap">
      <button 
        class="px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap"
        :class="activeTab === 'chat' ? 'bg-blue-600' : 'bg-gray-700'"
        @click="activeTab = 'chat'"
      >
        Chat
      </button>
      <button 
        class="px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap"
        :class="activeTab === 'games' ? 'bg-blue-600' : 'bg-gray-700'"
        @click="activeTab = 'games'"
      >
        Games
      </button>
      <button 
        class="px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap"
        :class="activeTab === 'history' ? 'bg-blue-600' : 'bg-gray-700'"
        @click="activeTab = 'history'"
      >
        History
      </button>
      <button 
        class="px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap"
        :class="activeTab === 'support' ? 'bg-blue-600' : 'bg-gray-700'"
        @click="activeTab = 'support'"
      >
        Support
      </button>
      <button 
        class="px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm whitespace-nowrap"
        :class="activeTab === 'filter' ? 'bg-blue-600' : 'bg-gray-700'"
        @click="activeTab = 'filter'"
      >
        Filter
      </button>
    </nav>

    <div class="mb-3 sm:mb-4">
      <!-- Chat Panel -->
      <div v-if="activeTab === 'chat'" class="mx-2 sm:mx-4 bg-space-purple-800 bg-opacity-50 rounded-xl p-3 sm:p-4">
        <div class="h-48 sm:h-64 overflow-y-auto mb-3 sm:mb-4 p-2">
          <div v-for="(msg, index) in chatMessages" :key="index" class="mb-2">
            <div class="flex">
              <span class="font-bold mr-2 text-xs sm:text-sm">{{ msg.sender === 'me' ? 'You:' : 'Partner:' }}</span>
              <span class="text-xs sm:text-sm">{{ msg.text }}</span>
            </div>
          </div>
        </div>
        <div class="flex">
          <input 
            type="text" 
            v-model="messageText" 
            @keyup.enter="sendMessage"
            placeholder="Type a message..."
            class="flex-1 bg-gray-700 text-white rounded-l-full px-3 py-1.5 sm:px-4 sm:py-2 outline-none text-xs sm:text-sm"
          />
          <button 
            @click="sendMessage"
            class="bg-blue-600 text-white rounded-r-full px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm"
          >
            Send
          </button>
        </div>
      </div>

      <!-- Other panels would be implemented here -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

// Reactive state
const activeTab = ref('chat');
const onlineCount = ref(0);
const connectionStatus = ref('Waiting for connection...');
const isMuted = ref(false);
const chatMessages = ref([
  { sender: 'me', text: 'Hello there!' },
  { sender: 'partner', text: 'Hi! How are you doing?' }
]);
const messageText = ref('');

// Methods
const handleDisconnect = () => {
  connectionStatus.value = 'Disconnected';
  // Implementation would call WebRTC service to disconnect
};

const handleNext = () => {
  connectionStatus.value = 'Finding next person...';
  // Implementation would call WebRTC service to find next person
};

const toggleMute = () => {
  isMuted.value = !isMuted.value;
  // Implementation would call WebRTC service to toggle audio
};

const sendMessage = () => {
  if (!messageText.value.trim()) return;
  
  chatMessages.value.push({
    sender: 'me',
    text: messageText.value
  });
  
  messageText.value = '';
  // Implementation would emit message via socket.io
};

onMounted(() => {
  // Connect to WebRTC and socket services
  connectionStatus.value = 'Ready to connect';
  onlineCount.value = 42; // Mock value
});
</script> 