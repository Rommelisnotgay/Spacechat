import { Server, Socket } from 'socket.io';
import { 
  GameRoomJoin, 
  GameRoomLeave, 
  GameMove, 
  GameReset,
  GameStartRound,
  GameWordSetup,
  GameGuessResult,
  GameError
} from '../models/types';
import { gameController } from '../controllers/gameController';
import { userService } from '../services/userService';
import { gameService } from '../services/gameService';
import { errorHandler, ErrorType } from '../models/ErrorHandler';
import { 
  gameRoomJoinSchema, 
  gameRoomLeaveSchema, 
  ticTacToeMoveSchema,
  rockPaperScissorsMoveSchema,
  wordGalaxyMoveSchema,
  gameResetSchema,
  gameStartRoundSchema,
  gameWordSetupSchema
} from '../validation/gameSchemas';
import { validate, getGameSpecificSchema } from '../validation/validator';

/**
 * Sets up game-related socket event handlers
 * @param io - Socket.IO server instance
 * @param socket - Client socket connection
 */
export const setupGameEvents = (io: Server, socket: Socket) => {
  // Set socket server in the game controller and error handler
  gameController.setSocketServer(io);
  errorHandler.setSocketServer(io);
  
  /**
   * Handle game room join request
   * Players can create a new room or join an existing one
   */
  socket.on('game-join-room', (data: GameRoomJoin) => {
    try {
      // التحقق من صحة البيانات باستخدام Zod
      const validationResult = validate(gameRoomJoinSchema, data);
      
      if (!validationResult.success) {
        socket.emit('game-error', {
          message: `Invalid data: ${validationResult.error}`,
          from: 'system'
        });
        return;
      }
      
      // استخدام البيانات المتحقق منها
      const validData = validationResult.data;
      
      const targetUserInfo = userService.getUserInfo(validData.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system'
        });
        return;
      }
      
      // تمت إزالة التحقق من نوع اللعبة هنا لأنه تم تضمينه في مخطط التحقق
      
      // Check if this is a new room or joining an existing room
      if (validData.isFirstPlayer) {
        // Create a new game room
        const game = gameController.createGameRoom(validData.roomId, validData.gameType, socket.data.userId);
        
        if (!game) {
          socket.emit('game-error', {
            message: "Failed to create game room.",
            from: 'system'
          });
          return;
        }
        
        // Invite the partner to join
        io.to(targetUserInfo.socketId).emit('game-room-invite', {
          gameType: validData.gameType,
          roomId: validData.roomId,
          from: socket.data.userId
        });
        
        // تسجيل الحدث للمساعدة في تتبع الأخطاء
        console.log(`Game room created: ${validData.roomId}, type: ${validData.gameType}, by: ${socket.data.userId}`);
      } else {
        // Join an existing room
        const game = gameController.joinGameRoom(validData.roomId, socket.data.userId);
        
        if (!game) {
          socket.emit('game-error', {
            message: "The room you are trying to join does not exist.",
            from: 'system'
          });
          return;
        }
        
        // Get the game state
        const gameState = game.getState();
        
        // Notify the room creator that the partner has joined
        const roomCreator = gameState.players[0];
        const roomCreatorInfo = userService.getUserInfo(roomCreator);
        
        if (roomCreatorInfo) {
          io.to(roomCreatorInfo.socketId).emit('game-partner-joined', {
            from: socket.data.userId,
            gameType: validData.gameType
          });
          
          // Also notify this player that they joined successfully
          socket.emit('game-partner-joined', {
            from: roomCreator,
            gameType: validData.gameType
          });
          
          // تسجيل الحدث للمساعدة في تتبع الأخطاء
          console.log(`Player ${socket.data.userId} joined room: ${validData.roomId}`);
        }
      }
    } catch (error) {
      console.error('Error in game-join-room:', error);
      socket.emit('game-error', {
        message: "Failed to join game room due to server error.",
        from: 'system'
      });
    }
  });
  
  /**
   * Handle direct game invitation (without room)
   */
  socket.on('game-invite', (data: { gameType: string; to: string; inviteId?: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system'
        });
        return;
      }
      
      // Register users as partners before sending the invitation
      // This prevents "left the game" messages when accepting invites
      socket.data.partnerId = data.to;
      
      // Generate invite ID if not provided
      const inviteId = data.inviteId || `invite-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      // Forward the invitation to the partner
      io.to(targetUserInfo.socketId).emit('game-invite', {
        gameType: data.gameType,
        from: socket.data.userId,
        inviteId: inviteId
      });
      
      // Send confirmation back to sender
      socket.emit('game-invite-sent', {
        to: data.to,
        gameType: data.gameType,
        inviteId: inviteId
      });
      
      console.log(`Game invite sent: ${socket.data.userId} invited ${data.to} to play ${data.gameType} with ID ${inviteId}`);
    } catch (error) {
      console.error('Error in game-invite:', error);
      socket.emit('game-error', {
        message: "Failed to send game invitation due to server error.",
        from: 'system'
      });
    }
  });
  
  /**
   * Handle game invitation acceptance
   */
  socket.on('game-invite-accept', (data: { gameType: string; to: string; inviteId?: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system'
        });
        return;
      }
      
      // Update current user's partner
      socket.data.partnerId = data.to;
      
      // Get target user's socket
      const targetSocket = io.sockets.sockets.get(targetUserInfo.socketId);
      if (targetSocket) {
        // Update target user's partner
        targetSocket.data.partnerId = socket.data.userId;
      }
      
      // Clean up any existing game rooms between these users to prevent conflicts
      const userIds = [socket.data.userId, data.to].sort();
      const potentialRoomIds = [
        `tic-tac-toe-${userIds[0]}-${userIds[1]}`,
        `rock-paper-scissors-${userIds[0]}-${userIds[1]}`,
        `word-galaxy-${userIds[0]}-${userIds[1]}`
      ];
      
      // Check and destroy any existing rooms
      potentialRoomIds.forEach(roomId => {
        const existingGame = gameController.getGameByRoom(roomId);
        if (existingGame) {
          console.log(`Cleaning up existing game room ${roomId} before creating a new one`);
          gameController.destroyGameRoom(roomId);
        }
      });
      
      // Forward acceptance to partner
      io.to(targetUserInfo.socketId).emit('game-invite-accepted', {
        gameType: data.gameType,
        from: socket.data.userId,
        inviteId: data.inviteId
      });
      
      console.log(`Game invite accepted: ${socket.data.userId} accepted ${data.to}'s invite to play ${data.gameType}`);
    } catch (error) {
      console.error('Error in game-invite-accept:', error);
      socket.emit('game-error', {
        message: "Failed to accept game invitation due to server error.",
        from: 'system'
      });
    }
  });
  
  /**
   * Handle game invitation decline
   */
  socket.on('game-invite-decline', (data: { to: string; inviteId?: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        // Target is not connected, no need to forward the decline
        return;
      }
      
      // Forward decline to partner
      io.to(targetUserInfo.socketId).emit('game-invite-declined', {
        from: socket.data.userId,
        inviteId: data.inviteId
      });
      
      console.log(`Game invite declined: ${socket.data.userId} declined invitation from ${data.to}`);
    } catch (error) {
      console.error('Error in game-invite-decline:', error);
    }
  });
  
  /**
   * Handle game invitation timeout
   */
  socket.on('game-invite-timeout', (data: { to: string; inviteId: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        // Target is not connected, no need to forward the timeout
        return;
      }
      
      // Forward timeout to partner
      io.to(targetUserInfo.socketId).emit('game-invite-timeout', {
        from: socket.data.userId,
        inviteId: data.inviteId
      });
      
      console.log(`Game invite timed out: Invitation ${data.inviteId} from ${data.to} timed out`);
    } catch (error) {
      console.error('Error in game-invite-timeout:', error);
    }
  });
  
  /**
   * Handle game join (after accepting invitation)
   */
  socket.on('game-join', (data: { gameType: string; partnerId: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.partnerId);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system'
        });
        return;
      }
      
      // Generate a room ID
      const roomId = `game-${data.gameType}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      // Create a new game room
      const game = gameController.createGameRoom(roomId, data.gameType, socket.data.userId);
      
      if (!game) {
        socket.emit('game-error', {
          message: "Failed to create game room.",
          from: 'system'
        });
        return;
      }
      
      // Confirm game join to the creator
      socket.emit('game-join-confirmed', {
        gameType: data.gameType,
        roomId: roomId
      });
      
      // Invite the partner to join the room
      io.to(targetUserInfo.socketId).emit('game-room-invite', {
        gameType: data.gameType,
        roomId: roomId,
        from: socket.data.userId
      });
      
      console.log(`Game room created: ${roomId}, type: ${data.gameType}, by: ${socket.data.userId}`);
    } catch (error) {
      console.error('Error in game-join:', error);
      socket.emit('game-error', {
        message: "Failed to join game due to server error.",
        from: 'system'
      });
    }
  });
  
  /**
   * Handle game room leave
   */
  socket.on('game-leave-room', (data: GameRoomLeave) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
        // Remove player from room
      const success = gameController.leaveGameRoom(data.roomId, socket.data.userId);
      
      if (success && targetUserInfo) {
        // Add a small delay before notifying partner to ensure any previous notifications are processed
        setTimeout(() => {
          // Check if the socket is still connected
          if (io.sockets.sockets.has(targetUserInfo.socketId)) {
        // Notify partner
        io.to(targetUserInfo.socketId).emit('game-partner-left', {
          from: socket.data.userId
        });
            
            console.log(`Player ${socket.data.userId} left game room ${data.roomId}, notified partner ${data.to}`);
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error in game-leave-room:', error);
    }
  });
  
  /**
   * Handle game move
   */
  socket.on('game-move', (data: GameMove) => {
    try {
      // التحقق من صحة البيانات باستخدام المخطط المناسب حسب نوع اللعبة
      let validationResult;
      
      switch (data.gameType) {
        case 'tic-tac-toe':
          validationResult = validate(ticTacToeMoveSchema, data);
          break;
        case 'rock-paper-scissors':
          validationResult = validate(rockPaperScissorsMoveSchema, data);
          break;
        case 'word-galaxy':
          validationResult = validate(wordGalaxyMoveSchema, data);
          break;
        default:
          // استخدام معالج الأخطاء الجديد
          errorHandler.sendErrorToUser(
            socket.data.userId, 
            socket.id, 
            errorHandler.createError(
              ErrorType.VALIDATION,
              'GAME_TYPE_UNSUPPORTED',
              `Unsupported game type: ${data.gameType}`,
              { gameType: data.gameType }
            )
          );
          return;
      }
      
      if (!validationResult.success) {
        // استخدام معالج الأخطاء الجديد
        errorHandler.sendErrorToUser(
          socket.data.userId, 
          socket.id, 
          errorHandler.createError(
            ErrorType.VALIDATION,
            'INVALID_MOVE_DATA',
            `Invalid move data: ${validationResult.error}`,
            { gameType: data.gameType, error: validationResult.error }
          )
        );
        return;
      }
      
      // استخدام البيانات المتحقق منها
      const validData = validationResult.data;
      
      const targetUserInfo = userService.getUserInfo(validData.to);
      
      if (!targetUserInfo) {
        // استخدام معالج الأخطاء الجديد
        errorHandler.sendErrorToUser(
          socket.data.userId, 
          socket.id, 
          errorHandler.createError(
            ErrorType.CONNECTION,
            'PARTNER_NOT_FOUND',
            "Could not find your partner. They may have disconnected.",
            { targetId: validData.to }
          )
        );
        return;
      }
      
      // Process move on the server side
      if (validData.roomId) {
        const result = gameController.processMove(validData.roomId, socket.data.userId, validData.move);
        if (!result) {
          // استخدام معالج الأخطاء الجديد
          errorHandler.sendErrorToUser(
            socket.data.userId, 
            socket.id, 
            errorHandler.createError(
              ErrorType.GAME_LOGIC,
              'INVALID_MOVE',
              "Invalid move or game not found.",
              { 
                roomId: validData.roomId, 
                gameType: validData.gameType,
                move: validData.move
              }
            )
          );
          return;
        }
        
        // تسجيل الحركة للمساعدة في تتبع الأخطاء
        console.log(`Game move in room ${validData.roomId}: player ${socket.data.userId}, move:`, validData.move);
      }
      
      // Forward move to partner
      io.to(targetUserInfo.socketId).emit('game-move', {
        gameType: validData.gameType,
        move: validData.move,
        from: socket.data.userId
      });
    } catch (error) {
      console.error('Error in game-move:', error);
      
      // استخدام معالج الأخطاء الجديد
      errorHandler.sendErrorToUser(
        socket.data.userId, 
        socket.id, 
        errorHandler.createError(
          ErrorType.SERVER,
          'MOVE_PROCESSING_ERROR',
          "Failed to process game move due to server error.",
          { error: (error as Error).message }
        )
      );
    }
  });
  
  /**
   * Handle game reset
   */
  socket.on('game-reset', (data: GameReset) => {
    try {
      // التحقق من صحة البيانات باستخدام مخطط Zod
      const validationResult = validate(gameResetSchema, data);
      
      if (!validationResult.success) {
        socket.emit('game-error', {
          message: `Invalid data: ${validationResult.error}`,
          from: 'system',
          gameType: data.gameType
        });
        return;
      }
      
      // استخدام البيانات المتحقق منها
      const validData = validationResult.data;
      
      const targetUserInfo = userService.getUserInfo(validData.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system',
          gameType: validData.gameType
        });
        return;
      }
      
      // Process reset on the server side
      if (validData.roomId) {
        const success = gameController.resetGame(validData.roomId, socket.data.userId);
        if (!success) {
          socket.emit('game-error', {
            message: "Failed to reset the game.",
            from: 'system',
            gameType: validData.gameType
          });
          return;
        }
        
        // تسجيل إعادة ضبط اللعبة
        console.log(`Game reset in room ${validData.roomId} by player ${socket.data.userId}`);
      }
      
      // Forward reset to partner
      io.to(targetUserInfo.socketId).emit('game-reset', {
        gameType: validData.gameType,
        from: socket.data.userId,
        swapRoles: validData.swapRoles,
        shouldBeCreator: validData.shouldBeCreator,
        roundCount: validData.roundCount,
        guesserScore: validData.guesserScore,
        creatorScore: validData.creatorScore
      });
    } catch (error) {
      console.error('Error in game-reset:', error);
      socket.emit('game-error', {
        message: "Failed to reset the game due to server error.",
        from: 'system',
        gameType: data.gameType
      });
    }
  });
  
  /**
   * Handle start round
   */
  socket.on('game-start-round', (data: GameStartRound) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
          from: 'system',
          gameType: data.gameType
        });
        return;
      }
      
      // Forward start round to partner
      io.to(targetUserInfo.socketId).emit('game-start-round', {
        gameType: data.gameType,
        round: data.round,
        from: socket.data.userId
      });
    } catch (error) {
      console.error('Error in game-start-round:', error);
      socket.emit('game-error', {
        message: "Failed to start game round due to server error.",
        from: 'system',
        gameType: data.gameType
      });
    }
  });
  
  /**
   * Handle word setup for word galaxy
   */
  socket.on('game-word-setup', (data: GameWordSetup) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
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
    } catch (error) {
      console.error('Error in game-word-setup:', error);
      socket.emit('game-error', {
        message: "Failed to set up game due to server error.",
        from: 'system',
        gameType: data.gameType
      });
    }
  });
  
  /**
   * Handle guess result for word galaxy
   */
  socket.on('game-guess-result', (data: GameGuessResult) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        socket.emit('game-error', {
          message: "Could not find your partner. They may have disconnected.",
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
    } catch (error) {
      console.error('Error in game-guess-result:', error);
      socket.emit('game-error', {
        message: "Failed to send guess result due to server error.",
        from: 'system',
        gameType: data.gameType
      });
    }
  });
  
  /**
   * Handle score updates (for games tracking scores)
   */
  socket.on('game-score-update', (data: { gameType: string, to: string, [key: string]: any }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      if (targetUserInfo) {
        io.to(targetUserInfo.socketId).emit('game-score-update', {
          ...data,
          from: socket.data.userId
        });
      }
    } catch (error) {
      console.error('Error in game-score-update:', error);
    }
  });
  
  /**
   * Handle cleanup when a user disconnects
   */
  socket.on('disconnecting', () => {
    try {
      // Get all active rooms
      const allRooms = gameController.getAllActiveRooms();
      
      // Clean up all rooms the user is in
      for (const [roomId, game] of allRooms.entries()) {
        const gameState = game.getState();
        
        if (gameState.players.includes(socket.data.userId)) {
          // Notify the partner
          const partnerId = gameState.players.find((id: string) => id !== socket.data.userId);
          if (partnerId) {
            const partnerInfo = userService.getUserInfo(partnerId);
            if (partnerInfo) {
              io.to(partnerInfo.socketId).emit('game-partner-disconnected', {
        from: socket.data.userId,
                gameType: game.gameType
      });
            }
          }
      
          // Remove player from room
          gameController.leaveGameRoom(roomId, socket.data.userId);
        }
      }
    } catch (error) {
      console.error('Error in game disconnect handling:', error);
    }
  });
  
  /**
   * Handle reconnection to a game
   */
  socket.on('game-reconnect', (data: { roomId: string }) => {
    try {
      // التحقق من وجود معرف الغرفة
      if (!data.roomId) {
        socket.emit('game-error', {
          message: "Room ID is required for reconnection.",
          from: 'system'
        });
        return;
      }
      
      // استخدام آلية إعادة الاتصال في وحدة التحكم باللعبة
      const gameState = gameController.handleReconnection(data.roomId, socket.data.userId, socket.id);
      
      if (!gameState) {
        socket.emit('game-error', {
          message: "Failed to reconnect to the game. The session may have expired.",
          from: 'system'
        });
        return;
      }
      
      // إعادة الاتصال ناجحة، إرسال حالة اللعبة الحالية للمستخدم
      socket.emit('game-reconnect-success', {
        roomId: data.roomId,
        state: gameState
      });
      
      // إعلام اللاعبين الآخرين بإعادة اتصال هذا اللاعب
      const otherPlayers = gameState.players.filter((id: string) => id !== socket.data.userId);
      
      for (const playerId of otherPlayers) {
        const playerInfo = userService.getUserInfo(playerId);
        if (playerInfo) {
          io.to(playerInfo.socketId).emit('game-player-reconnected', {
            roomId: data.roomId,
            playerId: socket.data.userId
          });
        }
      }
      
      console.log(`Player ${socket.data.userId} reconnected to game room ${data.roomId}`);
    } catch (error) {
      console.error('Error in game-reconnect:', error);
      socket.emit('game-error', {
        message: "Failed to reconnect due to server error.",
        from: 'system'
      });
    }
  });
  
  /**
   * Handle game disconnection
   * هذا المعالج يحتفظ بحالة اللعبة عندما ينقطع اتصال اللاعب مؤقتًا
   */
  socket.on('game-disconnect', (data: { roomId: string, temporary?: boolean }) => {
    try {
      const userId = socket.data.userId;
      if (!userId || !data.roomId) return;
      
      const game = gameController.getGameByRoom(data.roomId);
      if (!game) return;
      
      const players = game.getState().players;
      
      // التحقق مما إذا كان المستخدم في هذه اللعبة
      if (players.includes(userId)) {
        // إذا كان الانقطاع مؤقتًا، نسجله فقط
        if (data.temporary) {
          console.log(`Player ${userId} temporarily disconnected from game room ${data.roomId}`);
          
          // إبلاغ اللاعب الآخر بانقطاع الاتصال المؤقت
          const otherPlayer = players.find((id: string) => id !== userId);
          if (otherPlayer) {
            const otherPlayerInfo = userService.getUserInfo(otherPlayer);
            if (otherPlayerInfo) {
              io.to(otherPlayerInfo.socketId).emit('game-partner-disconnected', {
                roomId: data.roomId,
                playerId: userId,
                temporary: true
              });
            }
          }
        } else {
          // الانقطاع الدائم، مغادرة اللعبة
          console.log(`Player ${userId} permanently left game room ${data.roomId}`);
          
          // إبلاغ اللاعب الآخر بمغادرة اللاعب
          const otherPlayer = players.find((id: string) => id !== userId);
          if (otherPlayer) {
            const otherPlayerInfo = userService.getUserInfo(otherPlayer);
            if (otherPlayerInfo) {
              io.to(otherPlayerInfo.socketId).emit('game-partner-left', {
                roomId: data.roomId,
                playerId: userId,
                from: userId
              });
            }
          }
          
          // معالجة مغادرة اللاعب للعبة
          gameController.leaveGameRoom(data.roomId, userId);
        }
      }
    } catch (error) {
      console.error('Error in game-disconnect:', error);
    }
  });
  
  /**
   * أيضًا مراقبة حدث disconnect العام لتسجيل انقطاع الاتصال للألعاب
   */
  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (!userId) return;
    
    const rooms = gameController.getAllActiveRooms();
    
    for (const [roomId, game] of rooms.entries()) {
      const players = game.getState().players;
      
      // التحقق مما إذا كان المستخدم في هذه اللعبة
      if (players.includes(userId)) {
        // تسجيل انقطاع الاتصال
        console.log(`Player ${userId} disconnected from game room ${roomId}`);
        
        // إبلاغ اللاعب الآخر بانقطاع الاتصال المؤقت
        const otherPlayer = players.find((id: string) => id !== userId);
        if (otherPlayer) {
          const otherPlayerInfo = userService.getUserInfo(otherPlayer);
          if (otherPlayerInfo) {
            io.to(otherPlayerInfo.socketId).emit('game-partner-disconnected', {
              roomId,
              playerId: userId,
              temporary: true // علامة تشير إلى أن هذا انقطاع مؤقت وقد يعود اللاعب
            });
          }
        }
        
        // تسجيل الانقطاع في خدمة حالة اللعبة لإمكانية إعادة الاتصال
        gameService.recordDisconnection(userId);
      }
    }
  });
  
  /**
   * Handle game notifications between players
   */
  socket.on('game-notification', (data: { gameType: string, to: string, message: string, type?: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        console.log(`Cannot send game notification: target user ${data.to} not found`);
        return;
      }
      
      // Forward notification to target user
      io.to(targetUserInfo.socketId).emit('game-notification', {
        gameType: data.gameType,
        message: data.message,
        type: data.type || 'info',
        from: socket.data.userId
      });
      
      console.log(`Game notification sent from ${socket.data.userId} to ${data.to}: ${data.message}`);
    } catch (error) {
      console.error('Error in game-notification:', error);
    }
  });

  /**
   * Handle game ping (connection check)
   */
  socket.on('game-ping', (data: { to: string, gameType: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      // إذا كان المستخدم المستهدف متصلاً، أرسل له الـ ping
      if (targetUserInfo) {
        io.to(targetUserInfo.socketId).emit('game-ping', {
          from: socket.data.userId,
          gameType: data.gameType
        });
        
        console.log(`Game ping sent from ${socket.data.userId} to ${data.to}`);
      }
    } catch (error) {
      console.error('Error in game-ping:', error);
    }
  });

  /**
   * Handle game pong (connection check response)
   */
  socket.on('game-pong', (data: { to: string, gameType: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      // إذا كان المستخدم المستهدف متصلاً، أرسل له الـ pong
      if (targetUserInfo) {
        io.to(targetUserInfo.socketId).emit('game-pong', {
          from: socket.data.userId,
          gameType: data.gameType
        });
        
        console.log(`Game pong sent from ${socket.data.userId} to ${data.to}`);
      }
    } catch (error) {
      console.error('Error in game-pong:', error);
    }
  });

  /**
   * Handle game invitation cancellation
   */
  socket.on('game-invite-cancel', (data: { to: string; inviteId: string; gameType: string }) => {
    try {
      const targetUserInfo = userService.getUserInfo(data.to);
      
      if (!targetUserInfo) {
        // Target is not connected, no need to forward the cancellation
        return;
      }
      
      // Forward cancellation to partner with all necessary data
      io.to(targetUserInfo.socketId).emit('game-invite-cancel', {
        from: socket.data.userId,
        inviteId: data.inviteId,
        gameType: data.gameType
      });
      
      // Remove any pending game state associated with this invitation
      // This ensures that when a new invitation is sent, there's no conflict
      const userIds = [socket.data.userId, data.to].sort();
      const potentialRoomId = `${data.gameType}-${userIds[0]}-${userIds[1]}`;
      
      // Clean up any existing game room with this ID
      const existingGame = gameController.getGameByRoom(potentialRoomId);
      if (existingGame) {
        gameController.destroyGameRoom(potentialRoomId);
        console.log(`Cleaned up game room ${potentialRoomId} after invitation cancellation`);
      }
      
      console.log(`Game invite cancelled: ${socket.data.userId} cancelled invitation ${data.inviteId} to ${data.to}`);
    } catch (error) {
      console.error('Error in game-invite-cancel:', error);
    }
  });
};
