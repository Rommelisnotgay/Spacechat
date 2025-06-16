"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseGame = void 0;
const GameRoom_1 = require("./models/GameRoom");
/**
 * فئة أساسية تنفذ الوظائف المشتركة بين جميع الألعاب
 */
class BaseGame {
    constructor() {
        this.io = null;
        this.rooms = new Map();
    }
    /**
     * تهيئة اللعبة
     * @param io خادم Socket.IO
     */
    initialize(io) {
        this.io = io;
        console.log(`[${this.gameType}] تم تهيئة اللعبة`);
    }
    /**
     * إنشاء غرفة لعب جديدة
     * @param roomId معرف الغرفة
     * @param creatorId معرف منشئ الغرفة
     * @returns هل تم إنشاء الغرفة بنجاح
     */
    createRoom(roomId, creatorId) {
        // تحقق مما إذا كانت الغرفة موجودة بالفعل
        if (this.rooms.has(roomId)) {
            return false;
        }
        // إنشاء غرفة جديدة
        const room = {
            roomId,
            gameType: this.gameType,
            players: [creatorId],
            gameState: GameRoom_1.GameState.WAITING,
            lastActivity: Date.now(),
            gameData: this.getInitialGameData()
        };
        this.rooms.set(roomId, room);
        console.log(`[${this.gameType}] تم إنشاء غرفة جديدة: ${roomId}`);
        return true;
    }
    /**
     * انضمام لاعب إلى غرفة لعب
     * @param roomId معرف الغرفة
     * @param playerId معرف اللاعب
     * @returns هل تم الانضمام بنجاح
     */
    joinRoom(roomId, playerId) {
        // تحقق من وجود الغرفة
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }
        // تحقق مما إذا كان اللاعب موجودًا بالفعل في الغرفة
        if (room.players.includes(playerId)) {
            return true; // اللاعب موجود بالفعل
        }
        // تحقق مما إذا كانت الغرفة ممتلئة
        if (room.players.length >= this.getMaxPlayers()) {
            return false;
        }
        // إضافة اللاعب إلى الغرفة
        room.players.push(playerId);
        room.lastActivity = Date.now();
        // تحديث حالة الغرفة إذا كان عدد اللاعبين كافيًا للعب
        if (room.players.length >= this.getMinPlayers()) {
            room.gameState = GameRoom_1.GameState.PLAYING;
        }
        console.log(`[${this.gameType}] انضم اللاعب ${playerId} إلى الغرفة: ${roomId}`);
        return true;
    }
    /**
     * مغادرة لاعب للغرفة
     * @param roomId معرف الغرفة
     * @param playerId معرف اللاعب
     */
    leaveRoom(roomId, playerId) {
        // تحقق من وجود الغرفة
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        // إزالة اللاعب من الغرفة
        room.players = room.players.filter(id => id !== playerId);
        room.lastActivity = Date.now();
        // تحديث حالة الغرفة
        if (room.players.length < this.getMinPlayers()) {
            room.gameState = GameRoom_1.GameState.ABANDONED;
        }
        // إزالة الغرفة إذا كانت فارغة
        if (room.players.length === 0) {
            this.rooms.delete(roomId);
            console.log(`[${this.gameType}] تم حذف الغرفة الفارغة: ${roomId}`);
        }
        else {
            console.log(`[${this.gameType}] غادر اللاعب ${playerId} الغرفة: ${roomId}`);
        }
    }
    /**
     * إعادة ضبط اللعبة
     * @param roomId معرف الغرفة
     * @param playerId معرف اللاعب
     * @returns هل تمت إعادة الضبط بنجاح
     */
    resetGame(roomId, playerId) {
        // تحقق من وجود الغرفة
        const room = this.rooms.get(roomId);
        if (!room) {
            return false;
        }
        // تحقق مما إذا كان اللاعب في الغرفة
        if (!room.players.includes(playerId)) {
            return false;
        }
        // إعادة ضبط بيانات اللعبة
        room.gameData = this.getInitialGameData();
        room.gameState = GameRoom_1.GameState.PLAYING;
        room.lastActivity = Date.now();
        console.log(`[${this.gameType}] تم إعادة ضبط اللعبة في الغرفة: ${roomId}`);
        return true;
    }
    /**
     * التحقق من حالة اللعبة
     * @param roomId معرف الغرفة
     * @returns حالة اللعبة الحالية أو null إذا لم تكن الغرفة موجودة
     */
    getGameState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }
        return {
            roomId: room.roomId,
            gameType: room.gameType,
            gameState: room.gameState,
            players: room.players,
            gameData: room.gameData
        };
    }
    /**
     * تنظيف الغرف غير النشطة
     * @param maxInactiveTime الحد الأقصى لوقت عدم النشاط بالمللي ثانية
     */
    cleanupInactiveRooms(maxInactiveTime) {
        const currentTime = Date.now();
        let cleanupCount = 0;
        this.rooms.forEach((room, roomId) => {
            if (currentTime - room.lastActivity > maxInactiveTime) {
                this.rooms.delete(roomId);
                cleanupCount++;
            }
        });
        if (cleanupCount > 0) {
            console.log(`[${this.gameType}] تم تنظيف ${cleanupCount} غرف غير نشطة`);
        }
    }
    /**
     * الحصول على الحد الأدنى لعدد اللاعبين المطلوبين للعبة
     * @returns الحد الأدنى لعدد اللاعبين
     */
    getMinPlayers() {
        return 2;
    }
    /**
     * الحصول على الحد الأقصى لعدد اللاعبين المسموح به في الغرفة
     * @returns الحد الأقصى لعدد اللاعبين
     */
    getMaxPlayers() {
        return 2;
    }
    /**
     * الحصول على جميع الغرف النشطة
     * @returns خريطة الغرف النشطة
     */
    getAllRooms() {
        return this.rooms;
    }
}
exports.BaseGame = BaseGame;
