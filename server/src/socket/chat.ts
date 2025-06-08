import { Server, Socket } from 'socket.io';

interface ChatMessage {
  message?: string;
  to: string;
}

type UserInfo = {
  socketId: string;
  vibe?: string;
  preferences?: Record<string, any>;
  nickname?: string;
};

export const setupChatEvents = (
  io: Server, 
  socket: Socket, 
  activeUsers: Map<string, UserInfo>
) => {
  const userId = socket.data.userId;
  
  // Handle chat messages
  socket.on('chat-message', (data: ChatMessage) => {
    if (!data || !data.to) {
      console.log(`Invalid chat message data from ${userId}`);
      return;
    }
    
    const targetUserInfo = activeUsers.get(data.to);
    
    if (!targetUserInfo) {
      console.log(`Target user ${data.to} not found for chat message`);
      return;
    }
    
    const messageText = data.message || '';
    
    // Forward the message to the target user
    io.to(targetUserInfo.socketId).emit('chat-message', {
      message: messageText,
      from: userId,
      timestamp: Date.now()
    });
    
    console.log(`Chat message from ${userId} to ${data.to}: ${
      messageText ? messageText.substring(0, 20) + (messageText.length > 20 ? '...' : '') : '[empty]'
    }`);
  });
  
  // Handle typing indicator
  socket.on('typing', (data: { to: string }) => {
    if (!data || !data.to) return;
    
    const targetUserInfo = activeUsers.get(data.to);
    
    if (!targetUserInfo) return;
    
    io.to(targetUserInfo.socketId).emit('typing', {
      from: userId
    });
  });
};
