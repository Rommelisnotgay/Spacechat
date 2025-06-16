"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RockPaperScissorsGame = void 0;
const BaseGame_1 = require("./BaseGame");
const GameRoom_1 = require("./models/GameRoom");
/**
 * تنفيذ لعبة Rock Paper Scissors
 */
class RockPaperScissorsGame extends BaseGame_1.BaseGame {
    constructor() {
        super(...arguments);
        this.gameType = 'rock-paper-scissors';
    }
    /**
     * معالجة حركة (اختيار) في اللعبة
     * @param roomId معرف الغرفة
     * @param playerId معرف اللاعب
     * @param move البيانات المرسلة (الاختيار)
     * @returns نتيجة معالجة الحركة
     */
    processMove(roomId, playerId, move) {
        // التحقق من صحة الغرفة
        const room = this.rooms.get(roomId);
        if (!room || room.gameState !== GameRoom_1.GameState.PLAYING) {
            return {
                success: false,
                error: 'الغرفة غير صالحة أو اللعبة غير نشطة'
            };
        }
        // التحقق من أن اللاعب في الغرفة
        if (!room.players.includes(playerId)) {
            return {
                success: false,
                error: 'اللاعب غير موجود في الغرفة'
            };
        }
        const gameData = room.gameData;
        // التحقق من رقم الجولة
        if (move.round !== gameData.round) {
            return {
                success: false,
                error: 'رقم الجولة غير متطابق'
            };
        }
        // التحقق من صحة الاختيار
        const validChoices = ['rock', 'paper', 'scissors'];
        if (!validChoices.includes(move.choice)) {
            return {
                success: false,
                error: 'اختيار غير صالح'
            };
        }
        // تسجيل الاختيار
        gameData.playerChoices[playerId] = move.choice;
        gameData.lastMoveTime = Date.now();
        room.lastActivity = Date.now();
        // التحقق مما إذا كان جميع اللاعبين قد اختاروا
        const allPlayersChose = room.players.every(playerId => gameData.playerChoices[playerId] !== null);
        // إذا اختار جميع اللاعبين، حساب النتيجة
        if (allPlayersChose) {
            const result = this.calculateRoundResult(room.players, gameData.playerChoices);
            // تحديث النتيجة والنقاط
            gameData.roundResult = result;
            // إضافة النتيجة إلى السجل
            gameData.roundsHistory.push({ ...result });
            // زيادة النقاط للفائز
            if (result.winner !== 'draw') {
                gameData.scores[result.winner] = (gameData.scores[result.winner] || 0) + 1;
            }
            // إعادة تعيين الاختيارات للجولة القادمة
            gameData.round += 1;
            room.players.forEach(playerId => {
                gameData.playerChoices[playerId] = null;
            });
        }
        return {
            success: true,
            allPlayersChose,
            result: allPlayersChose ? gameData.roundResult : null,
            scores: gameData.scores,
            round: gameData.round,
            waitingFor: this.getWaitingForPlayers(room.players, gameData.playerChoices)
        };
    }
    /**
     * حساب نتيجة الجولة
     * @param players قائمة اللاعبين
     * @param choices اختيارات اللاعبين
     * @returns نتيجة الجولة
     */
    calculateRoundResult(players, choices) {
        // استخراج اختيارات اللاعبين (يفترض وجود لاعبين فقط)
        const player1 = players[0];
        const player2 = players[1];
        const choice1 = choices[player1];
        const choice2 = choices[player2];
        // تنسيق النتيجة
        const resultChoices = {
            [player1]: choice1,
            [player2]: choice2
        };
        // حساب الفائز
        if (choice1 === choice2) {
            // تعادل
            return {
                winner: 'draw',
                choices: resultChoices
            };
        }
        // حساب الفائز بناءً على قواعد اللعبة
        if ((choice1 === 'rock' && choice2 === 'scissors') ||
            (choice1 === 'paper' && choice2 === 'rock') ||
            (choice1 === 'scissors' && choice2 === 'paper')) {
            // فاز اللاعب الأول
            return {
                winner: player1,
                choices: resultChoices
            };
        }
        else {
            // فاز اللاعب الثاني
            return {
                winner: player2,
                choices: resultChoices
            };
        }
    }
    /**
     * الحصول على قائمة اللاعبين الذين لم يختاروا بعد
     * @param players قائمة اللاعبين
     * @param choices اختيارات اللاعبين
     * @returns قائمة اللاعبين الذين لم يختاروا بعد
     */
    getWaitingForPlayers(players, choices) {
        return players.filter(playerId => choices[playerId] === null);
    }
    /**
     * الحصول على البيانات الأولية للعبة
     * @returns البيانات الأولية للعبة
     */
    getInitialGameData() {
        return {
            round: 1,
            playerChoices: {},
            roundResult: null,
            scores: {},
            roundsHistory: [],
            lastMoveTime: Date.now()
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
            if (room) {
                const gameData = room.gameData;
                // تهيئة بيانات اللاعب
                gameData.playerChoices[playerId] = null;
                gameData.scores[playerId] = 0;
            }
        }
        return joined;
    }
    /**
     * تنظيف الغرف غير النشطة مع مراقبة خاصة للعبة
     * @override
     * @param maxInactiveTime الحد الأقصى لوقت عدم النشاط بالمللي ثانية
     */
    cleanupInactiveRooms(maxInactiveTime) {
        const currentTime = Date.now();
        const moveTimeout = 5 * 60 * 1000; // 5 دقائق كحد أقصى للحركة
        this.rooms.forEach((room, roomId) => {
            if (currentTime - room.lastActivity > maxInactiveTime) {
                this.rooms.delete(roomId);
                console.log(`[${this.gameType}] تم حذف غرفة غير نشطة: ${roomId}`);
            }
            else if (room.gameState === GameRoom_1.GameState.PLAYING) {
                // مراقبة إضافية للغرف النشطة في حالة اللعب
                const gameData = room.gameData;
                // التحقق مما إذا كان هناك أي لاعب لم يتحرك لفترة طويلة
                if (currentTime - gameData.lastMoveTime > moveTimeout) {
                    // تعيين حالة الغرفة على أنها مهجورة إذا كانت غير نشطة لفترة طويلة
                    room.gameState = GameRoom_1.GameState.ABANDONED;
                    console.log(`[${this.gameType}] تم تعيين غرفة على أنها مهجورة لعدم النشاط: ${roomId}`);
                }
            }
        });
    }
}
exports.RockPaperScissorsGame = RockPaperScissorsGame;
