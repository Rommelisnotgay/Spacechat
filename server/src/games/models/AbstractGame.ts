import { IGame } from '../interfaces/IGame';

/**
 * Abstract base class for all games
 * Implements common functionality that can be shared across game types
 */
export abstract class AbstractGame implements IGame {
  protected roomId: string;
  protected players: string[];
  protected currentTurn: string;
  protected winner: string | null = null;
  protected gameOver: boolean = false;
  protected createdAt: number;
  protected lastActivityAt: number;
  protected inactivityTimeout: number = 30 * 60 * 1000; // 30 دقيقة
  
  /**
   * Game type identifier - must be implemented by concrete classes
   */
  abstract readonly gameType: string;
  
  constructor() {
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
  initialize(roomId: string, players: string[]): boolean {
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
  protected updateActivity(): void {
    this.lastActivityAt = Date.now();
  }
  
  /**
   * Checks if the game is inactive
   */
  isInactive(): boolean {
    // اعتبر اللعبة غير نشطة إذا لم يكن هناك نشاط لفترة طويلة
    return Date.now() - this.lastActivityAt > this.inactivityTimeout;
  }
  
  /**
   * Gets the current state of the game - should be overridden by specific games
   * @returns Current game state
   */
  getState(): any {
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
  reset(): boolean {
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
   * Abstract methods that must be implemented by specific game classes
   */
  abstract processMove(playerId: string, move: any): any;
  abstract validateMove(playerId: string, move: any): boolean;
  
  /**
   * Handles a player disconnection
   * @param playerId - ID of the disconnected player
   * @returns Updated game state
   */
  handleDisconnect(playerId: string): any {
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
  isTimedOut(timeoutMs: number): boolean {
    return Date.now() - this.lastActivityAt > timeoutMs;
  }
  
  /**
   * Determines if the game has ended
   * @returns Boolean indicating if game has ended
   */
  isGameOver(): boolean {
    return this.gameOver;
  }
  
  /**
   * Gets the winner of the game (if any)
   * @returns ID of the winning player or null if no winner
   */
  getWinner(): string | null {
    return this.winner;
  }
  
  /**
   * Gets the room ID
   */
  getRoomId(): string {
    return this.roomId;
  }
  
  /**
   * Gets the list of players
   */
  getPlayers(): string[] {
    return [...this.players];
  }
  
  /**
   * Checks if a player is in the game
   */
  isPlayerInGame(playerId: string): boolean {
    return this.players.includes(playerId);
  }
  
  /**
   * Gets the base state of the game
   */
  getBaseState(): any {
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
  getPlayerState(playerId: string): any {
    return this.getState();
  }
  
  /**
   * Destroys the game and cleans up resources
   * Specific game classes can override this method to clean up additional resources
   */
  destroy(): void {
    // إيقاف أي مؤقتات أو موارد
    this.players = [];
    this.winner = null;
    this.gameOver = true;
  }
} 