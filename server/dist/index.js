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
const geo_location_1 = require("./services/geo-location");
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
// API endpoint to get all available countries
app.get('/api/countries', (req, res) => {
    res.json((0, geo_location_1.getAllCountries)());
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
// User storage
const userLastSeen = new Map(); // Track when users were last active
// Setup periodic checks for inactive users
const USER_TIMEOUT = 70000; // 70 seconds - slightly longer than client ping interval
setInterval(() => {
    const now = Date.now();
    let removedCount = 0;
    // Check for timed out users
    for (const [userId, lastSeen] of userLastSeen.entries()) {
        if (now - lastSeen > USER_TIMEOUT) {
            console.log(`User ${userId} timed out after inactivity`);
            // Get user info
            const userInfo = activeUsers.get(userId);
            if (userInfo) {
                // Notify partner if connected
                const socket = io.sockets.sockets.get(userInfo.socketId);
                if (socket && socket.data.partnerId) {
                    const partnerInfo = activeUsers.get(socket.data.partnerId);
                    if (partnerInfo) {
                        io.to(partnerInfo.socketId).emit('partner-disconnected');
                    }
                }
                // Remove from active users
                activeUsers.delete(userId);
                removedCount++;
                // Remove from queue if present
                removeUserFromQueue(userId);
                // Remove from last seen tracking
                userLastSeen.delete(userId);
            }
        }
    }
    // Update online count if we removed any users
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} inactive users. Active users: ${activeUsers.size}`);
        io.emit('online-count', activeUsers.size);
    }
}, 30000); // Check every 30 seconds
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
    // Check if the client sent a userId in the query parameters
    const queryUserId = socket.handshake.query.userId;
    let isReconnection = false;
    // Assign a user ID - either from query or generate new one
    let userId;
    // If we have a userId in query and it exists in our active users
    if (queryUserId && activeUsers.has(queryUserId)) {
        userId = queryUserId;
        isReconnection = true;
        console.log(`User reconnected with ID from query: ${userId}`);
        // Update the socket ID for this user
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            userInfo.socketId = socket.id;
            activeUsers.set(userId, userInfo);
        }
    }
    else {
        // Generate new UUID for this user
        userId = (0, uuid_1.v4)();
        console.log(`New user connected: ${userId}`);
    }
    // Add user ID to socket data
    socket.data.userId = userId;
    // Update last seen time
    userLastSeen.set(userId, Date.now());
    // Only perform location detection for new users
    if (!isReconnection) {
        // Get user's IP address
        const ipAddress = socket.handshake.headers['x-forwarded-for'] ||
            socket.handshake.address ||
            'unknown';
        // Detect user's country based on IP
        (0, geo_location_1.getLocationFromIp)(String(ipAddress))
            .then(locationData => {
            // Add to active users with location data
            activeUsers.set(userId, {
                socketId: socket.id,
                nickname: `User_${userId.substring(0, 5)}`,
                location: locationData || undefined
            });
            // Send location data to the client
            if (locationData) {
                socket.emit('user-location', locationData);
                console.log(`User ${userId} location detected: ${locationData.country} (${locationData.countryCode}) with flag: ${locationData.flag}`);
            }
            else {
                console.log(`Unable to detect location for user ${userId}`);
                // Send a fallback location for local development
                socket.emit('user-location', {
                    country: 'Earth',
                    countryCode: 'earth',
                    flag: '🌍'
                });
            }
        })
            .catch(error => {
            console.error(`Failed to get location for user ${userId}:`, error);
            // Add to active users without location data
            activeUsers.set(userId, {
                socketId: socket.id,
                nickname: `User_${userId.substring(0, 5)}`
            });
            // Send a fallback location
            socket.emit('user-location', {
                country: 'Earth',
                countryCode: 'earth',
                flag: '🌍'
            });
        })
            .finally(() => {
            // Send user ID to client
            socket.emit('user-id', userId);
            // Send online count to all clients
            io.emit('online-count', activeUsers.size);
        });
    }
    else {
        // For reconnection, just send the ID and online count
        socket.emit('user-id', userId);
        io.emit('online-count', activeUsers.size);
    }
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
        // Merge location data with preferences if available
        if (userInfo.location && (!data.preferences || !data.preferences.preferredCountries || data.preferences.preferredCountries.length === 0)) {
            if (!data.preferences) {
                data.preferences = {};
            }
            data.preferences.userCountry = userInfo.location.countryCode;
        }
        // Update user preferences in active users map
        userInfo.vibe = data.vibe || 'any';
        userInfo.preferences = data.preferences;
        activeUsers.set(userId, userInfo);
        // Add the user to the queue
        userQueue.push({
            userId: userId,
            vibe: data.vibe || 'any',
            joinTime: Date.now(),
            preferences: data.preferences
        });
        // Try to match users after a short delay
        setTimeout(matchUsers, 500);
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
            if (partnerSocket) {
                // Reset partner connection
                partnerSocket.data.partnerId = null;
                // Notify partner with more details for better debugging
                console.log(`Notifying partner ${partnerId} about disconnection from ${userId}`);
                io.to(partnerSocketId).emit('partner-disconnected', {
                    reason: 'user-initiated',
                    userId: userId
                });
            }
            else {
                console.log(`Partner socket not found for ID ${partnerId}`);
            }
        }
        else {
            console.log(`Partner info not found for ID ${partnerId}`);
        }
        // Make sure user is not in queue
        removeUserFromQueue(userId);
        // Confirm to user that partner connection has ended
        socket.emit('disconnect-confirmed');
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
            const partnerId = socket.data.partnerId;
            const partnerInfo = activeUsers.get(partnerId);
            if (partnerInfo) {
                console.log(`Notifying partner ${partnerId} about disconnection from ${userId}`);
                // Emit a more descriptive event with reason
                io.to(partnerInfo.socketId).emit('partner-disconnected', {
                    reason: 'connection-lost',
                    userId: userId
                });
                // Also reset the partner's connection
                const partnerSocket = io.sockets.sockets.get(partnerInfo.socketId);
                if (partnerSocket) {
                    partnerSocket.data.partnerId = null;
                }
            }
        }
        // Keep the user in the activeUsers map for a short period
        // to handle page refresh events more gracefully
        // Instead of deleting immediately, we'll let the cleanup task handle it
        // Remove from queue if present
        removeUserFromQueue(userId);
        // Mark the user as potentially inactive but don't remove yet
        // The cleanup task will handle removal after timeout
    });
    // Handle ping to keep connection alive
    socket.on('ping', () => {
        const userId = socket.data.userId;
        if (userId) {
            // Update last seen time
            userLastSeen.set(userId, Date.now());
            socket.emit('pong');
        }
    });
    // Handle startMatching event for updating filters and restarting matching
    socket.on('startMatching', (data) => {
        const userId = socket.data.userId;
        console.log(`User ${userId} updating filters and restarting matching`);
        console.log('New filters:', JSON.stringify(data));
        // Remove user from queue if already in it
        removeUserFromQueue(userId);
        // Get current user info
        const userInfo = activeUsers.get(userId);
        if (!userInfo) {
            console.log(`User ${userId} not found in active users`);
            return;
        }
        // Update user preferences in active users map
        if (!userInfo.preferences) {
            userInfo.preferences = {};
        }
        // Update country preferences
        if (data.preferredCountries !== undefined) {
            userInfo.preferences.preferredCountries = data.preferredCountries;
        }
        if (data.blockedCountries !== undefined) {
            userInfo.preferences.blockedCountries = data.blockedCountries;
            console.log(`Updated blocked countries for user ${userId}:`, data.blockedCountries);
        }
        // Save updated user info
        activeUsers.set(userId, userInfo);
        // Add the user back to the queue with updated preferences
        userQueue.push({
            userId: userId,
            vibe: userInfo.vibe || 'any',
            joinTime: Date.now(),
            preferences: userInfo.preferences
        });
        // Try to match users after a short delay
        setTimeout(matchUsers, 500);
        // Send confirmation to the client
        socket.emit('filters-updated', { success: true });
    });
    // Add event handler for user identification
    socket.on('user:identify', (data, callback) => {
        const currentUserId = socket.data.userId;
        // Update last seen time
        userLastSeen.set(currentUserId, Date.now());
        // If the client is providing a previous user ID and it's different from current
        if (data.prevUserId && data.prevUserId !== currentUserId && activeUsers.has(data.prevUserId)) {
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
                // Update last seen for this user ID
                userLastSeen.set(data.prevUserId, Date.now());
                console.log(`Reconnected user with previous ID: ${data.prevUserId}`);
                // Return the previous user ID
                callback(data.prevUserId);
                // Notify about online count
                io.emit('online-count', activeUsers.size);
                return;
            }
        }
        // If we're already using the previous ID, just confirm it
        if (data.prevUserId && data.prevUserId === currentUserId) {
            console.log(`User already using the correct ID: ${currentUserId}`);
        }
        // Return the current ID
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
    // Handle WebRTC connection state changes
    socket.on('webrtc-connection-state', (data) => {
        const userId = socket.data.userId;
        const targetUserInfo = activeUsers.get(data.to);
        console.log(`WebRTC connection state changed for ${userId}: ${data.state} (reason: ${data.reason})`);
        // If the connection has failed or closed, notify the other user
        if (data.state === 'failed' || data.state === 'closed' || data.state === 'disconnected') {
            if (targetUserInfo) {
                console.log(`Notifying user ${data.to} about WebRTC connection state change: ${data.state}`);
                io.to(targetUserInfo.socketId).emit('webrtc-connection-state', {
                    state: data.state,
                    from: userId,
                    reason: data.reason
                });
                // For failed or closed states, also send the partner-disconnected event
                // This ensures the UI is updated correctly
                if (data.state === 'failed' || data.state === 'closed') {
                    console.log(`Sending partner-disconnected event to ${data.to} due to WebRTC state: ${data.state}`);
                    io.to(targetUserInfo.socketId).emit('partner-disconnected', {
                        reason: 'connection-failed',
                        userId: userId
                    });
                    // Also update the connection state on the server
                    const sourceSocket = io.sockets.sockets.get(socket.id);
                    const targetSocket = io.sockets.sockets.get(targetUserInfo.socketId);
                    if (sourceSocket) {
                        sourceSocket.data.partnerId = null;
                    }
                    if (targetSocket && targetSocket.data.partnerId === userId) {
                        targetSocket.data.partnerId = null;
                    }
                }
            }
            else {
                console.log(`Cannot notify about WebRTC state: target user ${data.to} not found`);
            }
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
                    // Get country information - preferably from location data
                    const user1Country = user1Info.location?.countryCode ||
                        user1.preferences?.userCountry ||
                        user1.preferences?.preferredCountries?.[0] ||
                        'unknown';
                    const user2Country = user2Info.location?.countryCode ||
                        user2.preferences?.userCountry ||
                        user2.preferences?.preferredCountries?.[0] ||
                        'unknown';
                    // Use detected flags or get flag from country code
                    const flag1 = user1Info.location?.flag || getFlag(user1Country);
                    const flag2 = user2Info.location?.flag || getFlag(user2Country);
                    // Get country names
                    const country1Name = user1Info.location?.country || getCountryName(user1Country);
                    const country2Name = user2Info.location?.country || getCountryName(user2Country);
                    // Notify both users with 'matched' event
                    io.to(user1Info.socketId).emit('matched', {
                        partnerId: user2.userId,
                        vibe: user2.vibe,
                        country: user2Country === 'unknown' ? 'Earth' : country2Name,
                        countryCode: user2Country,
                        flag: flag2
                    });
                    io.to(user2Info.socketId).emit('matched', {
                        partnerId: user1.userId,
                        vibe: user1.vibe,
                        country: user1Country === 'unknown' ? 'Earth' : country1Name,
                        countryCode: user1Country,
                        flag: flag1
                    });
                    console.log(`Matched users: ${user1.userId} (${country1Name}, ${flag1}) and ${user2.userId} (${country2Name}, ${flag2}) with vibe: ${user1.vibe}/${user2.vibe}`);
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
// Get flag emoji from country code
function getFlag(country) {
    if (country === 'unknown' || country === 'any')
        return '🌍';
    // If the country code is 2 letters, convert to regional indicator symbols
    if (/^[a-z]{2}$/i.test(country)) {
        return String.fromCodePoint(...country.toLowerCase().split('').map(c => c.charCodeAt(0) + 127397));
    }
    return '🌍';
}
// Get country name from country code
function getCountryName(countryCode) {
    const countries = (0, geo_location_1.getAllCountries)();
    const country = countries.find(c => c.value === countryCode.toLowerCase());
    return country ? country.name : 'Unknown';
}
// Helper function to check compatibility between users
function areUsersCompatible(user1, user2) {
    // تجاهل مطابقة الفايب تماماً - اعتبر أي فايبس متوافقة
    // const compatibleVibes = 
    //   user1.vibe === 'any' || 
    //   user2.vibe === 'any' || 
    //   user1.vibe === user2.vibe;
    // if (!compatibleVibes) return false;
    // Check country preferences if specified
    const user1Prefs = user1.preferences || {};
    const user2Prefs = user2.preferences || {};
    // Get user countries (if available)
    const user1Country = user1Prefs.userCountry || 'unknown';
    const user2Country = user2Prefs.userCountry || 'unknown';
    // If user1 has blocked user2's country
    if (user2Country !== 'unknown' &&
        user1Prefs.blockedCountries?.length &&
        user1Prefs.blockedCountries.includes(user2Country)) {
        console.log(`Compatibility check failed: User ${user1.userId} has blocked country ${user2Country} of user ${user2.userId}`);
        console.log(`User ${user1.userId} blocked countries:`, user1Prefs.blockedCountries);
        return false;
    }
    // If user2 has blocked user1's country
    if (user1Country !== 'unknown' &&
        user2Prefs.blockedCountries?.length &&
        user2Prefs.blockedCountries.includes(user1Country)) {
        console.log(`Compatibility check failed: User ${user2.userId} has blocked country ${user1Country} of user ${user1.userId}`);
        console.log(`User ${user2.userId} blocked countries:`, user2Prefs.blockedCountries);
        return false;
    }
    // If both users have preferred countries, check if user2's country is in user1's preferred list
    if (user1Prefs.preferredCountries?.length &&
        user2Country !== 'unknown' &&
        !user1Prefs.preferredCountries.includes(user2Country)) {
        // Only enforce if user has specific preferences
        if (user1Prefs.preferredCountries.length > 0) {
            console.log(`Compatibility check failed: User ${user1.userId} prefers specific countries (${user1Prefs.preferredCountries.join(', ')}) but user ${user2.userId} is from ${user2Country}`);
            return false;
        }
    }
    // If both users have preferred countries, check if user1's country is in user2's preferred list
    if (user2Prefs.preferredCountries?.length &&
        user1Country !== 'unknown' &&
        !user2Prefs.preferredCountries.includes(user1Country)) {
        // Only enforce if user has specific preferences
        if (user2Prefs.preferredCountries.length > 0) {
            console.log(`Compatibility check failed: User ${user2.userId} prefers specific countries (${user2Prefs.preferredCountries.join(', ')}) but user ${user1.userId} is from ${user1Country}`);
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
                console.log(`Compatibility check failed: Users ${user1.userId} and ${user2.userId} have no common interests`);
                return false;
            }
        }
    }
    // All checks passed, users are compatible
    console.log(`Users ${user1.userId} and ${user2.userId} are compatible - match approved`);
    if (user1Prefs.blockedCountries?.length || user2Prefs.blockedCountries?.length) {
        console.log(`User countries: ${user1.userId} from ${user1Country}, ${user2.userId} from ${user2Country}`);
        if (user1Prefs.blockedCountries?.length) {
            console.log(`User ${user1.userId} blocked countries:`, user1Prefs.blockedCountries);
        }
        if (user2Prefs.blockedCountries?.length) {
            console.log(`User ${user2.userId} blocked countries:`, user2Prefs.blockedCountries);
        }
    }
    return true;
}
// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
