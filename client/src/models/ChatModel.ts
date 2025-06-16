import { ref, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

// Types
export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'partner';
  text: string;
  originalText?: string; // Original text before encryption
  timestamp: number;
  status: MessageStatus;
  retryCount: number;
  expiresAt?: number; // Optional expiration timestamp
}

// Secret key for message encryption (in production, this should be managed securely)
const ENCRYPTION_KEY = 'spacetalk-secure-key-2023';

/**
 * ChatModel - Handles data storage, encryption, and persistence for chat messages
 */
export class ChatModel {
  private messages = ref<Record<string, ChatMessage[]>>({});
  private pendingMessages = ref<Record<string, ChatMessage[]>>({});
  private unreadMessages = ref<Record<string, boolean>>({});
  private messageExpiryDays = 30; // Messages expire after 30 days by default
  
  constructor(private storageProvider: any) {
    this.loadAllChats();
    this.setupAutoCleanup();
    
    // Watch for changes and save
    watch(this.messages, () => {
      this.saveAllChats();
    }, { deep: true });
    
    watch(this.pendingMessages, () => {
      this.savePendingMessages();
    }, { deep: true });
  }
  
  /**
   * Create a new message
   */
  createMessage(text: string, partnerId: string, isSelf: boolean): ChatMessage {
    const encryptedText = this.encryptMessage(text);
    
    return {
      id: uuidv4(),
      sender: isSelf ? 'me' : 'partner',
      text: encryptedText,
      originalText: isSelf ? text : undefined, // Store original text only for sent messages
      timestamp: Date.now(),
      status: isSelf ? MessageStatus.SENDING : MessageStatus.DELIVERED,
      retryCount: 0,
      expiresAt: Date.now() + (this.messageExpiryDays * 24 * 60 * 60 * 1000)
    };
  }
  
  /**
   * Add a message to a conversation
   */
  addMessage(message: ChatMessage, partnerId: string): void {
    const conversationKey = this.getConversationKey(partnerId);
    
    if (!this.messages.value[conversationKey]) {
      this.messages.value[conversationKey] = [];
    }
    
    this.messages.value[conversationKey].push(message);
    this.saveAllChats();
  }
  
  /**
   * Update message status
   */
  updateMessageStatus(messageId: string, status: MessageStatus): boolean {
    let updated = false;
    
    // Search for the message in all conversations
    Object.keys(this.messages.value).forEach(conversationKey => {
      const messages = this.messages.value[conversationKey];
      const messageIndex = messages.findIndex(m => m.id === messageId);
      
      if (messageIndex !== -1) {
        // Update message status
        messages[messageIndex].status = status;
        updated = true;
      }
    });
    
    if (updated) {
      this.saveAllChats();
    }
    
    return updated;
  }
  
  /**
   * Add message to pending queue
   */
  addToPendingMessages(message: ChatMessage, partnerId: string): void {
    if (!this.pendingMessages.value[partnerId]) {
      this.pendingMessages.value[partnerId] = [];
    }
    
    this.pendingMessages.value[partnerId].push(message);
    this.savePendingMessages();
  }
  
  /**
   * Remove message from pending queue
   */
  removeFromPendingMessages(messageId: string, partnerId: string): boolean {
    if (!this.pendingMessages.value[partnerId]) {
      return false;
    }
    
    const initialLength = this.pendingMessages.value[partnerId].length;
    this.pendingMessages.value[partnerId] = this.pendingMessages.value[partnerId]
      .filter(m => m.id !== messageId);
    
    if (initialLength !== this.pendingMessages.value[partnerId].length) {
      this.savePendingMessages();
      return true;
    }
    
    return false;
  }
  
  /**
   * Get all pending messages for a partner
   */
  getPendingMessages(partnerId: string): ChatMessage[] {
    return this.pendingMessages.value[partnerId] || [];
  }
  
  /**
   * Get all pending messages
   */
  getAllPendingMessages(): Record<string, ChatMessage[]> {
    return this.pendingMessages.value;
  }
  
  /**
   * Get messages for a specific partner
   */
  getMessages(partnerId: string): ChatMessage[] {
    const conversationKey = this.getConversationKey(partnerId);
    const messages = this.messages.value[conversationKey] || [];
    
    // Decrypt messages for display
    return messages.map(msg => {
      if (msg.sender === 'partner') {
        return {
          ...msg,
          text: this.decryptMessage(msg.text)
        };
      }
      return {
        ...msg,
        text: msg.originalText || this.decryptMessage(msg.text)
      };
    });
  }
  
