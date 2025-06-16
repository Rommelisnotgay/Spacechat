"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameService = void 0;
const types_1 = require("../models/types");
/**
 * خدمة إدارة الألعاب - مسؤولة عن إدارة غرف الألعاب وحالاتها
 */
class GameService {
    constructor() {
        this.reconnectTimeout = 2 * 60 * 1000; // دقيقتان
        this.gameRooms = new Map();
        this.gameHistories = new Map();
        this.reconnections = new Map();
        this.io = null;
        // تنظيف الغرف القديمة كل 10 دقائق (600000 مللي ثانية)
        setInterval(() => this.cleanupInactiveRooms(), 600000);
    }
    /**
     * تعيين مثيل السوكت للإرسال
     */
    setSocketServer(io) {
        this.io = io;
    }
    /**
     * التحقق مما إذا كانت اللعبة مدعومة
     */
    isGameSupported(gameType) {
        return types_1.IMPLEMENTED_GAMES.includes(gameType);
    }
    /**
     * إنشاء غرفة لعب جديدة
     */
    createGameRoom(roomId, gameType, creatorId) {
        const room = {
            gameType,
            players: [creatorId],
            createdAt: Date.now(),
            state: {}
        };
        this.gameRooms.set(roomId, room);
        console.log(`Game room created: ${roomId} for game ${gameType}`);
        return room;
    }
    /**
     * الانضمام إلى غرفة لعب موجودة
     */
    joinGameRoom(roomId, userId) {
        const room = this.gameRooms.get(roomId);
        if (!room) {
            return null;
        }
        // إضافة اللاعب إلى الغرفة إذا لم يكن موجودًا بالفعل
        if (!room.players.includes(userId)) {
            room.players.push(userId);
        }
        console.log(`Player ${userId} joined game room: ${roomId}`);
        return room;
    }
    /**
     * مغادرة غرفة لعب
     */
    leaveGameRoom(roomId, userId) {
        const room = this.gameRooms.get(roomId);
        if (!room) {
            return false;
        }
        // إزالة اللاعب من الغرفة
        const playerIndex = room.players.indexOf(userId);
        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
        }
        // إذا لم يتبق أي لاعبين، قم بإزالة الغرفة
        if (room.players.length === 0) {
            this.gameRooms.delete(roomId);
            this.gameHistories.delete(roomId); // حذف تاريخ اللعبة أيضًا
            console.log(`Game room deleted: ${roomId}`);
        }
        console.log(`Player ${userId} left game room: ${roomId}`);
        return true;
    }
    /**
     * الحصول على غرفة لعب
     */
    getGameRoom(roomId) {
        return this.gameRooms.get(roomId);
    }
    /**
     * تحديث حالة اللعبة
     */
    updateGameState(roomId, state, moveId = '') {
        const room = this.gameRooms.get(roomId);
        if (!room) {
            return false;
        }
        room.state = state;
        // تسجيل الحالة في التاريخ إذا تم تقديم معرف الحركة
        if (moveId) {
            this.recordGameState(roomId, state, moveId);
        }
        return true;
    }
    /**
     * تسجيل حالة اللعبة في التاريخ
     */
    recordGameState(roomId, state, moveId) {
        if (!this.gameHistories.has(roomId)) {
            this.gameHistories.set(roomId, []);
        }
        const history = this.gameHistories.get(roomId);
        const timestamp = Date.now();
        history.push({
            timestamp,
            state: { ...state },
            moveId
        });
        // الاحتفاظ بآخر 20 حالة فقط
        if (history.length > 20) {
            history.shift();
        }
    }
    /**
     * تسجيل انقطاع اتصال لاعب
     */
    recordDisconnection(userId) {
        this.reconnections.set(userId, {
            userId,
            timestamp: Date.now(),
            socketId: null
        });
        setTimeout(() => {
            this.cleanupReconnectionData(userId);
        }, this.reconnectTimeout);
    }
    /**
     * تسجيل إعادة اتصال لاعب
     */
    recordReconnection(userId, socketId) {
        const reconnectData = this.reconnections.get(userId);
        if (!reconnectData) {
            return false;
        }
        // تحديث معرف السوكت
        reconnectData.socketId = socketId;
        this.reconnections.set(userId, reconnectData);
        return true;
    }
    /**
     * تنظيف بيانات إعادة الاتصال
     */
    cleanupReconnectionData(userId) {
        if (this.reconnections.has(userId)) {
            const reconnectData = this.reconnections.get(userId);
            // إزالة البيانات فقط إذا لم يعد المستخدم متصلاً
            if (!reconnectData.socketId) {
                this.reconnections.delete(userId);
            }
        }
    }
    /**
     * إعادة ضبط اللعبة
     */
    resetGame(roomId) {
        const room = this.gameRooms.get(roomId);
        if (!room) {
            return false;
        }
        room.state = {};
        return true;
    }
    /**
     * تنظيف الغرف غير النشطة
     */
    cleanupInactiveRooms() {
        const now = Date.now();
        const expirationTime = 30 * 60 * 1000; // 30 دقيقة بالمللي ثانية
        let removedCount = 0;
        for (const [roomId, room] of this.gameRooms.entries()) {
            // إزالة الغرف القديمة
            if (now - room.createdAt > expirationTime) {
                this.gameRooms.delete(roomId);
                this.gameHistories.delete(roomId);
                removedCount++;
            }
        }
        if (removedCount > 0) {
            console.log(`Cleaned up ${removedCount} inactive game rooms. Active rooms: ${this.gameRooms.size}`);
        }
    }
    /**
     * إرسال خطأ في اللعبة
     */
    sendGameError(socketId, error) {
        if (this.io) {
            this.io.to(socketId).emit('game-error', error);
        }
    }
    /**
     * الحصول على جميع الغرف النشطة
     */
    getAllActiveRooms() {
        return this.gameRooms;
    }
    /**
     * الحصول على عدد الغرف النشطة
     */
    getActiveRoomsCount() {
        return this.gameRooms.size;
    }
    /**
     * الحصول على آخر عدد محدد من الحركات
     * @param roomId - معرف غرفة اللعبة
     * @param count - عدد الحركات المطلوبة
     * @returns مصفوفة من الحركات الأخيرة
     */
    getLastMoves(roomId, count) {
        const history = this.gameHistories.get(roomId);
        if (!history || history.length === 0) {
            return [];
        }
        // إرجاع آخر 'count' حركات
        return history.slice(-Math.min(count, history.length))
            .filter(item => item.moveId.startsWith('move-'));
    }
    /**
     * تنظيف بيانات اللعبة
     * @param roomId - معرف غرفة اللعبة
     */
    cleanupGameData(roomId) {
        this.gameHistories.delete(roomId);
    }
}
// إنشاء مثيل واحد للخدمة (Singleton pattern)
exports.gameService = new GameService();
