import { ref, watch, shallowRef } from 'vue';
import { useSocket } from './socket';
import { useLocalStorage } from './storage';

// Types
export interface ChatMessage {
  sender: 'me' | 'partner';
  text: string;
  timestamp: number;
}

// Global state for chat
const allMessages = ref<Record<string, ChatMessage[]>>({});
const currentPartnerId = ref<string | null>(null);
const unreadMessages = ref<Record<string, boolean>>({});
const isListening = ref(false);

// Debug flag
const DEBUG = true;

// Create a singleton instance to ensure the service is only initialized once
let isInitialized = false;

/**
 * Centralized chat service to handle messaging across components
 */
export function useChat() {
  const { socket, userId } = useSocket();
  const storage = useLocalStorage();

  // Initialize the service if not already done
  if (!isInitialized) {
    if (DEBUG) console.log('[ChatService] Initializing chat service');
    initializeChatService();
    isInitialized = true;
  } else {
    if (DEBUG) console.log('[ChatService] Using existing chat service instance');
  }

  /**
   * Initialize the chat service
   */
  function initializeChatService() {
    // Set up global socket listeners
    setupGlobalSocketListeners();

    // Load all saved chats from localStorage
    loadAllChats();

    // Watch for changes to messages and save them
    watch(allMessages, () => {
      saveAllChats();
    }, { deep: true });

    // When socket changes (after reconnection), ensure we're still listening
    watch(() => socket.value, (newSocket) => {
      if (newSocket && !isListening.value) {
        if (DEBUG) console.log('[ChatService] Socket reconnected, setting up listeners again');
        setupGlobalSocketListeners();
      }
    });
  }

  /**
   * Set up global socket listeners for chat messages
   */
  function setupGlobalSocketListeners() {
    if (!socket.value) {
      if (DEBUG) console.log('[ChatService] No socket available, cannot set up listeners');
      return;
    }
    
    if (isListening.value) {
      // Remove existing listeners to prevent duplicates
      if (DEBUG) console.log('[ChatService] Removing existing chat-message listener');
      socket.value.off('chat-message');
      isListening.value = false;
    }

    if (DEBUG) console.log('[ChatService] Setting up chat-message listener');
    
    // Listen for incoming messages globally
    socket.value.on('chat-message', (data: { text: string; from: string; timestamp: number }) => {
      if (DEBUG) console.log('[ChatService] Received chat message:', data);
      
      // Create conversation key
      const partnerId = data.from;
      const conversationKey = getConversationKey(partnerId);

      if (DEBUG) console.log(`[ChatService] Conversation key: ${conversationKey}, current partner: ${currentPartnerId.value}`);

      // Initialize conversation if it doesn't exist
      if (!allMessages.value[conversationKey]) {
        allMessages.value[conversationKey] = [];
      }

      // Add message to conversation
      allMessages.value[conversationKey].push({
        sender: 'partner',
        text: data.text,
        timestamp: data.timestamp || Date.now()
      });

      // Mark as unread if it's not the current conversation
      if (partnerId !== currentPartnerId.value) {
        unreadMessages.value[partnerId] = true;
        if (DEBUG) console.log(`[ChatService] Marked message from ${partnerId} as unread`);
      }

      // Save to localStorage
      saveAllChats();
      
      if (DEBUG) console.log(`[ChatService] Updated messages:`, allMessages.value[conversationKey]);
    });

    isListening.value = true;
    if (DEBUG) console.log('[ChatService] Chat message listener setup complete');
  }

  /**
   * Set the current partner ID
   */
  function setCurrentPartner(partnerId: string | null) {
    if (DEBUG) console.log(`[ChatService] Setting current partner: ${partnerId}`);
    currentPartnerId.value = partnerId;

    // Clear unread messages for this partner
    if (partnerId) {
      unreadMessages.value[partnerId] = false;
    }
  }

  /**
   * Send a message to the current partner
   */
  function sendMessage(text: string, toPartnerId: string | null = null) {
    // Use specified partner or current partner
    const partnerId = toPartnerId || currentPartnerId.value;
    
    if (!partnerId || !text.trim() || !socket.value) {
      if (DEBUG) console.log(`[ChatService] Cannot send message: partnerId=${partnerId}, text=${text.trim() ? 'present' : 'empty'}, socket=${socket.value ? 'present' : 'not present'}`);
      return false;
    }

    if (DEBUG) console.log(`[ChatService] Sending message to ${partnerId}: ${text}`);

    // Create conversation key
    const conversationKey = getConversationKey(partnerId);

    // Initialize conversation if it doesn't exist
    if (!allMessages.value[conversationKey]) {
      allMessages.value[conversationKey] = [];
    }

    // Add message to our local state
    const timestamp = Date.now();
    allMessages.value[conversationKey].push({
      sender: 'me',
      text: text.trim(),
      timestamp
    });

    // Send message to partner
    socket.value.emit('chat-message', {
      text: text.trim(),
      to: partnerId
    });
    
    if (DEBUG) console.log(`[ChatService] Message sent, current messages:`, allMessages.value[conversationKey]);

    return true;
  }

  /**
   * Get messages for a specific partner
   */
  function getMessages(partnerId: string | null): ChatMessage[] {
    if (!partnerId) return [];

    const conversationKey = getConversationKey(partnerId);
    const messages = allMessages.value[conversationKey] || [];
    
    if (DEBUG) console.log(`[ChatService] Getting messages for ${partnerId}, found ${messages.length} messages`);
    return messages;
  }

  /**
   * Check if there are unread messages from a partner
   */
  function hasUnreadMessages(partnerId: string | null): boolean {
    if (!partnerId) return false;
    const hasUnread = !!unreadMessages.value[partnerId];
    if (DEBUG) console.log(`[ChatService] Checking unread for ${partnerId}: ${hasUnread}`);
    return hasUnread;
  }

  /**
   * Mark messages as read for a partner
   */
  function markAsRead(partnerId: string | null) {
    if (!partnerId) return;
    if (DEBUG) console.log(`[ChatService] Marking messages as read for ${partnerId}`);
    unreadMessages.value[partnerId] = false;
  }

  /**
   * Get a unique key for a conversation
   */
  function getConversationKey(partnerId: string): string {
    if (!userId.value) return partnerId;
    
    // Create a consistent key regardless of who initiated the chat
    const ids = [userId.value, partnerId].sort();
    return `${ids[0]}_${ids[1]}`;
  }

  /**
   * Save all chats to localStorage
   */
  function saveAllChats() {
    if (!storage.isAvailable.value) {
      if (DEBUG) console.log('[ChatService] localStorage not available, cannot save chats');
      return;
    }

    try {
      // Save messages
      storage.setItem('chat_messages', JSON.stringify(allMessages.value));
      
      // Save unread status
      storage.setItem('chat_unread', JSON.stringify(unreadMessages.value));
      
      if (DEBUG) console.log('[ChatService] Saved chats to localStorage');
    } catch (error) {
      console.error('[ChatService] Failed to save chats:', error);
    }
  }

  /**
   * Load all saved chats from localStorage
   */
  function loadAllChats() {
    if (!storage.isAvailable.value) {
      if (DEBUG) console.log('[ChatService] localStorage not available, cannot load chats');
      return;
    }

    try {
      // Load messages
      const savedMessages = storage.getItem('chat_messages');
      if (savedMessages) {
        allMessages.value = JSON.parse(savedMessages);
        if (DEBUG) console.log('[ChatService] Loaded messages from localStorage:', Object.keys(allMessages.value).length, 'conversations');
      }

      // Load unread status
      const savedUnread = storage.getItem('chat_unread');
      if (savedUnread) {
        unreadMessages.value = JSON.parse(savedUnread);
        if (DEBUG) console.log('[ChatService] Loaded unread status from localStorage');
      }
    } catch (error) {
      console.error('[ChatService] Failed to load chats:', error);
    }
  }

  /**
   * Clear chat history for a specific partner
   */
  function clearChat(partnerId: string) {
    if (!partnerId) return;

    const conversationKey = getConversationKey(partnerId);
    if (allMessages.value[conversationKey]) {
      allMessages.value[conversationKey] = [];
      saveAllChats();
      if (DEBUG) console.log(`[ChatService] Cleared chat for ${partnerId}`);
    }
  }

  /**
   * Clear all chat history
   */
  function clearAllChats() {
    allMessages.value = {};
    unreadMessages.value = {};
    saveAllChats();
    if (DEBUG) console.log('[ChatService] Cleared all chats');
  }

  // Return the public API
  return {
    messages: allMessages,  // Removed shallowRef to ensure reactivity
    unreadMessages: unreadMessages,  // Removed shallowRef
    currentPartnerId,
    setCurrentPartner,
    sendMessage,
    getMessages,
    hasUnreadMessages,
    markAsRead,
    clearChat,
    clearAllChats
  };
} 