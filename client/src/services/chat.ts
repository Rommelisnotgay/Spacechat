import { ref, watch, shallowRef } from 'vue';
import { useSocket } from './socket';
import { useLocalStorage } from './storage';
import { v4 as uuidv4 } from 'uuid';
import { ChatModel } from '../models/ChatModel';
import { ChatController } from '../models/ChatController';

// Types
export interface ChatMessage {
  id: string;           // معرف فريد للرسالة
  sender: 'me' | 'partner';
  text: string;
  timestamp: number;
  status: MessageStatus; // حالة الرسالة
  retryCount: number;    // عدد محاولات إعادة الإرسال
}

// حالات الرسالة
export enum MessageStatus {
  SENDING = 'sending',     // جاري الإرسال
  SENT = 'sent',           // تم الإرسال (وصلت للخادم)
  DELIVERED = 'delivered', // تم التسليم (وصلت للمستلم)
  READ = 'read',           // تم القراءة
  FAILED = 'failed'        // فشل الإرسال
}

// Global state for chat
const allMessages = ref<Record<string, ChatMessage[]>>({});
const currentPartnerId = ref<string | null>(null);
const unreadMessages = ref<Record<string, boolean>>({});
const isListening = ref(false);
const pendingMessages = ref<Record<string, ChatMessage[]>>({}); // رسائل قيد الانتظار

// Debug flag
const DEBUG = true;

// Create singleton instances
let chatModel: ChatModel | null = null;
let chatController: ChatController | null = null;
let isInitialized = false;

/**
 * Centralized chat service to handle messaging across components
 */
export function useChat() {
  const storage = useLocalStorage();
  const { socket, userId, isConnected } = useSocket();
  
  // Initialize the service if not already done
  if (!isInitialized) {
    console.log('[ChatService] Initializing chat service with MVC architecture');
    
    // Create model and controller
    chatModel = new ChatModel(storage);
    chatController = new ChatController(chatModel);
    
    // Watch for connection state changes
    isInitialized = true;
  }
  
  /**
   * Set the current partner ID
   */
  function setCurrentPartner(partnerId: string | null) {
    currentPartnerId.value = partnerId;
    
    if (chatController) {
      chatController.setCurrentPartner(partnerId);
    }
  }
  
  /**
   * Send a message to the current partner
   */
  function sendMessage(text: string, toPartnerId: string | null = null) {
    // Use specified partner or current partner
    const partnerId = toPartnerId || currentPartnerId.value;
    
    if (!partnerId || !text.trim() || !chatController) {
      return false;
    }
    
    return chatController.sendMessage(text, partnerId);
  }
  
  /**
   * Resend a failed message
   */
  function resendMessage(messageId: string, partnerId: string) {
    if (!chatController) return false;
    return chatController.resendMessage(messageId, partnerId);
  }
  
  /**
   * Get messages for a specific partner
   */
  function getMessages(partnerId: string | null) {
    if (!partnerId || !chatController) return [];
    return chatController.getMessages(partnerId);
  }
  
  /**
   * Check if there are unread messages from a partner
   */
  function hasUnreadMessages(partnerId: string | null) {
    if (!partnerId || !chatController) return false;
    return chatController.hasUnreadMessages(partnerId);
  }
  
  /**
   * Mark messages as read for a partner
   */
  function markAsRead(partnerId: string | null) {
    if (!partnerId || !chatController) return;
    chatController.markAsRead(partnerId);
  }
  
  /**
   * Handle typing event
   */
  function handleTyping(partnerId: string | null) {
    if (!partnerId || !chatController) return;
    chatController.sendTypingIndicator(partnerId);
  }
  
  /**
   * Clear chat history for a specific partner
   */
  function clearChat(partnerId: string) {
    if (!chatController) return;
    chatController.clearChat(partnerId);
  }
  
  /**
   * Clear all chat history
   */
  function clearAllChats() {
    if (!chatController) return;
    chatController.clearAllChats();
  }
  
  // Return the public API
  return {
    currentPartnerId,
    setCurrentPartner,
    sendMessage,
    resendMessage,
    getMessages,
    hasUnreadMessages,
    markAsRead,
    handleTyping,
    clearChat,
    clearAllChats
  };
} 