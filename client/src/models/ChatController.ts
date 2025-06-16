import { ChatModel, type ChatMessage, MessageStatus } from './ChatModel';
import { useSocket } from '../services/socket';

/**
 * ChatController - Manages chat operations and business logic
 */
export class ChatController {
  private currentPartnerId: string | null = null;
  private isListening = false;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBUG = true;
  
  constructor(private model: ChatModel) {
    this.setupSocketListeners();
    this.scheduleRetryCheck();
  }
  
  /**
   * Set up socket listeners for chat events
   */
  private setupSocketListeners(): void {
    const { socket } = useSocket();
    
    if (!socket.value) {
      if (this.DEBUG) console.log('[ChatController] No socket available, cannot set up listeners');
      return;
    }
    
    if (this.isListening) {
      // Remove existing listeners to prevent duplicates
      socket.value.off('chat-message');
      socket.value.off('message-received');
      socket.value.off('message-read');
      socket.value.off('typing');
      socket.value.off('check-pending-messages');
      this.isListening = false;
    }
    
    // Listen for server request to check pending messages
    socket.value.on('check-pending-messages', () => {
      if (this.DEBUG) console.log('[ChatController] Server requested to check pending messages');
      socket.value?.emit('get-pending-messages');
    });
    
    // Listen for incoming messages
    socket.value.on('chat-message', (data: { id: string; text: string; from: string; timestamp: number }) => {
      if (this.DEBUG) {
        console.log('[ChatController] Received chat message:', data);
        console.log('[ChatController] Current partner ID:', this.currentPartnerId);
      }
      
      // Create and add the message
      const message = this.model.createMessage(data.text, data.from, false);
      message.id = data.id; // Use the server-provided ID
      message.timestamp = data.timestamp;
      this.model.addMessage(message, data.from);
      
      // Mark as unread if it's not the current conversation
      if (data.from !== this.currentPartnerId) {
        if (this.DEBUG) console.log(`[ChatController] Message from ${data.from} marked as unread (not current partner)`);
        this.model.setUnread(data.from, true);
      } else {
        // If it's the current conversation, mark as read and send read receipt
        if (this.DEBUG) console.log(`[ChatController] Message from current partner ${data.from}, marking as read`);
        this.sendReadReceipt(data.id, data.from);
      }
      
      // Send delivery receipt
      this.sendDeliveryReceipt(data.id, data.from);
    });
    
    // Listen for message delivery receipts
    socket.value.on('message-received', (data: { id: string; from: string }) => {
      if (this.DEBUG) console.log('[ChatController] Message delivery receipt:', data);
      this.model.updateMessageStatus(data.id, MessageStatus.DELIVERED);
    });
    
    // Listen for message read receipts
    socket.value.on('message-read', (data: { id: string; from: string }) => {
      if (this.DEBUG) console.log('[ChatController] Message read receipt:', data);
      this.model.updateMessageStatus(data.id, MessageStatus.READ);
    });
    
    // Listen for typing indicators
    socket.value.on('typing', (data: { from: string; isTyping: boolean }) => {
      if (this.DEBUG) console.log('[ChatController] Typing indicator:', data);
      
      // Emit typing event for UI to handle
      window.dispatchEvent(new CustomEvent('chat:typing', { 
        detail: { partnerId: data.from, isTyping: data.isTyping }
      }));
    });
    
    this.isListening = true;
    if (this.DEBUG) console.log('[ChatController] Chat listeners setup complete');
  }
  
  /**
   * Set the current partner ID
   */
  setCurrentPartner(partnerId: string | null): void {
    this.currentPartnerId = partnerId;
    
    if (partnerId) {
      // Mark messages as read when viewing chat
      this.model.markAsRead(partnerId);
    }
  }
  
