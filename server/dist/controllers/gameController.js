"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameController = exports.GameController = void 0;
const GameFactory_1 = require("../games/models/GameFactory");
const gameService_1 = require("../services/gameService");
const uuid_1 = require("uuid");
/**
 * Controller for managing games and game rooms
 */
class GameController {
    constructor() {
        this.io = null;
        this.games = new Map();
        this.roomToGame = new Map(); // roomId -> gameId
        this.inactivityTimeout = 30 * 60 * 1000; // 30 minutes
        this.cleanupInterval = null;
        this.syncInterval = null;
        this.syncFrequency = 30 * 1000; // كل 30 ثانية
        // Start the cleanup interval
        this.startCleanupInterval();
        // بدء دورة مزامنة حالة الألعاب
        this.startSyncInterval();
    }
    /**
     * Set the Socket.IO server instance
     * @param io - Socket.IO server instance
     */
    setSocketServer(io) {
        this.io = io;
    }
    /**
     * Create a new game room
     * @param roomId - ID for the room
     * @param gameType - Type of game
     * @param creatorId - ID of the player creating the room
     * @returns The created game or null if failed
     */
    createGameRoom(roomId, gameType, creatorId) {
        try {
            // التحقق من أن نوع اللعبة مدعوم
            if (!gameService_1.gameService.isGameSupported(gameType)) {
                console.error(`Unsupported game type: ${gameType}`);
                return null;
            }
            // إنشاء غرفة لعبة جديدة
            const room = gameService_1.gameService.createGameRoom(roomId, gameType, creatorId);
            // إنشاء مثيل اللعبة
            const game = GameFactory_1.GameFactory.createGame(gameType);
            if (!game) {
                console.error(`Failed to create game instance for type: ${gameType}`);
                return null;
            }
            // تهيئة اللعبة
            game.initialize(roomId, [creatorId]);
            // تخزين مثيل اللعبة
            this.games.set(roomId, game);
            // تسجيل حالة اللعبة الأولية
            gameService_1.gameService.recordGameState(roomId, game.getState(), `init-${(0, uuid_1.v4)()}`);
            return game;
        }
        catch (error) {
            console.error('Error creating game room:', error);
            return null;
        }
    }
    /**
     * Get a game by room ID
     * @param roomId - ID of the room
     * @returns The game instance or null if not found
     */
    getGameByRoom(roomId) {
        const gameId = this.roomToGame.get(roomId);
        if (!gameId) {
            return null;
        }
        return this.games.get(gameId) || null;
    }
    /**
     * Join an existing game room
     * @param roomId - ID of the room to join
     * @param playerId - ID of the joining player
     * @returns The joined game or null if failed
     */
    joinGameRoom(roomId, playerId) {
        try {
            // الحصول على الغرفة
            const room = gameService_1.gameService.getGameRoom(roomId);
            if (!room) {
                console.error(`Room not found: ${roomId}`);
                return null;
            }
            // الحصول على مثيل اللعبة
            const game = this.games.get(roomId);
            if (!game) {
                console.error(`Game instance not found for room: ${roomId}`);
                return null;
            }
            // إضافة اللاعب إلى الغرفة
            gameService_1.gameService.joinGameRoom(roomId, playerId);
            // إضافة اللاعب إلى اللعبة
            const players = [...room.players];
            game.initialize(roomId, players);
            // تسجيل حالة اللعبة بعد الانضمام
            gameService_1.gameService.recordGameState(roomId, game.getState(), `join-${playerId}-${Date.now()}`);
            return game;
        }
        catch (error) {
            console.error('Error joining game room:', error);
            return null;
        }
    }
    /**
     * Leave a game room
     * @param roomId - ID of the room to leave
     * @param playerId - ID of the leaving player
     * @returns Boolean indicating success
     */
    leaveGameRoom(roomId, playerId) {
        try {
            // تسجيل انقطاع اللاعب
            gameService_1.gameService.recordDisconnection(playerId);
            const game = this.games.get(roomId);
            if (game) {
                // تسجيل حالة اللعبة قبل المغادرة
                gameService_1.gameService.recordGameState(roomId, game.getState(), `leave-${playerId}-${Date.now()}`);
            }
            // إزالة اللاعب من الغرفة
            const success = gameService_1.gameService.leaveGameRoom(roomId, playerId);
            // إذا تم إزالة الغرفة (لا يوجد لاعبين)، قم بإزالة مثيل اللعبة أيضًا
            const room = gameService_1.gameService.getGameRoom(roomId);
            if (!room) {
                this.games.delete(roomId);
            }
            return success;
        }
        catch (error) {
            console.error('Error leaving game room:', error);
            return false;
        }
    }
    /**
     * Destroy a game room
     * @param roomId - ID of the room to destroy
     */
    destroyGameRoom(roomId) {
        try {
            // الحصول على مثيل اللعبة
            const game = this.games.get(roomId);
            if (game) {
                // تدمير اللعبة
                game.destroy();
            }
            // إزالة مثيل اللعبة
            this.games.delete(roomId);
            // تنظيف بيانات اللعبة
            gameService_1.gameService.cleanupGameData(roomId);
            return true;
        }
        catch (error) {
            console.error('Error destroying game room:', error);
            return false;
        }
    }
    /**
     * Process a move in a game
     * @param roomId - ID of the game room
     * @param playerId - ID of the player making the move
     * @param move - The move data
     * @returns The updated game state or null if failed
     */
    processMove(roomId, playerId, move) {
        try {
            // الحصول على مثيل اللعبة
            const game = this.games.get(roomId);
            if (!game) {
                console.error(`Game instance not found for room: ${roomId}`);
                return null;
            }
            // التحقق من صحة الحركة
            if (!game.validateMove(playerId, move)) {
                console.error(`Invalid move by player ${playerId} in room ${roomId}`);
                return null;
            }
            // معالجة الحركة
            const moveId = `move-${playerId}-${Date.now()}`;
            const updatedState = game.processMove(playerId, move);
            // تسجيل حالة اللعبة بعد الحركة
            gameService_1.gameService.recordGameState(roomId, updatedState, moveId);
            return updatedState;
        }
        catch (error) {
            console.error('Error processing game move:', error);
            return null;
        }
    }
    /**
     * Reset a game
     * @param roomId - ID of the game room
     * @param playerId - ID of the player requesting the reset
     * @returns Boolean indicating success
     */
    resetGame(roomId, playerId) {
        const game = this.getGameByRoom(roomId);
        if (!game) {
            return false;
        }
        // معرف فريد لإعادة تعيين اللعبة
        const resetId = `reset-${playerId}-${Date.now()}`;
        // إعادة تعيين اللعبة
        const success = game.reset();
        if (!success) {
            return false;
        }
        // الحصول على الحالة بعد إعادة التعيين
        const gameState = game.getState();
        // تسجيل حالة اللعبة بعد إعادة التعيين
        gameService_1.gameService.recordGameState(roomId, gameState, resetId);
        // البث للاعبين في الغرفة
        this.broadcastGameState(roomId, gameState, playerId);
        return true;
    }
    /**
     * Broadcast game state to all players in a room
     * @param roomId - ID of the game room
     * @param gameState - Current state of the game
     * @param senderId - ID of the player who triggered the update
     */
    broadcastGameState(roomId, gameState, senderId) {
        if (!this.io) {
            console.warn('Socket.IO server not set, cannot broadcast game state');
            return;
        }
        // لكل لاعب في حالة اللعبة
        for (const playerId of gameState.players) {
            // تجنب إرسال الحالة إلى المرسل
            if (playerId === senderId)
                continue;
            // البحث عن سوكيت اللاعب
            const playerSocket = this.findPlayerSocket(playerId);
            if (playerSocket) {
                // إرسال تحديث حالة اللعبة
                playerSocket.emit('game-state', {
                    gameType: gameState.gameType,
                    ...gameState
                });
            }
        }
    }
    /**
     * Find a player's socket by their ID
     * @param playerId - ID of the player
     * @returns The player's socket or null if not found
     */
    findPlayerSocket(playerId) {
        if (!this.io)
            return null;
        // البحث عن سوكيت اللاعب
        const sockets = this.io.sockets.sockets;
        for (const [socketId, socket] of sockets.entries()) {
            if (socket.data && socket.data.userId === playerId) {
                return socket;
            }
        }
        return null;
    }
    /**
     * Check if a game type is supported
     * @param gameType - Type of game to check
     * @returns Boolean indicating if game type is supported
     */
    isGameSupported(gameType) {
        const game = GameFactory_1.GameFactory.createGame(gameType);
        return game !== null;
    }
    /**
     * Get all active game rooms
     * @returns Map of roomId to game instances
     */
    getAllActiveRooms() {
        const rooms = new Map();
        for (const [roomId, gameId] of this.roomToGame.entries()) {
            const game = this.games.get(gameId);
            if (game) {
                rooms.set(roomId, game);
            }
        }
        return rooms;
    }
    /**
     * Start the cleanup interval for inactive games
     */
    startCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveGames();
        }, 10 * 60 * 1000); // كل 10 دقائق
    }
    /**
     * Start the sync interval for game states
     */
    startSyncInterval() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        this.syncInterval = setInterval(() => {
            this.synchronizeAllGames();
        }, this.syncFrequency);
    }
    /**
     * Synchronize all active games
     */
    synchronizeAllGames() {
        // الحصول على جميع الألعاب النشطة
        const activeRooms = this.getAllActiveRooms();
        // لكل غرفة نشطة
        for (const [roomId, game] of activeRooms.entries()) {
            // الحصول على حالة اللعبة الحالية
            const gameState = game.getState();
            // تجاهل الألعاب التي انتهت
            if (gameState.gameOver)
                continue;
            // تسجيل حالة المزامنة
            gameService_1.gameService.recordGameState(roomId, gameState, `sync-${Date.now()}`);
            // البث للاعبين في الغرفة
            for (const playerId of gameState.players) {
                // البحث عن سوكيت اللاعب
                const playerSocket = this.findPlayerSocket(playerId);
                if (playerSocket) {
                    // إرسال تحديث حالة اللعبة
                    playerSocket.emit('game-state-sync', {
                        gameType: gameState.gameType,
                        ...gameState
                    });
                }
            }
        }
    }
    /**
     * Handle player reconnection to a game
     * @param roomId - ID of the game room
     * @param userId - ID of the reconnecting player
     * @param socketId - New socket ID of the player
     * @returns The current game state or null if failed
     */
    handleReconnection(roomId, userId, socketId) {
        const game = this.getGameByRoom(roomId);
        if (!game) {
            return null;
        }
        // التحقق من أن اللاعب في اللعبة
        const gameState = game.getState();
        if (!gameState.players.includes(userId)) {
            return null;
        }
        // تسجيل إعادة الاتصال
        gameService_1.gameService.recordReconnection(userId, socketId);
        // تسجيل حالة اللعبة بعد إعادة الاتصال
        const reconnectionId = `reconnect-${userId}-${Date.now()}`;
        gameService_1.gameService.recordGameState(roomId, gameState, reconnectionId);
        // استرجاع آخر حركات للاعب
        const lastMoves = gameService_1.gameService.getLastMoves(roomId, 5);
        // إضافة آخر الحركات إلى حالة اللعبة
        return {
            ...gameState,
            lastMoves,
            reconnected: true
        };
    }
    /**
     * Clean up inactive games
     */
    cleanupInactiveGames() {
        const now = Date.now();
        const activeRooms = this.getAllActiveRooms();
        for (const [roomId, game] of activeRooms.entries()) {
            const gameState = game.getState();
            // تجاهل الألعاب التي انتهت
            if (gameState.gameOver)
                continue;
            // الحصول على آخر نشاط
            const lastActivity = gameState.lastActivity || 0;
            // إذا لم يكن هناك نشاط منذ فترة طويلة
            if (now - lastActivity > this.inactivityTimeout) {
                console.log(`Cleaning up inactive game room ${roomId}`);
                // إذا كان هناك لاعبون في الغرفة، أبلغهم قبل الإغلاق
                if (this.io) {
                    for (const playerId of gameState.players) {
                        const playerSocket = this.findPlayerSocket(playerId);
                        if (playerSocket) {
                            playerSocket.emit('game-inactive', {
                                roomId,
                                message: 'Game has been closed due to inactivity'
                            });
                        }
                    }
                }
                // تدمير غرفة اللعبة
                this.destroyGameRoom(roomId);
            }
        }
    }
    /**
     * Shutdown the controller and clean up resources
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        // تنظيف جميع الألعاب
        for (const roomId of this.roomToGame.keys()) {
            this.destroyGameRoom(roomId);
        }
        this.io = null;
    }
}
exports.GameController = GameController;
// Create a singleton instance
exports.gameController = new GameController();
