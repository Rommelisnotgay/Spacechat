<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-gray-900 rounded-lg w-full max-w-md mx-auto h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-700">
        <div class="flex items-center">
          <span class="text-white text-lg font-medium">💬 Chat</span>
        </div>
        <button 
          @click="$emit('close')" 
          class="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      
      <!-- Messages -->
      <div class="flex-1 p-4 overflow-y-auto" ref="messagesContainerRef">
        <div v-if="messages.length === 0" class="h-full flex items-center justify-center text-gray-500">
          <div class="text-center">
            <p>No messages yet</p>
            <p class="text-sm mt-1">Send a message to start the conversation</p>
          </div>
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="message in messages" 
            :key="message.id"
            class="rounded-lg p-3 max-w-[80%]"
            :class="message.isOwn 
              ? 'bg-blue-700 ml-auto' 
              : 'bg-gray-700 mr-auto'"
          >
            <div class="flex justify-between gap-2">
              <span class="text-sm" :class="message.isOwn ? 'text-blue-200' : 'text-gray-200'">
                {{ message.isOwn ? 'You' : 'Partner' }}
              </span>
              <span class="text-xs text-gray-400">
                {{ formatTime(message.timestamp) }}
              </span>
            </div>
            <p class="mt-1 text-white break-words">{{ message.message }}</p>
          </div>
        </div>
      </div>
      
      <!-- Input -->
      <div class="p-3 border-t border-gray-700">
        <form @submit.prevent="sendMessage" class="flex gap-2">
          <input
            v-model="currentMessage"
            type="text"
            placeholder="Type a message..."
            class="flex-1 bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            :disabled="!isConnected"
          />
          <button
            type="submit"
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!isConnected || !currentMessage.trim()"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';

interface Message {
  id: string;
  message: string;
  isOwn: boolean;
  timestamp: number;
}

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  isConnected: {
    type: Boolean,
    default: false
  },
  messages: {
    type: Array as () => Message[],
    default: () => []
  }
});

const emit = defineEmits(['close', 'send-message']);

const currentMessage = ref('');
const messagesContainerRef = ref<HTMLElement | null>(null);

const sendMessage = () => {
  if (currentMessage.value.trim() && props.isConnected) {
    emit('send-message', currentMessage.value);
    currentMessage.value = '';
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainerRef.value) {
    messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight;
  }
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

watch(() => props.messages, () => {
  scrollToBottom();
}, { deep: true });

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    scrollToBottom();
  }
});

onMounted(() => {
  if (props.isOpen) {
    scrollToBottom();
  }
});
</script> 