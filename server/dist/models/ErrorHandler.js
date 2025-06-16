"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.ErrorHandler = exports.ErrorType = void 0;
/**
 * Different types of errors in the system
 */
var ErrorType;
(function (ErrorType) {
    ErrorType["VALIDATION"] = "validation";
    ErrorType["GAME_LOGIC"] = "game_logic";
    ErrorType["CONNECTION"] = "connection";
    ErrorType["AUTHENTICATION"] = "authentication";
    ErrorType["SERVER"] = "server";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
/**
 * Class for handling game errors, logging them, and sending them to users
 */
class ErrorHandler {
    constructor() {
        this.io = null;
        this.errorLog = new Map(); // userId -> errors[]
    }
    /**
     * Set Socket.IO server
     */
    setSocketServer(io) {
        this.io = io;
    }
    /**
     * Log a new error
     * @param userId - User ID
     * @param error - Error information
     */
    logError(userId, error) {
        const fullError = {
            ...error,
            timestamp: Date.now()
        };
        // Add error to user's error log
        if (!this.errorLog.has(userId)) {
            this.errorLog.set(userId, []);
        }
        const userErrors = this.errorLog.get(userId);
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
    sendErrorToUser(userId, socketId, error) {
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
    getUserErrors(userId) {
        return this.errorLog.get(userId) || [];
    }
    /**
     * Clear user's error log
     * @param userId - User ID
     */
    clearUserErrors(userId) {
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
    createError(type = ErrorType.UNKNOWN, code, message, details) {
        return {
            type,
            code,
            message,
            details
        };
    }
}
exports.ErrorHandler = ErrorHandler;
// Singleton object for use throughout the application
exports.errorHandler = new ErrorHandler();
