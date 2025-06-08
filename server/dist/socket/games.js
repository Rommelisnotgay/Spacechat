"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGameEvents = void 0;
// Game types that are fully implemented
const IMPLEMENTED_GAMES = ['rock-paper-scissors', 'tic-tac-toe', 'trivia'];
const setupGameEvents = (io, socket, activeUsers) => {
    // Game invite
    socket.on('game-invite', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // Target user not found
                socket.emit('game-error', {
                    message: "Cannot find the user you're trying to invite.",
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
            io.to(targetUserInfo.socketId).emit('game-invite', {
                gameType: data.gameType,
                from: socket.data.userId,
                roomId: data.roomId
            });
            console.log(`Game invite: ${socket.data.userId} invited ${data.to} to play ${data.gameType}`);
        }
        catch (error) {
            console.error('Error in game-invite:', error);
            socket.emit('game-error', {
                message: "Failed to send game invite due to a server error.",
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
                    message: "Cannot find the user who invited you.",
                    from: 'system'
                });
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-invite-accept', {
                gameType: data.gameType,
                from: socket.data.userId,
                roomId: data.roomId
            });
            console.log(`Game invite accepted: ${socket.data.userId} accepted ${data.to}'s invitation to play ${data.gameType}`);
        }
        catch (error) {
            console.error('Error in game-invite-accept:', error);
            socket.emit('game-error', {
                message: "Failed to accept game invite due to a server error.",
                from: 'system'
            });
        }
    });
    // Game invite decline
    socket.on('game-invite-decline', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // No need to send error since this is a decline action
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-invite-decline', {
                from: socket.data.userId
            });
            console.log(`Game invite declined: ${socket.data.userId} declined ${data.to}'s invitation`);
        }
        catch (error) {
            console.error('Error in game-invite-decline:', error);
        }
    });
    // Game invite cancel
    socket.on('game-invite-cancel', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // No need to send error since this is a cancel action
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-invite-cancel', {
                from: socket.data.userId
            });
            console.log(`Game invite canceled: ${socket.data.userId} canceled invitation to ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-invite-cancel:', error);
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
            io.to(targetUserInfo.socketId).emit('game-move', {
                gameType: data.gameType,
                move: data.move,
                from: socket.data.userId,
                roomId: data.roomId
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
    // Game data (for shared game state)
    socket.on('game-data', (data) => {
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
            io.to(targetUserInfo.socketId).emit('game-data', {
                gameType: data.gameType,
                data: data.data,
                from: socket.data.userId,
                roomId: data.roomId
            });
            console.log(`Game data: ${socket.data.userId} sent game data to ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-data:', error);
            socket.emit('game-error', {
                message: "Failed to send game data due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Game answer (for trivia)
    socket.on('game-answer', (data) => {
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
            io.to(targetUserInfo.socketId).emit('game-answer', {
                gameType: data.gameType,
                answer: data.answer,
                from: socket.data.userId,
                roomId: data.roomId
            });
            console.log(`Game answer: ${socket.data.userId} sent an answer to ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-answer:', error);
            socket.emit('game-error', {
                message: "Failed to send your answer due to a server error.",
                from: 'system',
                gameType: data.gameType
            });
        }
    });
    // Game end
    socket.on('game-end', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // User might have disconnected, but we don't need to report error
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-end', {
                gameType: data.gameType,
                result: data.result,
                from: socket.data.userId,
                roomId: data.roomId
            });
            console.log(`Game ended: ${socket.data.userId} ended game with ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-end:', error);
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
                roomId: data.roomId,
                firstTurn: data.firstTurn
            });
            console.log(`Game reset: ${socket.data.userId} reset game with ${data.to}`);
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
    // Game close
    socket.on('game-close', (data) => {
        try {
            const targetUserInfo = activeUsers.get(data.to);
            if (!targetUserInfo) {
                // User might have disconnected, but we don't need to report error
                return;
            }
            io.to(targetUserInfo.socketId).emit('game-close', {
                from: socket.data.userId
            });
            console.log(`Game closed: ${socket.data.userId} closed game with ${data.to}`);
        }
        catch (error) {
            console.error('Error in game-close:', error);
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
    // Handle disconnection
    socket.on('disconnect', () => {
        // No specific game-related logic needed here, as the main socket handler will remove the user
        // from activeUsers, and future game events will naturally fail.
        console.log(`User ${socket.data.userId} disconnected from games`);
    });
};
exports.setupGameEvents = setupGameEvents;
