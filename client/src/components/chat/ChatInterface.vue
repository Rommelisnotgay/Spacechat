<template>
  <div class="chat-container w-full h-full flex flex-col bg-purple-900 bg-opacity-80 rounded-xl overflow-hidden shadow-xl">
    <!-- Chat Header -->
    <div class="chat-header bg-purple-800 p-4 flex justify-between items-center">
      <div class="flex items-center">
        <h2 class="text-xl font-bold text-white">Chat</h2>
        <span v-if="isPartnerTyping" class="ml-2 text-sm text-blue-300 animate-pulse">
          Partner is typing...
        </span>
      </div>
      <button @click="$emit('close')" class="text-white opacity-70 hover:opacity-100">
        <span class="text-xl">✕</span>
      </button>
      </div>
    
    <!-- Messages Container -->
    <div 
      class="messages-container flex-1 p-4 overflow-y-auto" 
      ref="messagesContainer"
    >
      <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-center text-gray-400">
        <p class="mb-2">No messages yet</p>
        <p class="text-sm">Start chatting with your connection!</p>
      </div>
      
      <div v-else class="space-y-4">
        <div 
          v-for="message in messages" 
          :key="message.id"
          class="message-wrapper flex"
          :class="{'justify-end': message.sender === 'me'}"
        >
          <div 
            class="message max-w-[80%] rounded-lg px-4 py-2"
            :class="[
              message.sender === 'me' 
                ? 'bg-blue-600 text-white' 
                : 'bg-purple-700 text-white'
            ]"
          >
            <div class="message-content">{{ message.text }}</div>
            <div class="message-footer flex justify-between items-center mt-1">
              <div class="message-time text-xs opacity-70">
                {{ formatTime(message.timestamp) }}
              </div>
              
              <!-- Message status indicators (only for sent messages) -->
              <div v-if="message.sender === 'me'" class="message-status flex items-center">
                <!-- Status icon based on message status -->
                <span v-if="message.status === 'sending'" class="text-xs opacity-70">
                  <span class="animate-pulse">⏳</span>
                </span>
                <span v-else-if="message.status === 'sent'" class="text-xs opacity-70">
                  ✓
                </span>
                <span v-else-if="message.status === 'delivered'" class="text-xs opacity-70">
                  ✓✓
                </span>
                <span v-else-if="message.status === 'read'" class="text-xs text-blue-300">
                  ✓✓
                </span>
                <span v-else-if="message.status === 'failed'" class="text-xs text-red-400">
                  ⚠️
                  <button 
                    @click="resendMessage(message.id)"
                    class="ml-1 text-red-300 hover:text-white"
                    title="Retry sending"
                  >
                    🔄
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Connection Status Indicator -->
      <div v-if="!isConnected" class="fixed bottom-20 left-0 right-0 mx-auto text-center">
        <div class="inline-block bg-red-600/80 text-white px-4 py-2 rounded-full text-sm">
          <span class="animate-pulse">●</span> Disconnected - Messages will be sent when reconnected
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="input-area p-4 bg-purple-800 border-t border-purple-700">
      <form @submit.prevent="sendMessage" class="flex">
        <div class="flex-1 relative">
          <input 
            v-model="newMessage" 
            @input="handleTyping"
            type="text" 
            class="w-full bg-purple-700 text-white rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type a message..."
            ref="messageInput"
          />
          <div class="absolute right-3 top-2 text-xl emoji-trigger">
            <button 
              type="button" 
              @click="toggleEmojiPicker" 
              class="text-gray-300 hover:text-white"
            >
              😊
            </button>
            <div 
              v-if="showEmojiPicker"
              class="emoji-picker absolute bottom-10 right-0 bg-purple-800 rounded-lg p-2 shadow-lg z-10"
            >
              <div class="grid grid-cols-7 gap-1">
                <button 
                  v-for="emoji in popularEmojis" 
                  :key="emoji"
                  type="button"
                  @click="addEmoji(emoji)"
                  class="w-8 h-8 flex items-center justify-center hover:bg-purple-700 rounded"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <button 
          type="submit"
          class="ml-2 bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-500 transition-colors"
          :class="{'opacity-50 cursor-not-allowed': !newMessage.trim()}"
        >
          <span>→</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useSocket } from '@/services/socket';
import { useChat } from '@/services/chat';

// Debug flag
const DEBUG = true;

