"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameWordSetupSchema = exports.gameStartRoundSchema = exports.gameResetSchema = exports.wordGalaxyMoveSchema = exports.rockPaperScissorsMoveSchema = exports.ticTacToeMoveSchema = exports.gameMoveBaseSchema = exports.gameRoomLeaveSchema = exports.gameRoomJoinSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("../models/types");
/**
 * Game validation schemas using Zod
 * Used to validate data received from clients
 */
// Game room join schema
exports.gameRoomJoinSchema = zod_1.z.object({
    gameType: zod_1.z.string().refine(val => types_1.IMPLEMENTED_GAMES.includes(val), {
        message: 'Unsupported game type'
    }),
    roomId: zod_1.z.string().min(5, 'Room ID is too short'),
    to: zod_1.z.string().min(1, 'Target user ID is required'),
    isFirstPlayer: zod_1.z.boolean()
});
// Game room leave schema
exports.gameRoomLeaveSchema = zod_1.z.object({
    roomId: zod_1.z.string().min(1, 'Room ID is required'),
    to: zod_1.z.string().min(1, 'Target user ID is required')
});
// Base game move schema
exports.gameMoveBaseSchema = zod_1.z.object({
    gameType: zod_1.z.string().refine(val => types_1.IMPLEMENTED_GAMES.includes(val), {
        message: 'Unsupported game type'
    }),
    roomId: zod_1.z.string().optional(),
    to: zod_1.z.string().min(1, 'Target user ID is required')
});
// Tic Tac Toe move schema
exports.ticTacToeMoveSchema = exports.gameMoveBaseSchema.extend({
    move: zod_1.z.union([
        zod_1.z.object({
            index: zod_1.z.number().int().min(0).max(8)
        }),
        zod_1.z.object({
            row: zod_1.z.number().int().min(0).max(2),
            col: zod_1.z.number().int().min(0).max(2),
            symbol: zod_1.z.string().length(1).optional()
        }),
        zod_1.z.number().int().min(0).max(8)
    ])
});
// Rock Paper Scissors move schema
exports.rockPaperScissorsMoveSchema = exports.gameMoveBaseSchema.extend({
    move: zod_1.z.union([
        zod_1.z.string().refine(val => ['rock', 'paper', 'scissors'].includes(val), {
            message: 'Invalid move for Rock Paper Scissors'
        }),
        zod_1.z.object({
            choice: zod_1.z.string().refine(val => ['rock', 'paper', 'scissors'].includes(val), {
                message: 'Invalid choice for Rock Paper Scissors'
            }),
            round: zod_1.z.number().int().min(1).optional()
        })
    ])
});
// Word Galaxy word schema
exports.wordGalaxyMoveSchema = exports.gameMoveBaseSchema.extend({
    move: zod_1.z.string().min(1).max(20)
});
// Game reset schema
exports.gameResetSchema = zod_1.z.object({
    gameType: zod_1.z.string().refine(val => types_1.IMPLEMENTED_GAMES.includes(val), {
        message: 'Unsupported game type'
    }),
    roomId: zod_1.z.string().optional(),
    to: zod_1.z.string().min(1, 'Target user ID is required'),
    swapRoles: zod_1.z.boolean().optional(),
    shouldBeCreator: zod_1.z.boolean().optional(),
    roundCount: zod_1.z.number().int().min(0).optional(),
    guesserScore: zod_1.z.number().int().min(0).optional(),
    creatorScore: zod_1.z.number().int().min(0).optional()
});
// Start round schema
exports.gameStartRoundSchema = zod_1.z.object({
    gameType: zod_1.z.string().refine(val => types_1.IMPLEMENTED_GAMES.includes(val), {
        message: 'Unsupported game type'
    }),
    round: zod_1.z.number().int().min(1),
    to: zod_1.z.string().min(1, 'Target user ID is required')
});
// Word Galaxy setup schema
exports.gameWordSetupSchema = zod_1.z.object({
    gameType: zod_1.z.string().refine(val => types_1.IMPLEMENTED_GAMES.includes(val), {
        message: 'Unsupported game type'
    }),
    wordLength: zod_1.z.number().int().min(3).max(12),
    difficulty: zod_1.z.string().refine(val => ['easy', 'medium', 'hard'].includes(val), {
        message: 'Invalid difficulty level'
    }),
    to: zod_1.z.string().min(1, 'Target user ID is required')
});
