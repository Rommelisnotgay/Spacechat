"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const uuid_1 = require("uuid");
const signaling_1 = require("./socket/signaling");
const chat_1 = require("./socket/chat");
const games_1 = require("./socket/games");
// Get the allowed origins for CORS
const getAllowedOrigins = () => {
    if (process.env.NODE_ENV === 'production') {
        const origins = [
            'https://spacechat-live.up.railway.app',
            'https://spacechat-live.railway.app',
            'https://spacechat.live',
            'https://www.spacechat.live'
        ];
        if (process.env.CLIENT_URL) {
            origins.push(process.env.CLIENT_URL);
        }
        // Add common vercel deployment URLs
        if (process.env.VERCEL_URL) {
            origins.push(`https://${process.env.VERCEL_URL}`);
        }
        return origins;
    }
    // For development, allow all origins
    return '*';
};
// Initialize Express app
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: getAllowedOrigins(),
        methods: ['GET', 'POST'],
        credentials: true
    }
});
// Middleware
app.use((0, cors_1.default)({
    origin: getAllowedOrigins(),
    credentials: true
}));
app.use(express_1.default.json());
// Define API routes before static file handling
app.get('/api/stats', (req, res) => {
    res.json({
        online: activeUsers.size,
        inQueue: userQueue.length
    });
});
// Serve static files from the client's dist folder in production
if (process.env.NODE_ENV === 'production') {
    const path = require('path');
    app.use(express_1.default.static(path.join(__dirname, '../../client/dist')));
    // API routes that should work in production
    app.get('/api/status', (req, res) => {
        res.send('SpaceChat.live Server is running');
    });
    // Handle SPA routing - must be after API routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
    });
}
else {
    // Routes for development only
    app.get('/', (req, res) => {
        res.send('SpaceChat.live Server is running');
    });
}
const activeUsers = new Map();
let userQueue = [];
// Rate limiting for joining queue
const queueRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_JOINS_PER_WINDOW = 10; // Max 10 joins per minute
// Routes
app.get('/', (req, res) => {
    res.send('SpaceChat.live Server is running');
});
app.get('/api/stats', (req, res) => {
    res.json({
        online: activeUsers.size,
        inQueue: userQueue.length
    });
});
// Socket.io connection handler
io.on('connection', (socket) => {
    // Assign a user ID
    const userId = (0, uuid_1.v4)();
    socket.data.userId = userId;
    console.log(`User connected: ${userId}`);
    // Add to active users
    activeUsers.set(userId, {
        socketId: socket.id,
        nickname: `User_${userId.substring(0, 5)}`
    });
    // Send user ID to client
    socket.emit('user-id', userId);
    // Send online count to all clients
    io.emit('online-count', activeUsers.size);
    // Handle get online count request
    socket.on('get-online-count', () => {
        socket.emit('online-count', activeUsers.size);
    });
    // Setup WebRTC signaling events
    (0, signaling_1.setupSignalingEvents)(io, socket, activeUsers);
    // Setup chat events
    (0, chat_1.setupChatEvents)(io, socket, activeUsers);
    // Setup game events
    (0, games_1.setupGameEvents)(io, socket, activeUsers);
    // Join queue
    socket.on('join-queue', (data) => {
        const userId = socket.data.userId;
        // Check if user is already matched with a partner
        if (socket.data.partnerId) {
            console.log(`User ${userId} already has a partner (${socket.data.partnerId}), ignoring join-queue request`);
            // Notify client that they already have an active partner
            socket.emit('already-matched', { partnerId: socket.data.partnerId });
            return;
        }
        // Apply rate limiting to prevent abuse
        const now = Date.now();
        const userRateLimit = queueRateLimits.get(userId) || { lastJoinTime: 0, joinCount: 0 };
        // Reset counter if window has expired
        if (now - userRateLimit.lastJoinTime > RATE_LIMIT_WINDOW) {
            userRateLimit.joinCount = 0;
            userRateLimit.lastJoinTime = now;
        }
        // Check if user has exceeded rate limit
        if (userRateLimit.joinCount >= MAX_JOINS_PER_WINDOW) {
            console.log(`Rate limit exceeded for user ${userId}`);
            socket.emit('error', { message: 'You are joining the queue too frequently. Please wait a moment.' });
            return;
        }
        // Update rate limit info
        userRateLimit.joinCount++;
        userRateLimit.lastJoinTime = now;
        queueRateLimits.set(userId, userRateLimit);
        // Remove user from queue if already in it
        removeUserFromQueue(userId);
        // Add user info to activeUsers map if not already present
        const userInfo = activeUsers.get(userId) || { socketId: socket.id };
        // Update user info with received data
        if (data.preferences) {
            userInfo.preferences = data.preferences;
        }
        // Update active users map
        activeUsers.set(userId, userInfo);
        // Add to queue
        userQueue.push({
            userId,
            vibe: data.vibe || 'any',
            joinTime: Date.now(),
            preferences: data.preferences
        });
        console.log(`User ${userId} joined queue with vibe: ${data.vibe || 'any'}`);
        // Try to match users
        matchUsers();
    });
    // Disconnect from partner
    socket.on('disconnect-partner', () => {
        const userId = socket.data.userId;
        // Store the partner ID before clearing it
        const partnerId = socket.data.partnerId;
        // Clear own partner connection
        socket.data.partnerId = null;
        if (!partnerId) {
            console.log(`User ${userId} attempted to disconnect from partner, but no partner found`);
            return;
        }
        console.log(`User ${userId} disconnecting from partner ${partnerId}`);
        // Find any partners connected to this user
        const partnerInfo = activeUsers.get(partnerId);
        if (partnerInfo) {
            const partnerSocketId = partnerInfo.socketId;
            const partnerSocket = io.sockets.sockets.get(partnerSocketId);
            if (partnerSocket && partnerSocket.data.partnerId === userId) {
                // Reset partner connection
                partnerSocket.data.partnerId = null;
                // Notify partner
                io.to(partnerSocketId).emit('partner-disconnected');
                console.log(`Notified partner ${partnerId} of disconnection`);
            }
        }
        // Make sure user is not in queue
        removeUserFromQueue(userId);
    });
    // Connect to specific user
    socket.on('connect-to-user', (data) => {
        const userId = socket.data.userId;
        const targetUserInfo = activeUsers.get(data.targetUserId);
        if (targetUserInfo) {
            // Set up the connection
            socket.data.partnerId = data.targetUserId;
            const targetSocket = io.sockets.sockets.get(targetUserInfo.socketId);
            if (targetSocket) {
                targetSocket.data.partnerId = userId;
                // Notify both users
                socket.emit('direct-connection-established', { partnerId: data.targetUserId });
                io.to(targetUserInfo.socketId).emit('direct-connection-established', { partnerId: userId });
                console.log(`Direct connection established between ${userId} and ${data.targetUserId}`);
            }
        }
        else {
            // Target user not found or offline
            socket.emit('direct-connection-failed');
        }
    });
    // Handle typing indicators
    socket.on('typing', (data) => {
        const targetUserInfo = activeUsers.get(data.to);
        if (targetUserInfo) {
            io.to(targetUserInfo.socketId).emit('typing', { from: socket.data.userId });
        }
    });
    // Handle disconnect
    socket.on('disconnect', () => {
        const userId = socket.data.userId;
        console.log(`User disconnected: ${userId}`);
        // Notify partner if connected
        if (socket.data.partnerId) {
            const partnerInfo = activeUsers.get(socket.data.partnerId);
            if (partnerInfo) {
                io.to(partnerInfo.socketId).emit('partner-disconnected');
            }
        }
        // Remove from active users
        activeUsers.delete(userId);
        // Remove from queue if present
        removeUserFromQueue(userId);
        // Update online count
        io.emit('online-count', activeUsers.size);
    });
    // Add event handler for user identification
    socket.on('user:identify', (data, callback) => {
        const currentUserId = socket.data.userId;
        // If the client is providing a previous user ID, try to restore that identity
        if (data.prevUserId && activeUsers.has(data.prevUserId)) {
            // Update the user ID mapping
            const prevUserInfo = activeUsers.get(data.prevUserId);
            if (prevUserInfo) {
                // Delete the old entry
                activeUsers.delete(data.prevUserId);
                // Create new entry with previous info but updated socket ID
                activeUsers.set(data.prevUserId, {
                    ...prevUserInfo,
                    socketId: socket.id
                });
                // Update socket data
                socket.data.userId = data.prevUserId;
                console.log(`Reconnected user with previous ID: ${data.prevUserId}`);
                // Return the previous user ID
                callback(data.prevUserId);
                // Notify about online count
                io.emit('online-count', activeUsers.size);
                return;
            }
        }
        // If no previous ID or user not found, just return the current ID
        callback(currentUserId);
    });
    // WebRTC signaling events
    socket.on('voice-offer', (data) => {
        const userId = socket.data.userId;
        const targetUserInfo = activeUsers.get(data.to);
        if (targetUserInfo) {
            console.log(`Forwarding voice offer from ${userId} to ${data.to}`);
            io.to(targetUserInfo.socketId).emit('voice-offer', {
                offer: data.offer,
                from: userId
            });
        }
        else {
            console.log(`Cannot forward voice offer: target user ${data.to} not found`);
            socket.emit('error', { message: 'Target user not found for voice offer' });
        }
    });
    socket.on('voice-answer', (data) => {
        const userId = socket.data.userId;
        const targetUserInfo = activeUsers.get(data.to);
        if (targetUserInfo) {
            console.log(`Forwarding voice answer from ${userId} to ${data.to}`);
            io.to(targetUserInfo.socketId).emit('voice-answer', {
                answer: data.answer,
                from: userId
            });
        }
        else {
            console.log(`Cannot forward voice answer: target user ${data.to} not found`);
            socket.emit('error', { message: 'Target user not found for voice answer' });
        }
    });
    socket.on('ice-candidate', (data) => {
        const userId = socket.data.userId;
        const targetUserInfo = activeUsers.get(data.to);
        if (targetUserInfo) {
            console.log(`Forwarding ICE candidate from ${userId} to ${data.to}`);
            io.to(targetUserInfo.socketId).emit('ice-candidate', {
                candidate: data.candidate,
                from: userId
            });
        }
        else {
            console.log(`Cannot forward ICE candidate: target user ${data.to} not found`);
        }
    });
});
// Function to remove user from queue
function removeUserFromQueue(userId) {
    const initialLength = userQueue.length;
    userQueue = userQueue.filter(user => user.userId !== userId);
    if (initialLength !== userQueue.length) {
        console.log(`Removed user ${userId} from queue`);
    }
}
// Function to match users in queue
function matchUsers() {
    if (userQueue.length < 2)
        return;
    console.log(`Attempting to match users. Queue length: ${userQueue.length}`);
    // Sort queue by join time (oldest first)
    userQueue.sort((a, b) => a.joinTime - b.joinTime);
    // Make a copy of the queue to prevent modification issues during iteration
    const queueCopy = [...userQueue];
    let matchFound = false;
    // Try to find compatible matches
    for (let i = 0; i < queueCopy.length; i++) {
        const user1 = queueCopy[i];
        // Skip invalid entries
        if (!user1 || !user1.userId || !activeUsers.has(user1.userId))
            continue;
        for (let j = i + 1; j < queueCopy.length; j++) {
            const user2 = queueCopy[j];
            // Skip invalid entries
            if (!user2 || !user2.userId || !activeUsers.has(user2.userId))
                continue;
            // Prevent matching with self (should never happen, but just in case)
            if (user1.userId === user2.userId)
                continue;
            // Check compatibility based on preferences
            if (areUsersCompatible(user1, user2)) {
                // Match found - remove BOTH users from the queue
                userQueue = userQueue.filter(user => user.userId !== user1.userId && user.userId !== user2.userId);
                matchFound = true;
                const user1Info = activeUsers.get(user1.userId);
                const user2Info = activeUsers.get(user2.userId);
                if (user1Info && user2Info) {
                    // Update partner IDs in socket data
                    const socket1 = io.sockets.sockets.get(user1Info.socketId);
                    const socket2 = io.sockets.sockets.get(user2Info.socketId);
                    if (socket1)
                        socket1.data.partnerId = user2.userId;
                    if (socket2)
                        socket2.data.partnerId = user1.userId;
                    // Get country information from preferences
                    const country1 = user1.preferences?.preferredCountries?.[0] || 'unknown';
                    const country2 = user2.preferences?.preferredCountries?.[0] || 'unknown';
                    // Create flag emojis based on country codes or defaults
                    const getFlag = (country) => {
                        if (country === 'unknown' || country === 'any')
                            return '🌍';
                        // If the country code is 2 letters, convert to regional indicator symbols
                        if (/^[a-z]{2}$/i.test(country)) {
                            return String.fromCodePoint(...country.toLowerCase().split('').map(c => c.charCodeAt(0) + 127397));
                        }
                        return '🌍';
                    };
                    const flag1 = getFlag(country1);
                    const flag2 = getFlag(country2);
                    // Notify both users with 'matched' event (changed from 'partner-matched')
                    io.to(user1Info.socketId).emit('matched', {
                        partnerId: user2.userId,
                        vibe: user2.vibe,
                        country: country2 === 'unknown' ? 'Earth' : country2.toUpperCase(),
                        flag: flag2
                    });
                    io.to(user2Info.socketId).emit('matched', {
                        partnerId: user1.userId,
                        vibe: user1.vibe,
                        country: country1 === 'unknown' ? 'Earth' : country1.toUpperCase(),
                        flag: flag1
                    });
                    console.log(`Matched users: ${user1.userId} and ${user2.userId} with vibe: ${user1.vibe}/${user2.vibe}`);
                    // Stop after first match to avoid modifying the queue while we're iterating
                    break;
                }
            }
        }
        // If we found a match, break the outer loop too
        if (matchFound)
            break;
    }
    // If we made a match and there are still people in the queue, try matching again
    if (matchFound && userQueue.length >= 2) {
        setTimeout(matchUsers, 500); // Small delay to prevent call stack issues
    }
}
// Helper function to check compatibility between users
function areUsersCompatible(user1, user2) {
    // Check vibe compatibility
    const compatibleVibes = user1.vibe === 'any' ||
        user2.vibe === 'any' ||
        user1.vibe === user2.vibe;
    if (!compatibleVibes)
        return false;
    // Check country preferences if specified
    const user1Prefs = user1.preferences || {};
    const user2Prefs = user2.preferences || {};
    // If user1 has blocked user2's country
    if (user1Prefs.blockedCountries?.length &&
        user2Prefs.preferredCountries?.length &&
        user1Prefs.blockedCountries.some((c) => user2Prefs.preferredCountries.includes(c))) {
        return false;
    }
    // If user2 has blocked user1's country
    if (user2Prefs.blockedCountries?.length &&
        user1Prefs.preferredCountries?.length &&
        user2Prefs.blockedCountries.some((c) => user1Prefs.preferredCountries.includes(c))) {
        return false;
    }
    // If both have preferred countries, check for compatibility
    if (user1Prefs.preferredCountries?.length &&
        user2Prefs.preferredCountries?.length) {
        // If they have at least one common country, they're compatible
        const hasCommonCountry = user1Prefs.preferredCountries.some((c) => user2Prefs.preferredCountries.includes(c));
        // Only enforce this if at least one user has specific preferences
        if (!hasCommonCountry) {
            return false;
        }
    }
    // If both users have interests, check for compatibility
    if (user1Prefs.interests?.length &&
        user2Prefs.interests?.length) {
        // Check if they have at least one common interest
        const hasCommonInterest = user1Prefs.interests.some((interest) => {
            // Case insensitive match
            const lowerCaseInterest = interest.toLowerCase();
            return user2Prefs.interests.some((i2) => i2.toLowerCase() === lowerCaseInterest);
        });
        if (!hasCommonInterest) {
            // Only enforce this if both users have specified interests
            if (user1Prefs.interests.length > 0 && user2Prefs.interests.length > 0) {
                return false;
            }
        }
    }
    return true;
}
// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
