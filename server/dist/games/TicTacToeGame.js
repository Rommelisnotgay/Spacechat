"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicTacToeGame = void 0;
const BaseGame_1 = require("./BaseGame");
const GameRoom_1 = require("./models/GameRoom");
/**
 * تنفيذ لعبة TicTacToe
 */
class TicTacToeGame extends BaseGame_1.BaseGame {
    constructor() {
        super(...arguments);
        this.gameType = 'tic-tac-toe';
    }
    /**
     * معالجة حركة في اللعبة
     * @param roomId معرف الغرفة
     * @param playerId معرف اللاعب
     * @param move رقم المربع (0-8)
     * @returns نتيجة الحركة
     */
    processMove(roomId, playerId, move) {
        // التحقق من صحة الغرفة
        const room = this.rooms.get(roomId);
        if (!room || room.gameState !== GameRoom_1.GameState.PLAYING) {
            return { success: false, error: 'الغرفة غير صالحة أو اللعبة غير نشطة' };
        }
        // التحقق من أن اللاعب في الغرفة
        if (!room.players.includes(playerId)) {
            return { success: false, error: 'اللاعب غير موجود في الغرفة' };
        }
        const gameData = room.gameData;
        // التحقق من أن الدور هو دور اللاعب الحالي
        if (playerId !== gameData.currentPlayer) {
            return { success: false, error: 'ليس دورك' };
        }
        // التحقق من صحة الحركة
        if (move < 0 || move > 8 || gameData.board[move] !== '') {
            return { success: false, error: 'حركة غير صالحة' };
        }
        // تنفيذ الحركة
        const playerSymbol = gameData.symbols[playerId];
        gameData.board[move] = playerSymbol;
        // التحقق من الفائز
        const winner = this.checkWinner(gameData.board);
        if (winner) {
            // هناك فائز
            room.gameState = GameRoom_1.GameState.COMPLETED;
            gameData.winnerId = playerId;
        }
        else if (this.isBoardFull(gameData.board)) {
            // تعادل
            room.gameState = GameRoom_1.GameState.COMPLETED;
            gameData.isDraw = true;
        }
        else {
            // تغيير اللاعب الحالي
            const otherPlayerId = room.players.find(id => id !== playerId);
            if (otherPlayerId) {
                gameData.currentPlayer = otherPlayerId;
            }
        }
        // تحديث وقت آخر نشاط
        room.lastActivity = Date.now();
        return {
            success: true,
            gameState: room.gameState,
            move,
            board: gameData.board,
            winnerId: gameData.winnerId,
            isDraw: gameData.isDraw,
            currentPlayer: gameData.currentPlayer
        };
    }
    /**
     * الحصول على البيانات الأولية للعبة
     */
    getInitialGameData() {
        return {
            board: ['', '', '', '', '', '', '', '', ''],
            currentPlayer: '', // سيتم تحديده عند انضمام اللاعب الثاني
            winnerId: null,
            isDraw: false,
            symbols: {} // سيتم تحديدها عند انضمام اللاعبين
        };
    }
    /**
     * معالجة انضمام لاعب إلى الغرفة
     * @override
     */
    joinRoom(roomId, playerId) {
        const joined = super.joinRoom(roomId, playerId);
        if (joined) {
            const room = this.rooms.get(roomId);
            if (room && room.players.length === 2) {
                const gameData = room.gameData;
                // تعيين رموز اللاعبين
                gameData.symbols[room.players[0]] = 'X';
                gameData.symbols[room.players[1]] = 'O';
                // تعيين اللاعب الأول (X) ليبدأ
                gameData.currentPlayer = room.players[0];
            }
        }
        return joined;
    }
    /**
     * التحقق من وجود فائز في اللعبة
     * @param board لوح اللعبة
     * @returns رمز الفائز أو null إذا لم يكن هناك فائز
     */
    checkWinner(board) {
        // أنماط الفوز
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // أفقي
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // عمودي
            [0, 4, 8], [2, 4, 6] // قطري
        ];
        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        return null;
    }
    /**
     * التحقق مما إذا كان اللوح ممتلئًا
     * @param board لوح اللعبة
     * @returns هل اللوح ممتلئ
     */
    isBoardFull(board) {
        return !board.includes('');
    }
}
exports.TicTacToeGame = TicTacToeGame;