  /**
   * Mark messages as read for a partner
   */
  markAsRead(partnerId: string): void {
    this.unreadMessages.value[partnerId] = false;
    
    const conversationKey = this.getConversationKey(partnerId);
    const messages = this.messages.value[conversationKey] || [];
    
    let updated = false;
    messages.forEach(message => {
      if (message.sender === 'partner' && message.status === MessageStatus.DELIVERED) {
        message.status = MessageStatus.READ;
        updated = true;
      }
    });
    
    if (updated) {
      this.saveAllChats();
    }
  }
  
  /**
   * Check if there are unread messages from a partner
   */
  hasUnreadMessages(partnerId: string): boolean {
    return !!this.unreadMessages.value[partnerId];
  }
  
  /**
   * Mark partner as having unread messages
   */
  setUnread(partnerId: string, isUnread: boolean): void {
    this.unreadMessages.value[partnerId] = isUnread;
  }
  
  /**
   * Clear chat history for a specific partner
   */
  clearChat(partnerId: string): void {
    const conversationKey = this.getConversationKey(partnerId);
    
    if (this.messages.value[conversationKey]) {
      this.messages.value[conversationKey] = [];
      this.saveAllChats();
    }
    
    if (this.pendingMessages.value[partnerId]) {
      this.pendingMessages.value[partnerId] = [];
      this.savePendingMessages();
    }
  }
  
  /**
   * Clear all chat history
   */
  clearAllChats(): void {
    this.messages.value = {};
    this.unreadMessages.value = {};
    this.pendingMessages.value = {};
    this.saveAllChats();
    this.savePendingMessages();
  }
  
  /**
   * Encrypt a message
   */
  private encryptMessage(text: string): string {
    try {
      return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      return text; // Fallback to plain text if encryption fails
    }
  }
  
  /**
   * Decrypt a message
   */
  private decryptMessage(encryptedText: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return encryptedText; // Return the encrypted text if decryption fails
    }
  }
  
  /**
   * Get a unique key for a conversation
   */
  private getConversationKey(partnerId: string): string {
    // In a real app, we'd use the current user ID here too
    return `chat_${partnerId}`;
  }
  
  /**
   * Save all chats to storage
   */
  private saveAllChats(): void {
    if (!this.storageProvider.isAvailable) {
      return;
    }
    
    try {
      this.storageProvider.setItem('chat_messages', JSON.stringify(this.messages.value));
      this.storageProvider.setItem('chat_unread', JSON.stringify(this.unreadMessages.value));
    } catch (error) {
      console.error('Failed to save chats:', error);
    }
  }
  
  /**
   * Load all saved chats from storage
   */
  private loadAllChats(): void {
    if (!this.storageProvider.isAvailable) {
      return;
    }
    
    try {
      const savedMessages = this.storageProvider.getItem('chat_messages');
      if (savedMessages) {
        this.messages.value = JSON.parse(savedMessages);
      }
      
      const savedUnread = this.storageProvider.getItem('chat_unread');
      if (savedUnread) {
        this.unreadMessages.value = JSON.parse(savedUnread);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  }
  
  /**
   * Save pending messages to storage
   */
  private savePendingMessages(): void {
    if (!this.storageProvider.isAvailable) {
      return;
    }
    
    try {
      this.storageProvider.setItem('chat_pending_messages', JSON.stringify(this.pendingMessages.value));
    } catch (error) {
      console.error('Failed to save pending messages:', error);
    }
  }
  
  /**
   * Load pending messages from storage
   */
  private loadPendingMessages(): void {
    if (!this.storageProvider.isAvailable) {
      return;
    }
    
    try {
      const savedPendingMessages = this.storageProvider.getItem('chat_pending_messages');
      if (savedPendingMessages) {
        this.pendingMessages.value = JSON.parse(savedPendingMessages);
      }
    } catch (error) {
      console.error('Failed to load pending messages:', error);
    }
  }
  
  /**
   * Set up automatic cleanup of old messages
   */
  private setupAutoCleanup(): void {
    // Run cleanup once a day
    setInterval(() => this.cleanupExpiredMessages(), 24 * 60 * 60 * 1000);
    
    // Also run once on initialization
    this.cleanupExpiredMessages();
  }
  
  /**
   * Clean up expired messages
   */
  private cleanupExpiredMessages(): void {
    const now = Date.now();
    let hasChanges = false;
    
    // Check all conversations for expired messages
    Object.keys(this.messages.value).forEach(conversationKey => {
      const initialLength = this.messages.value[conversationKey].length;
      
      this.messages.value[conversationKey] = this.messages.value[conversationKey]
        .filter(message => !message.expiresAt || message.expiresAt > now);
      
      if (initialLength !== this.messages.value[conversationKey].length) {
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      this.saveAllChats();
    }
  }
} 