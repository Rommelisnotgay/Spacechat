"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractGame = void 0;
/**
 * Abstract base class for all games
 * Implements common functionality that can be shared across game types
 */
class AbstractGame {
    constructor() {
        this.winner = null;
        this.gameOver = false;
        this.inactivityTimeout = 30 * 60 * 1000; // 30 دقيقة
        this.roomId = '';
        this.players = [];
        this.currentTurn = '';
        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();
    }
    /**
     * Initializes a new game session
     * @param roomId - Unique identifier for the game room
     * @param players - Array of player IDs
     * @returns Boolean indicating success or failure
     */
    initialize(roomId, players) {
        if (players.length < 2) {
            return false;
        }
        this.roomId = roomId;
        this.players = [...players];
        this.currentTurn = players[0]; // First player starts by default
        this.lastActivityAt = Date.now();
        this.winner = null;
        this.gameOver = false;
        return true;
    }
    /**
     * Updates the last activity timestamp
     */
    updateActivity() {
        this.lastActivityAt = Date.now();
    }
    /**
     * Checks if the game is inactive
     */
    isInactive() {
        // اعتبر اللعبة غير نشطة إذا لم يكن هناك نشاط لفترة طويلة
        return Date.now() - this.lastActivityAt > this.inactivityTimeout;
    }
    /**
     * Gets the current state of the game - should be overridden by specific games
     * @returns Current game state
     */
    getState() {
        return {
            roomId: this.roomId,
            players: this.players,
            currentTurn: this.currentTurn,
            winner: this.winner,
            gameOver: this.gameOver,
            lastActivityAt: this.lastActivityAt
        };
    }
    /**
     * Resets the game to initial state - basic implementation
     * @returns Boolean indicating success or failure
     */
    reset() {
        if (this.players.length < 2) {
            return false;
        }
        this.currentTurn = this.players[0];
        this.winner = null;
        this.gameOver = false;
        this.lastActivityAt = Date.now();
        return true;
    }
    /**
     * Handles a player disconnection
     * @param playerId - ID of the disconnected player
     * @returns Updated game state
     */
    handleDisconnect(playerId) {
        // Default behavior: game ends when a player disconnects
        this.gameOver = true;
        // The other player wins by default
        const otherPlayer = this.players.find(id => id !== playerId);
        if (otherPlayer) {
            this.winner = otherPlayer;
        }
        return this.getState();
    }
    /**
     * Checks if the game has been inactive for too long
     * @param timeoutMs - Timeout in milliseconds
     * @returns Boolean indicating if game is timed out
     */
    isTimedOut(timeoutMs) {
        return Date.now() - this.lastActivityAt > timeoutMs;
    }
    /**
     * Determines if the game has ended
     * @returns Boolean indicating if game has ended
     */
    isGameOver() {
        return this.gameOver;
    }
    /**
     * Gets the winner of the game (if any)
     * @returns ID of the winning player or null if no winner
     */
    getWinner() {
        return this.winner;
    }
    /**
     * Gets the room ID
     */
    getRoomId() {
        return this.roomId;
    }
    /**
     * Gets the list of players
     */
    getPlayers() {
        return [...this.players];
    }
    /**
     * Checks if a player is in the game
     */
    isPlayerInGame(playerId) {
        return this.players.includes(playerId);
    }
    /**
     * Gets the base state of the game
     */
    getBaseState() {
        return {
            roomId: this.roomId,
            players: this.players,
            winner: this.winner,
            gameOver: this.gameOver,
            gameType: this.gameType,
            lastActivity: this.lastActivityAt
        };
    }
    /**
     * Gets the state of the game for a specific player
     * Specific game classes can override this method to hide certain information
     */
    getPlayerState(playerId) {
        return this.getState();
    }
    /**
     * Destroys the game and cleans up resources
     * Specific game classes can override this method to clean up additional resources
     */
    destroy() {
        // إيقاف أي مؤقتات أو موارد
        this.players = [];
        this.winner = null;
        this.gameOver = true;
    }
}
exports.AbstractGame = AbstractGame;