  /**
   * Send a message to a partner
   */
  sendMessage(text: string, partnerId: string): boolean {
    if (!text.trim() || !partnerId) {
      return false;
    }
    
    // Create and add the message
    const message = this.model.createMessage(text, partnerId, true);
    this.model.addMessage(message, partnerId);
    
    // Try to send the message
    const { socket, isConnected } = useSocket();
    
    if (socket.value && isConnected.value) {
      this.sendMessageToServer(message, partnerId);
    } else {
      // If not connected, add to pending messages
      message.status = MessageStatus.FAILED;
      this.model.addToPendingMessages(message, partnerId);
    }
    
    return true;
  }
  
  /**
   * Send a message to the server
   */
  private sendMessageToServer(message: ChatMessage, partnerId: string): void {
    const { socket } = useSocket();
    
    if (!socket.value) {
      message.status = MessageStatus.FAILED;
      this.model.addToPendingMessages(message, partnerId);
      return;
    }
    
    // Update message status to sending
    this.model.updateMessageStatus(message.id, MessageStatus.SENDING);
    
    // Debug log to trace the message
    if (this.DEBUG) console.log(`[ChatController] Sending message to server: ID=${message.id}, to=${partnerId}, text=${message.originalText || message.text}`);
    
    // Send message to partner - use 'text' field for compatibility with server
    socket.value.emit('chat-message', {
      id: message.id,
      text: message.originalText || message.text, // Use original text if available
      to: partnerId,
      timestamp: message.timestamp
    }, (ack: { success: boolean, error?: string }) => {
      // Handle acknowledgment from server
      if (ack && ack.success) {
        if (this.DEBUG) console.log(`[ChatController] Server acknowledged message ${message.id}`);
        this.model.updateMessageStatus(message.id, MessageStatus.SENT);
      } else {
        if (this.DEBUG) console.log(`[ChatController] Server rejected message ${message.id}: ${ack?.error || 'Unknown error'}`);
        this.model.updateMessageStatus(message.id, MessageStatus.FAILED);
        this.model.addToPendingMessages(message, partnerId);
      }
    });
  }
  
  /**
   * Resend a failed message
   */
  resendMessage(messageId: string, partnerId: string): boolean {
    // Get pending messages for this partner
    const pendingMessages = this.model.getPendingMessages(partnerId);
    const message = pendingMessages.find(m => m.id === messageId);
    
    if (!message) {
      if (this.DEBUG) console.log(`[ChatController] Message ${messageId} not found in pending messages`);
      
      // Try to find it in regular messages
      const allMessages = this.model.getMessages(partnerId);
      const regularMessage = allMessages.find(m => m.id === messageId && m.status === MessageStatus.FAILED);
      
      if (!regularMessage) {
        if (this.DEBUG) console.log(`[ChatController] Message ${messageId} not found in regular messages either`);
        return false;
      }
      
      // Found in regular messages, update and resend
      if (regularMessage.retryCount >= 3) {
        if (this.DEBUG) console.log(`[ChatController] Message ${messageId} has reached maximum retry attempts`);
        return false;
      }
      
      // Increment retry count
      regularMessage.retryCount++;
      
      // Try to send again
      this.sendMessageToServer(regularMessage, partnerId);
      return true;
    }
    
    // Check retry count
    if (message.retryCount >= 3) {
      if (this.DEBUG) console.log(`[ChatController] Message ${messageId} has reached maximum retry attempts`);
      return false;
    }
    
    // Increment retry count
    message.retryCount++;
    
    // Remove from pending messages
    this.model.removeFromPendingMessages(messageId, partnerId);
    
    // Try to send again
    this.sendMessageToServer(message, partnerId);
    
    return true;
  }
  
