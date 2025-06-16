import { z } from 'zod';
import { IMPLEMENTED_GAMES } from '../models/types';

/**
 * Game validation schemas using Zod
 * Used to validate data received from clients
 */

// Game room join schema
export const gameRoomJoinSchema = z.object({
  gameType: z.string().refine(val => IMPLEMENTED_GAMES.includes(val), {
    message: 'Unsupported game type'
  }),
  roomId: z.string().min(5, 'Room ID is too short'),
  to: z.string().min(1, 'Target user ID is required'),
  isFirstPlayer: z.boolean()
});

// Game room leave schema
export const gameRoomLeaveSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  to: z.string().min(1, 'Target user ID is required')
});

// Base game move schema
export const gameMoveBaseSchema = z.object({
  gameType: z.string().refine(val => IMPLEMENTED_GAMES.includes(val), {
    message: 'Unsupported game type'
  }),
  roomId: z.string().optional(),
  to: z.string().min(1, 'Target user ID is required')
});

// Tic Tac Toe move schema
export const ticTacToeMoveSchema = gameMoveBaseSchema.extend({
  move: z.union([
    z.object({
      index: z.number().int().min(0).max(8)
    }),
    z.object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2),
      symbol: z.string().length(1).optional()
    }),
    z.number().int().min(0).max(8)
  ])
});

// Rock Paper Scissors move schema
export const rockPaperScissorsMoveSchema = gameMoveBaseSchema.extend({
  move: z.union([
    z.string().refine(val => ['rock', 'paper', 'scissors'].includes(val), {
      message: 'Invalid move for Rock Paper Scissors'
    }),
    z.object({
      choice: z.string().refine(val => ['rock', 'paper', 'scissors'].includes(val), {
        message: 'Invalid choice for Rock Paper Scissors'
      }),
      round: z.number().int().min(1).optional()
    })
  ])
});

// Word Galaxy word schema
export const wordGalaxyMoveSchema = gameMoveBaseSchema.extend({
  move: z.string().min(1).max(20)
});

// Game reset schema
export const gameResetSchema = z.object({
  gameType: z.string().refine(val => IMPLEMENTED_GAMES.includes(val), {
    message: 'Unsupported game type'
  }),
  roomId: z.string().optional(),
  to: z.string().min(1, 'Target user ID is required'),
  swapRoles: z.boolean().optional(),
  shouldBeCreator: z.boolean().optional(),
  roundCount: z.number().int().min(0).optional(),
  guesserScore: z.number().int().min(0).optional(),
  creatorScore: z.number().int().min(0).optional()
});

// Start round schema
export const gameStartRoundSchema = z.object({
  gameType: z.string().refine(val => IMPLEMENTED_GAMES.includes(val), {
    message: 'Unsupported game type'
  }),
  round: z.number().int().min(1),
  to: z.string().min(1, 'Target user ID is required')
});

// Word Galaxy setup schema
export const gameWordSetupSchema = z.object({
  gameType: z.string().refine(val => IMPLEMENTED_GAMES.includes(val), {
    message: 'Unsupported game type'
  }),
  wordLength: z.number().int().min(3).max(12),
  difficulty: z.string().refine(val => ['easy', 'medium', 'hard'].includes(val), {
    message: 'Invalid difficulty level'
  }),
  to: z.string().min(1, 'Target user ID is required')
}); 