import { Server } from 'socket.io';
import { IGame } from '../games/interfaces/IGame';
import { GameFactory } from '../games/models/GameFactory';
import { gameService } from '../services/gameService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Controller for managing games and game rooms
 */
export class GameController {
  private io: Server | null = null;
  private games: Map<string, IGame> = new Map();
  private roomToGame: Map<string, string> = new Map(); // roomId -> gameId
  private inactivityTimeout = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private syncFrequency = 30 * 1000; // كل 30 ثانية
  
  constructor() {
    // Start the cleanup interval
    this.startCleanupInterval();
    
    // بدء دورة مزامنة حالة الألعاب
    this.startSyncInterval();
  }
  
  /**
   * Set the Socket.IO server instance
   * @param io - Socket.IO server instance
   */
  setSocketServer(io: Server): void {
    this.io = io;
  }
  
  /**
   * Create a new game room
   * @param roomId - ID for the room
   * @param gameType - Type of game
   * @param creatorId - ID of the player creating the room
   * @returns The created game or null if failed
   */
  createGameRoom(roomId: string, gameType: string, creatorId: string): IGame | null {
    try {
      // التحقق من أن نوع اللعبة مدعوم
      if (!gameService.isGameSupported(gameType)) {
        console.error(`Unsupported game type: ${gameType}`);
        return null;
      }
      
      // إنشاء غرفة لعبة جديدة
      const room = gameService.createGameRoom(roomId, gameType, creatorId);
      
      // إنشاء مثيل اللعبة
      const game = GameFactory.createGame(gameType);
      
      if (!game) {
        console.error(`Failed to create game instance for type: ${gameType}`);
        return null;
      }
      
      // تهيئة اللعبة
      game.initialize(roomId, [creatorId]);
      
      // تخزين مثيل اللعبة
      this.games.set(roomId, game);
      
      // تسجيل حالة اللعبة الأولية
      gameService.recordGameState(roomId, game.getState(), `init-${uuidv4()}`);
      
      return game;
    } catch (error) {
      console.error('Error creating game room:', error);
      return null;
    }
  }
  
  /**
   * Get a game by room ID
   * @param roomId - ID of the room
   * @returns The game instance or null if not found
   */
  getGameByRoom(roomId: string): IGame | null {
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
  joinGameRoom(roomId: string, playerId: string): IGame | null {
    try {
      // الحصول على الغرفة
      const room = gameService.getGameRoom(roomId);
      
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
      gameService.joinGameRoom(roomId, playerId);
      
      // إضافة اللاعب إلى اللعبة
      const players = [...room.players];
      game.initialize(roomId, players);
      
      // تسجيل حالة اللعبة بعد الانضمام
      gameService.recordGameState(roomId, game.getState(), `join-${playerId}-${Date.now()}`);
      
      return game;
    } catch (error) {
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
  leaveGameRoom(roomId: string, playerId: string): boolean {
    try {
      // تسجيل انقطاع اللاعب
      gameService.recordDisconnection(playerId);
      
      const game = this.games.get(roomId);
      
      if (game) {
        // تسجيل حالة اللعبة قبل المغادرة
        gameService.recordGameState(roomId, game.getState(), `leave-${playerId}-${Date.now()}`);
      }
      
      // إزالة اللاعب من الغرفة
      const success = gameService.leaveGameRoom(roomId, playerId);
      
      // إذا تم إزالة الغرفة (لا يوجد لاعبين)، قم بإزالة مثيل اللعبة أيضًا
      const room = gameService.getGameRoom(roomId);
      if (!room) {
        this.games.delete(roomId);
      }
      
      return success;
    } catch (error) {
      console.error('Error leaving game room:', error);
      return false;
    }
  }
  
  /**
   * Destroy a game room
   * @param roomId - ID of the room to destroy
   */
  destroyGameRoom(roomId: string): boolean {
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
      gameService.cleanupGameData(roomId);
      
      return true;
    } catch (error) {
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
  processMove(roomId: string, playerId: string, move: any): any {
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
      gameService.recordGameState(roomId, updatedState, moveId);
      
      return updatedState;
    } catch (error) {
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
  resetGame(roomId: string, playerId: string): boolean {
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
    gameService.recordGameState(roomId, gameState, resetId);
    
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
  private broadcastGameState(roomId: string, gameState: any, senderId: string): void {
    if (!this.io) {
      console.warn('Socket.IO server not set, cannot broadcast game state');
      return;
    }
    
    // لكل لاعب في حالة اللعبة
    for (const playerId of gameState.players) {
      // تجنب إرسال الحالة إلى المرسل
      if (playerId === senderId) continue;
      
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
  private findPlayerSocket(playerId: string): any {
    if (!this.io) return null;
    
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
  isGameSupported(gameType: string): boolean {
    const game = GameFactory.createGame(gameType);
    return game !== null;
  }
  
  /**
   * Get all active game rooms
   * @returns Map of roomId to game instances
   */
  getAllActiveRooms(): Map<string, IGame> {
    const rooms = new Map<string, IGame>();
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
  private startCleanupInterval(): void {
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
  private startSyncInterval(): void {
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
  private synchronizeAllGames(): void {
    // الحصول على جميع الألعاب النشطة
    const activeRooms = this.getAllActiveRooms();
    
    // لكل غرفة نشطة
    for (const [roomId, game] of activeRooms.entries()) {
      // الحصول على حالة اللعبة الحالية
      const gameState = game.getState();
      
      // تجاهل الألعاب التي انتهت
      if (gameState.gameOver) continue;
      
      // تسجيل حالة المزامنة
      gameService.recordGameState(roomId, gameState, `sync-${Date.now()}`);
      
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
  handleReconnection(roomId: string, userId: string, socketId: string): any {
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
    gameService.recordReconnection(userId, socketId);
    
    // تسجيل حالة اللعبة بعد إعادة الاتصال
    const reconnectionId = `reconnect-${userId}-${Date.now()}`;
    gameService.recordGameState(roomId, gameState, reconnectionId);
    
    // استرجاع آخر حركات للاعب
    const lastMoves = gameService.getLastMoves(roomId, 5);
    
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
  private cleanupInactiveGames(): void {
    const now = Date.now();
    const activeRooms = this.getAllActiveRooms();
    
    for (const [roomId, game] of activeRooms.entries()) {
      const gameState = game.getState();
      
      // تجاهل الألعاب التي انتهت
      if (gameState.gameOver) continue;
      
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
  shutdown(): void {
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

// Create a singleton instance
export const gameController = new GameController();
