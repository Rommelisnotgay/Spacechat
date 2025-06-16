"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameStateService = exports.GameStateService = void 0;
/**
 * خدمة إدارة حالة اللعبة
 * تتعامل مع تزامن الحالة، التعافي من انقطاع الاتصال، وتاريخ الحركات
 */
class GameStateService {
    constructor() {
        // خريطة تخزن تاريخ الحالات للألعاب (roomId -> history[])
        this.gameHistories = new Map();
        // خريطة تخزن حركات اللعبة (roomId -> moves[])
        this.gameMoves = new Map();
        // خريطة تخزن بيانات إعادة الاتصال المؤقتة (userId -> reconnectionData)
        this.reconnections = new Map();
        // وقت الانتظار لإعادة الاتصال بالمللي ثانية (2 دقيقة)
        this.reconnectTimeout = 2 * 60 * 1000;
        // الحد الأقصى لعدد الحالات المحفوظة في التاريخ لكل غرفة
        this.maxHistoryLength = 20;
        // الحد الأقصى لعدد الحركات المحفوظة لكل غرفة
        this.maxMovesLength = 50;
    }
    /**
     * تسجيل حالة اللعبة الحالية في التاريخ
     * @param roomId - معرف غرفة اللعبة
     * @param state - حالة اللعبة الحالية
     * @param moveId - معرف الحركة (يمكن أن يكون معرف المستخدم + الطابع الزمني)
     */
    recordGameState(roomId, state, moveId) {
        if (!this.gameHistories.has(roomId)) {
            this.gameHistories.set(roomId, []);
        }
        const history = this.gameHistories.get(roomId);
        // استخراج معرف اللاعب من moveId إذا كان ذلك ممكنًا
        let playerId = '';
        if (moveId.startsWith('move-')) {
            const parts = moveId.split('-');
            if (parts.length > 1) {
                playerId = parts[1];
            }
        }
        // إضافة الحالة الجديدة مع الطابع الزمني
        const timestamp = Date.now();
        history.push({
            timestamp,
            state: { ...state }, // نسخة عميقة من حالة اللعبة
            moveId
        });
        // تقييد طول التاريخ
        if (history.length > this.maxHistoryLength) {
            history.shift(); // إزالة أقدم حالة
        }
        this.gameHistories.set(roomId, history);
        // إذا كانت هذه حركة، سجلها أيضًا في سجل الحركات
        if (moveId.startsWith('move-') && playerId) {
            this.recordMove(roomId, playerId, state, moveId, timestamp);
        }
    }
    /**
     * تسجيل حركة في اللعبة
     * @param roomId - معرف غرفة اللعبة
     * @param playerId - معرف اللاعب
     * @param state - حالة اللعبة بعد الحركة
     * @param moveId - معرف الحركة
     * @param timestamp - الطابع الزمني
     */
    recordMove(roomId, playerId, state, moveId, timestamp) {
        if (!this.gameMoves.has(roomId)) {
            this.gameMoves.set(roomId, []);
        }
        const moves = this.gameMoves.get(roomId);
        // استخراج بيانات الحركة من الحالة
        let moveData = {};
        if (state.lastMove !== undefined) {
            moveData = { index: state.lastMove };
        }
        // إضافة الحركة الجديدة
        moves.push({
            playerId,
            moveData,
            timestamp,
            moveId
        });
        // تقييد طول سجل الحركات
        if (moves.length > this.maxMovesLength) {
            moves.shift(); // إزالة أقدم حركة
        }
        this.gameMoves.set(roomId, moves);
    }
    /**
     * الحصول على آخر عدد محدد من الحركات
     * @param roomId - معرف غرفة اللعبة
     * @param count - عدد الحركات المطلوبة
     * @returns مصفوفة من الحركات الأخيرة
     */
    getLastMoves(roomId, count) {
        const moves = this.gameMoves.get(roomId);
        if (!moves || moves.length === 0) {
            return [];
        }
        // إرجاع آخر 'count' حركات
        return moves.slice(-Math.min(count, moves.length));
    }
    /**
     * الحصول على آخر حالة للعبة من التاريخ
     * @param roomId - معرف غرفة اللعبة
     * @returns آخر حالة أو null إذا لم يتم العثور عليها
     */
    getLastGameState(roomId) {
        const history = this.gameHistories.get(roomId);
        if (!history || history.length === 0) {
            return null;
        }
        return history[history.length - 1];
    }
    /**
     * الحصول على حالة اللعبة في وقت معين أو بالقرب منه
     * @param roomId - معرف غرفة اللعبة
     * @param timestamp - الوقت المستهدف
     * @returns حالة اللعبة المتطابقة أو null
     */
    getGameStateAtTime(roomId, timestamp) {
        const history = this.gameHistories.get(roomId);
        if (!history || history.length === 0) {
            return null;
        }
        // البحث عن أقرب حالة للوقت المحدد
        let closest = history[0];
        let closestDiff = Math.abs(history[0].timestamp - timestamp);
        for (const state of history) {
            const diff = Math.abs(state.timestamp - timestamp);
            if (diff < closestDiff) {
                closest = state;
                closestDiff = diff;
            }
        }
        return closest;
    }
    /**
     * تسجيل انقطاع اتصال لاعب
     * @param userId - معرف المستخدم المنقطع
     */
    recordDisconnection(userId) {
        this.reconnections.set(userId, {
            userId,
            timestamp: Date.now(),
            socketId: null
        });
        // يمكن هنا جدولة مهمة لإزالة بيانات إعادة الاتصال بعد المهلة
        setTimeout(() => {
            this.cleanupReconnectionData(userId);
        }, this.reconnectTimeout);
    }
    /**
     * تسجيل إعادة اتصال لاعب
     * @param userId - معرف المستخدم
     * @param socketId - معرف Socket الجديد
     * @returns true إذا نجحت إعادة الاتصال، false إذا انتهت المهلة
     */
    recordReconnection(userId, socketId) {
        const reconnectData = this.reconnections.get(userId);
        if (!reconnectData) {
            return false; // لم يتم تسجيل انقطاع لهذا المستخدم
        }
        // التحقق مما إذا كان الوقت ضمن المهلة
        if (Date.now() - reconnectData.timestamp > this.reconnectTimeout) {
            this.reconnections.delete(userId);
            return false;
        }
        // تحديث معرف Socket
        reconnectData.socketId = socketId;
        this.reconnections.set(userId, reconnectData);
        return true;
    }
    /**
     * حذف بيانات إعادة الاتصال المنتهية الصلاحية
     * @param userId - معرف المستخدم
     */
    cleanupReconnectionData(userId) {
        const reconnectData = this.reconnections.get(userId);
        if (reconnectData && Date.now() - reconnectData.timestamp > this.reconnectTimeout) {
            this.reconnections.delete(userId);
        }
    }
    /**
     * حذف بيانات اللعبة والتاريخ عند انتهاء اللعبة
     * @param roomId - معرف غرفة اللعبة
     */
    cleanupGameData(roomId) {
        this.gameHistories.delete(roomId);
        this.gameMoves.delete(roomId);
    }
    /**
     * الحصول على إحصائيات اللعبة
     * @param roomId - معرف غرفة اللعبة
     * @returns إحصائيات اللعبة
     */
    getGameStats(roomId) {
        const moves = this.gameMoves.get(roomId) || [];
        const history = this.gameHistories.get(roomId) || [];
        if (history.length === 0) {
            return {
                totalMoves: 0,
                gameTime: 0,
                movesByPlayer: {}
            };
        }
        // حساب إجمالي الحركات
        const totalMoves = moves.length;
        // حساب وقت اللعبة
        let gameTime = 0;
        const firstState = history[0];
        const lastState = history[history.length - 1];
        if (firstState && lastState) {
            gameTime = Math.round((lastState.timestamp - firstState.timestamp) / 1000);
        }
        // حساب الحركات لكل لاعب
        const movesByPlayer = {};
        moves.forEach(move => {
            movesByPlayer[move.playerId] = (movesByPlayer[move.playerId] || 0) + 1;
        });
        // إضافة معلومات إضافية
        const latestState = lastState?.state || {};
        return {
            totalMoves,
            gameTime,
            movesByPlayer,
            winningCells: latestState.winningCells || [],
            winner: latestState.winner || null,
            isDraw: latestState.isDraw || false,
            gameOver: latestState.gameOver || false
        };
    }
}
exports.GameStateService = GameStateService;
// كائن singleton للخدمة
exports.gameStateService = new GameStateService();
