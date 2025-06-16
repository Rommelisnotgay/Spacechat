import { Server } from 'socket.io';

/**
 * Different types of errors in the system
 */
export enum ErrorType {
  VALIDATION = 'validation',
  GAME_LOGIC = 'game_logic',
  CONNECTION = 'connection',
  AUTHENTICATION = 'authentication',
  SERVER = 'server',
  UNKNOWN = 'unknown'
}

/**
 * Unified interface for game errors
 */
export interface GameError {
  code: string;
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: number;
}

/**
 * Class for handling game errors, logging them, and sending them to users
 */
export class ErrorHandler {
  private io: Server | null = null;
  private errorLog: Map<string, GameError[]> = new Map(); // userId -> errors[]
  
  /**
   * Set Socket.IO server
   */
  setSocketServer(io: Server): void {
    this.io = io;
  }
  
  /**
   * Log a new error
   * @param userId - User ID
   * @param error - Error information
   */
  logError(userId: string, error: Omit<GameError, 'timestamp'>): GameError {
    const fullError: GameError = {
      ...error,
      timestamp: Date.now()
    };
    
    // Add error to user's error log
    if (!this.errorLog.has(userId)) {
      this.errorLog.set(userId, []);
    }
    
    const userErrors = this.errorLog.get(userId)!;
    userErrors.push(fullError);
    
    // Limit error log length (keep last 50 errors per user)
    if (userErrors.length > 50) {
      userErrors.shift();
    }
    
    // Log error to general log for tracking
    console.error(`[${fullError.type.toUpperCase()}] Error for user ${userId}: ${fullError.code} - ${fullError.message}`);
    
    if (fullError.details) {
      console.error('Error details:', fullError.details);
    }
    
    return fullError;
  }
  
  /**
   * Send error to specific user
   * @param userId - User ID
   * @param socketId - User's Socket ID
   * @param error - Error information
   * @returns The full logged error
   */
  sendErrorToUser(userId: string, socketId: string, error: Omit<GameError, 'timestamp'>): GameError {
    // Log the error first
    const fullError = this.logError(userId, error);
    
    // Send error to user via Socket
    if (this.io) {
      this.io.to(socketId).emit('game-error', {
        message: fullError.message,
        code: fullError.code,
        type: fullError.type,
        from: 'system'
      });
    }
    
    return fullError;
  }
  
  /**
   * Get user's error log
   * @param userId - User ID
   * @returns List of user errors
   */
  getUserErrors(userId: string): GameError[] {
    return this.errorLog.get(userId) || [];
  }
  
  /**
   * Clear user's error log
   * @param userId - User ID
   */
  clearUserErrors(userId: string): void {
    this.errorLog.delete(userId);
  }
  
  /**
   * Create a new error with descriptive code
   * @param type - Error type
   * @param code - Error code
   * @param message - Error message
   * @param details - Additional details
   * @returns Error object
   */
  createError(
    type: ErrorType = ErrorType.UNKNOWN,
    code: string,
    message: string,
    details?: any
  ): Omit<GameError, 'timestamp'> {
    return {
      type,
      code,
      message,
      details
    };
  }
}

// Singleton object for use throughout the application
export const errorHandler = new ErrorHandler(); 