const props = defineProps<{
  partnerId: string | null;
  isConnected: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { socket } = useSocket();
const chat = useChat();

// Chat state
const messages = computed(() => {
  if (!props.partnerId) return [];
  const msgs = chat.getMessages(props.partnerId);
  if (DEBUG) console.log(`[ChatInterface] Retrieved ${msgs.length} messages for partner ${props.partnerId}`);
  return msgs;
});

const newMessage = ref('');
const isPartnerTyping = ref(false);
const typingTimeout = ref<number | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const messageInput = ref<HTMLInputElement | null>(null);

// Emoji picker
const showEmojiPicker = ref(false);
const popularEmojis = ['😊', '😂', '❤️', '👍', '🙏', '😍', '🔥', '✨', '🎉', '👋', '🤔', '😭', '🥺', '😎', '🤩', '🙄', '😔', '😢', '🌟'];

// Scroll to bottom on new messages
watch(() => messages.value.length, (newLength) => {
  if (DEBUG) console.log(`[ChatInterface] Messages length changed to ${newLength}, scrolling to bottom`);
  scrollToBottom();
});

// Set current partner in chat service when partner changes
watch(() => props.partnerId, (newPartnerId) => {
  if (DEBUG) console.log(`[ChatInterface] Partner changed to: ${newPartnerId}`);
  
  if (newPartnerId) {
    chat.setCurrentPartner(newPartnerId);
    
    // Mark messages as read when viewing chat
    chat.markAsRead(newPartnerId);
    
    if (DEBUG) {
      const msgs = chat.getMessages(newPartnerId);
      console.log(`[ChatInterface] Loaded ${msgs.length} messages for new partner ${newPartnerId}`);
    }
  }
  
  nextTick(() => {
    if (messageInput.value) {
      messageInput.value.focus();
    }
    scrollToBottom();
  });
});

// Watch for connection status changes
watch(() => props.isConnected, (isConnected) => {
  if (DEBUG) console.log(`[ChatInterface] Connection status changed: ${isConnected}`);
  
  if (isConnected) {
    // Request any pending messages when connection is restored
    socket.value?.emit('get-pending-messages');
  }
});

onMounted(() => {
  if (DEBUG) console.log('[ChatInterface] Component mounted');
  
  // Set up typing indicator event listener
  setupTypingEventListener();
  
  // Set current partner in chat service
  if (props.partnerId) {
    chat.setCurrentPartner(props.partnerId);
    
    // Mark messages as read when viewing chat
    chat.markAsRead(props.partnerId);
    
    if (DEBUG) {
      const msgs = chat.getMessages(props.partnerId);
      console.log(`[ChatInterface] On mount: loaded ${msgs.length} messages for partner ${props.partnerId}`);
    }
  }
  
  // Focus input on mount
  nextTick(() => {
    if (messageInput.value) {
      messageInput.value.focus();
    }
    scrollToBottom();
  });
});

function setupTypingEventListener() {
  // Listen for typing events from the chat controller
  window.addEventListener('chat:typing', ((event: CustomEvent) => {
    const { partnerId, isTyping } = event.detail;
    
    if (partnerId === props.partnerId) {
      isPartnerTyping.value = isTyping;
      
      // Reset typing indicator after 3 seconds of inactivity if isTyping is true
      if (isTyping && typingTimeout.value) {
        clearTimeout(typingTimeout.value);
        
        typingTimeout.value = setTimeout(() => {
          isPartnerTyping.value = false;
        }, 3000);
      }
      
      if (DEBUG) console.log(`[ChatInterface] Partner ${partnerId} typing status: ${isTyping}`);
    }
  }) as EventListener);
}

function sendMessage() {
  if (!newMessage.value.trim()) {
    if (DEBUG) console.log(`[ChatInterface] Cannot send empty message`);
    return;
  }
  
  if (DEBUG) console.log(`[ChatInterface] Sending message to ${props.partnerId}: ${newMessage.value}`);
  
  // Send message using chat service (will work even if disconnected)
  if (props.partnerId) {
    const success = chat.sendMessage(newMessage.value, props.partnerId);
    
    if (success) {
      if (DEBUG) console.log('[ChatInterface] Message sent successfully');
      // Clear input
      newMessage.value = '';
      
      // Scroll to bottom
      scrollToBottom();
    } else {
      if (DEBUG) console.log('[ChatInterface] Failed to send message');
    }
  }
}

function resendMessage(messageId: string) {
  if (!props.partnerId) return;
  
  if (DEBUG) console.log(`[ChatInterface] Attempting to resend message ${messageId}`);
  
  const success = chat.resendMessage(messageId, props.partnerId);
  
  if (success) {
    if (DEBUG) console.log(`[ChatInterface] Message ${messageId} queued for resend`);
  } else {
    if (DEBUG) console.log(`[ChatInterface] Failed to resend message ${messageId}`);
  }
}

function handleTyping() {
  if (props.isConnected && props.partnerId) {
    chat.handleTyping(props.partnerId);
  }
}

function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value;
}

function addEmoji(emoji: string) {
  newMessage.value += emoji;
  showEmojiPicker.value = false;
  
  // Focus back on input after adding emoji
  if (messageInput.value) {
    messageInput.value.focus();
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      if (DEBUG) console.log('[ChatInterface] Scrolled to bottom');
    }
  });
}
</script>

<style scoped>
.messages-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 92, 246, 0.5) rgba(91, 33, 182, 0.1);
}

.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: rgba(91, 33, 182, 0.1);
}

.messages-container::-webkit-scrollbar-thumb {
  background-color: rgba(139, 92, 246, 0.5);
  border-radius: 20px;
}

.emoji-trigger {
  user-select: none;
}

.emoji-picker {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Animation for the pulse effect */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 1.5s infinite;
}
</style> 