"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGameEvents = void 0;
// Game types that are implemented
const IMPLEMENTED_GAMES = ['tic-tac-toe', 'rock-paper-scissors', 'word-galaxy'];
// Active game rooms
const gameRooms = new Map();
const setupGameEvents = (io, socket, activeUsers) => {
    // Join game room
    socket.on('game-join-room', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your partner. They may have disconnected.",
                    from: 'system'
                });
                return;
            }
            // Check if game is implemented
            if (!IMPLEMENTED_GAMES.includes(data.gameType)) {
                socket.emit('game-error', {
                    message: `Game type ${data.gameType} is not implemented yet.`,
                    from: 'system'
                });
                return;
            }
            // Check if this is a new room or joining existing
            if (data.isFirstPlayer) {
                // Creating a new room
                gameRooms.set(data.roomId, {
                    gameType: data.gameType,
                    players: [socket.data.userId],
                    createdAt: Date.now()
                });
                console.log(`Game room created: ${data.roomId} for game ${data.gameType}`);
                // Invite partner to join
                io.to(targetUserInfo.socketId).emit('game-room-invite', {
                    gameType: data.gameType,
                    roomId: data.roomId,
                    from: socket.data.userId
                });
            }
            else {
                // Joining existing room
                const room = gameRooms.get(data.roomId);
                if (!room) {
                    socket.emit('game-error', {
                        message: "The game room you're trying to join doesn't exist.",
                        from: 'system'
                    });
                    return;
                }
                // Add player to room
                if (!room.players.includes(socket.data.userId)) {
                    room.players.push(socket.data.userId);
                }
                // Notify the room creator that partner has joined
                const roomCreator = room.players[0];
                const roomCreatorInfo = activeUsers.get(roomCreator);
                if (roomCreatorInfo) {
                    io.to(roomCreatorInfo.socketId).emit('game-partner-joined', {
                        from: socket.data.userId,
                        gameType: data.gameType
                    });
                    // Also notify this player that they successfully joined
                    socket.emit('game-partner-joined', {
                        from: roomCreator,
                        gameType: data.gameType
                    });
                }
                console.log(`Player ${socket.data.userId} joined game room: ${data.roomId}`);
            }
        }
        catch (error) {
            console.error('Error in game-join-room:', error);
            socket.emit('game-error', {
                message: "Failed to join game room due to a server error.",
                from: 'system'
            });
        }
    });
    // Game invite (direct without room)
    socket.on('game-invite', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your partner. They may have disconnected.",
                    from: 'system'
                });
                return;
            }
            // Forward invitation to partner
            io.to(targetUserInfo.socketId).emit('game-invite', {
                gameType: data.gameType,
                from: socket.data.userId
            });
            console.log(`Game invite: ${socket.data.userId} invited ${data.to} to play ${data.gameType}`);
        }
        catch (error) {
            console.error('Error in game-invite:', error);
            socket.emit('game-error', {
                message: "Failed to send game invitation due to a server error.",
                from: 'system'
            });
        }
    });
    // Game invite accept
    socket.on('game-invite-accept', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your partner. They may have disconnected.",
                    from: 'system'
                });
                return;
            }
            // Forward acceptance to partner
            io.to(targetUserInfo.socketId).emit('game-invite-accept', {
                gameType: data.gameType,
                from: socket.data.userId
            });
            console.log(`Game invite accepted: ${socket.data.userId} accepted ${data.to}'s invite to play ${data.gameType}`);
        }
        catch (error) {
            console.error('Error in game-invite-accept:', error);
            socket.emit('game-error', {
                message: "Failed to accept game invitation due to a server error.",
                from: 'system'
            });
        }
    });
    // Game invite decline
    socket.on('game-invite-decline', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // Target user disconnected, no need to forward decline
                return;
            }
            // Forward decline to partner
            io.to(targetUserInfo.socketId).emit('game-invite-decline', {
                from: socket.data.userId
            });
            console.log(`Game invite declined: ${socket.data.userId} declined ${data.to}'s invite`);
        }
        catch (error) {
            console.error('Error in game-invite-decline:', error);
        }
    });
    // Leave game room
    socket.on('game-leave-room', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            const room = gameRooms.get(data.roomId);
            if (room) {
                // Remove player from room
                const playerIndex = room.players.indexOf(socket.data.userId);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);
                }
                // If room is empty, delete it
                if (room.players.length === 0) {
                    gameRooms.delete(data.roomId);
                    console.log(`Game room deleted: ${data.roomId}`);
                }
            }
            // Notify partner if they're still active
            if (targetUserInfo) {
                io.to(targetUserInfo.socketId).emit('game-partner-left', {
                    from: socket.data.userId
                });
            }
            console.log(`Player ${socket.data.userId} left game room: ${data.roomId}`);
        }
        catch (error) {
            console.error('Error in game-leave-room:', error);
        }
    });
    // Game move
    socket.on('game-move', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your game partner. They may have disconnected.",
                    from: 'system',
                    gameType: data.gameType
                });
                return;
            }
            // Forward move to partner
            io.to(targetUserInfo.socketId).emit('game-move', {
                gameType: data.gameType,
                move: data.move,
                from: socket.data.userId
            });
            console.log(`Game move: ${socket.data.userId} made a move in ${data.gameType} game with ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-move:', error);
            socket.emit('game-error', {
                message: "Failed to send your move due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Start a new round (for Rock Paper Scissors)
    socket.on('game-start-round', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your game partner. They may have disconnected.",
                    from: 'system',
                    gameType: data.gameType
                });
                return;
            }
            // Forward round start to partner
            io.to(targetUserInfo.socketId).emit('game-start-round', {
                gameType: data.gameType,
                round: data.round,
                from: socket.data.userId
            });
            console.log(`Game round started: ${socket.data.userId} started round ${data.round} in ${data.gameType} with ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-start-round:', error);
            socket.emit('game-error', {
                message: "Failed to start new round due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Word setup (for Word Galaxy)
    socket.on('game-word-setup', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your game partner. They may have disconnected.",
                    from: 'system',
                    gameType: data.gameType
                });
                return;
            }
            // Forward word setup to partner
            io.to(targetUserInfo.socketId).emit('game-word-setup', {
                gameType: data.gameType,
                wordLength: data.wordLength,
                difficulty: data.difficulty,
                from: socket.data.userId
            });
            console.log(`Word setup: ${socket.data.userId} created a word of length ${data.wordLength} for ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-word-setup:', error);
            socket.emit('game-error', {
                message: "Failed to setup the word due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Guess result (for Word Galaxy)
    socket.on('game-guess-result', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your game partner. They may have disconnected.",
                    from: 'system',
                    gameType: data.gameType
                });
                return;
            }
            // Forward guess result to partner
            io.to(targetUserInfo.socketId).emit('game-guess-result', {
                gameType: data.gameType,
                result: data.result,
                from: socket.data.userId
            });
            console.log(`Guess result: ${socket.data.userId} processed guess "${data.result.word}" for ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-guess-result:', error);
            socket.emit('game-error', {
                message: "Failed to process guess due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Game reset
    socket.on('game-reset', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                socket.emit('game-error', {
                    message: "Cannot find your game partner. They may have disconnected.",
                    from: 'system',
                    gameType: data.gameType
                });
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-reset', {
                gameType: data.gameType,
                from: socket.data.userId,
                swapRoles: data.swapRoles,
                shouldBeCreator: data.shouldBeCreator,
                roundCount: data.roundCount,
                guesserScore: data.guesserScore,
                creatorScore: data.creatorScore
            });
            console.log(`Game reset: ${socket.data.userId} reset game with ${data.to}, Partner should be ${data.shouldBeCreator ? 'creator' : 'guesser'}`);
        }
        catch (error) {
            console.error('Error in game-reset:', error);
            socket.emit('game-error', {
                message: "Failed to reset the game due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Game error
    socket.on('game-error', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // User might have disconnected, no need to forward the error
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-error', {
                message: data.message,
                from: socket.data.userId,
                gameType: data.gameType
            });
            console.log(`Game error: ${socket.data.userId} sent error to ${data.to}: ${data.message}`);
        }
        catch (error) {
            console.error('Error in game-error:', error);
        }
    });
    // Game leave notification (simple notification without leaving room)
    socket.on('game-leave-notification', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // User might have disconnected, no need to forward the notification
                return;
            }
            // Send a notification to the partner that doesn't trigger a game-end event
            io.to(targetUserInfo.socketId).emit('game-notification', {
                type: 'info',
                message: data.message || 'Your partner left the game but is still in the chat.',
                from: socket.data.userId,
                gameType: data.gameType
            });
            console.log(`Game notification: ${socket.data.userId} sent notification to ${data.to}: ${data.message}`);
        }
        catch (error) {
            console.error('Error in game-leave-notification:', error);
        }
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        // Leave all game rooms this user is in
        for (const [roomId, room] of gameRooms.entries()) {
            const playerIndex = room.players.indexOf(socket.data.userId);
            if (playerIndex !== -1) {
                // Remove player from room
                room.players.splice(playerIndex, 1);
                // If room is empty, delete it
                if (room.players.length === 0) {
                    gameRooms.delete(roomId);
                    console.log(`Game room deleted on disconnect: ${roomId}`);
                }
                else {
                    // Notify other players in the room
                    room.players.forEach(playerId => {
                        const playerInfo = activeUsers.get(playerId);
                        if (playerInfo) {
                            io.to(playerInfo.socketId).emit('game-partner-left', {
                                from: socket.data.userId
                            });
                        }
                    });
                }
            }
        }
        console.log(`User ${socket.data.userId} disconnected from games`);
    });
    // Clean up old game rooms periodically (every 30 minutes)
    setInterval(() => {
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        for (const [roomId, room] of gameRooms.entries()) {
            if (now - room.createdAt > ONE_HOUR) {
                gameRooms.delete(roomId);
                console.log(`Cleaned up old game room: ${roomId}`);
            }
        }
    }, 30 * 60 * 1000);
};
exports.setupGameEvents = setupGameEvents;