  /**
   * Retry sending all pending messages
   */
  retryPendingMessages(): void {
    const { isConnected } = useSocket();
    
    if (!isConnected.value) {
      if (this.DEBUG) console.log(`[ChatController] Not connected, skipping retry of pending messages`);
      return;
    }
    
    const pendingMessages = this.model.getAllPendingMessages();
    
    // Iterate through all partners with pending messages
    Object.keys(pendingMessages).forEach(partnerId => {
      const messages = [...pendingMessages[partnerId]]; // Create a copy to avoid modification during iteration
      
      if (this.DEBUG) console.log(`[ChatController] Retrying ${messages.length} pending messages for partner ${partnerId}`);
      
      messages.forEach(message => {
        if (message.retryCount < 3) {
          // Remove from pending and try to send again
          this.model.removeFromPendingMessages(message.id, partnerId);
          this.sendMessageToServer(message, partnerId);
        }
      });
    });
  }
  
  /**
   * Schedule periodic check for retrying pending messages
   */
  private scheduleRetryCheck(): void {
    // Check every 30 seconds
    this.retryTimeout = setInterval(() => {
      if (this.DEBUG) console.log(`[ChatController] Running scheduled retry check for pending messages`);
      this.retryPendingMessages();
    }, 30000);
  }
  
  /**
   * Send delivery receipt
   */
  private sendDeliveryReceipt(messageId: string, partnerId: string): void {
    const { socket, isConnected } = useSocket();
    
    if (!socket.value || !isConnected.value) {
      if (this.DEBUG) console.log(`[ChatController] Cannot send delivery receipt: not connected`);
      return;
    }
    
    if (this.DEBUG) console.log(`[ChatController] Sending delivery receipt for message ${messageId} to ${partnerId}`);
    
    socket.value.emit('message-received', {
      id: messageId,
      to: partnerId
    });
  }
  
  /**
   * Send read receipt
   */
  private sendReadReceipt(messageId: string, partnerId: string): void {
    const { socket, isConnected } = useSocket();
    
    if (!socket.value || !isConnected.value) {
      if (this.DEBUG) console.log(`[ChatController] Cannot send read receipt: not connected`);
      return;
    }
    
    if (this.DEBUG) console.log(`[ChatController] Sending read receipt for message ${messageId} to ${partnerId}`);
    
    socket.value.emit('message-read', {
      id: messageId,
      to: partnerId
    });
  }
  
  /**
   * Send typing indicator
   */
  sendTypingIndicator(partnerId: string): void {
    const { socket, isConnected } = useSocket();
    
    if (!socket.value || !isConnected.value || !partnerId) {
      return;
    }
    
    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Send typing indicator
    socket.value.emit('typing', {
      to: partnerId,
      isTyping: true
    });
    
    // Set timeout to stop typing indicator after 3 seconds
    this.typingTimeout = setTimeout(() => {
      if (socket.value && isConnected.value) {
        socket.value.emit('typing', {
          to: partnerId,
          isTyping: false
        });
      }
    }, 3000);
  }
  
  /**
   * Get messages for a specific partner
   */
  getMessages(partnerId: string): ChatMessage[] {
    return this.model.getMessages(partnerId);
  }
  
  /**
   * Check if there are unread messages from a partner
   */
  hasUnreadMessages(partnerId: string): boolean {
    return this.model.hasUnreadMessages(partnerId);
  }
  
  /**
   * Mark messages as read for a partner
   */
  markAsRead(partnerId: string): void {
    this.model.markAsRead(partnerId);
  }
  
  /**
   * Clear chat history for a specific partner
   */
  clearChat(partnerId: string): void {
    this.model.clearChat(partnerId);
  }
  
  /**
   * Clear all chat history
   */
  clearAllChats(): void {
    this.model.clearAllChats();
  }
  
  /**
   * Clean up resources when controller is no longer needed
   */
  cleanup(): void {
    const { socket } = useSocket();
    
    if (socket.value) {
      socket.value.off('chat-message');
      socket.value.off('message-received');
      socket.value.off('message-read');
      socket.value.off('typing');
    }
    
    if (this.retryTimeout) {
      clearInterval(this.retryTimeout);
    }
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    this.isListening = false;
  }
} 