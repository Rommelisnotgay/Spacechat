"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatEvents = void 0;
const setupChatEvents = (io, socket, activeUsers) => {
    const userId = socket.data.userId;
    // Handle chat messages
    socket.on('chat-message', (data) => {
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
        console.log(`Chat message from ${userId} to ${data.to}: ${messageText ? messageText.substring(0, 20) + (messageText.length > 20 ? '...' : '') : '[empty]'}`);
    });
    // Handle typing indicator
    socket.on('typing', (data) => {
        if (!data || !data.to)
            return;
        const targetUserInfo = activeUsers.get(data.to);
        if (!targetUserInfo)
            return;
        io.to(targetUserInfo.socketId).emit('typing', {
            from: userId
        });
    });
};
exports.setupChatEvents = setupChatEvents;
