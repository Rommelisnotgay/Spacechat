"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameFactory = void 0;
const TicTacToeGame_1 = require("./TicTacToeGame");
const RockPaperScissorsGame_1 = require("./RockPaperScissorsGame");
const WordGalaxyGame_1 = require("./WordGalaxyGame");
/**
 * المصنع المسؤول عن إنشاء ألعاب من أنواع مختلفة
 */
class GameFactory {
    /**
     * إنشاء لعبة جديدة من النوع المحدد
     * @param gameType نوع اللعبة المطلوب إنشاؤها
     * @returns كائن اللعبة أو null إذا كان النوع غير مدعوم
     */
    static createGame(gameType) {
        const GameClass = this.supportedGames[gameType];
        if (!GameClass) {
            console.error(`Game type not supported: ${gameType}`);
            return null;
        }
        try {
            return new GameClass();
        }
        catch (error) {
            console.error(`Error creating game of type ${gameType}:`, error);
            return null;
        }
    }
    /**
     * التحقق من دعم نوع لعبة معين
     * @param gameType نوع اللعبة للتحقق منه
     * @returns true إذا كان النوع مدعومًا، false خلاف ذلك
     */
    static isGameSupported(gameType) {
        return gameType in this.supportedGames;
    }
    /**
     * الحصول على قائمة بجميع أنواع الألعاب المدعومة
     * @returns مصفوفة من أنواع الألعاب المدعومة
     */
    static getSupportedGameTypes() {
        return Object.keys(this.supportedGames);
    }
    /**
     * الحصول على معلومات حول لعبة معينة
     * @param gameType نوع اللعبة
     * @returns كائن يحتوي على معلومات اللعبة أو null إذا كان النوع غير مدعوم
     */
    static getGameInfo(gameType) {
        if (!this.isGameSupported(gameType)) {
            return null;
        }
        // إنشاء معلومات مخصصة لكل نوع لعبة
        const gameInfoMap = {
            'tic-tac-toe': {
                name: 'Tic Tac Toe',
                nameAr: 'إكس أو',
                minPlayers: 2,
                maxPlayers: 2,
                description: 'Classic game of X and O, be the first to get three in a row.',
                descriptionAr: 'لعبة كلاسيكية من إكس وأو، كن أول من يحصل على ثلاثة في صف واحد.',
                difficulty: 'Easy',
                difficultyAr: 'سهل',
                category: 'Strategy',
                categoryAr: 'استراتيجية'
            },
            'rock-paper-scissors': {
                name: 'Rock Paper Scissors',
                nameAr: 'حجر ورقة مقص',
                minPlayers: 2,
                maxPlayers: 2,
                description: 'Choose between rock, paper, and scissors to outsmart your opponent.',
                descriptionAr: 'اختر بين الحجر والورقة والمقص للتغلب على خصمك.',
                difficulty: 'Easy',
                difficultyAr: 'سهل',
                category: 'Casual',
                categoryAr: 'عادية'
            },
            'word-galaxy': {
                name: 'Word Galaxy',
                nameAr: 'مجرة الكلمات',
                minPlayers: 2,
                maxPlayers: 2,
                description: 'Guess the hidden word from clues and letters.',
                descriptionAr: 'خمن الكلمة المخفية من التلميحات والحروف.',
                difficulty: 'Medium',
                difficultyAr: 'متوسط',
                category: 'Word',
                categoryAr: 'كلمات'
            }
        };
        return gameInfoMap[gameType];
    }
}
exports.GameFactory = GameFactory;
// قائمة بجميع أنواع الألعاب المدعومة
GameFactory.supportedGames = {
    'tic-tac-toe': TicTacToeGame_1.TicTacToeGame,
    'rock-paper-scissors': RockPaperScissorsGame_1.RockPaperScissorsGame,
    'word-galaxy': WordGalaxyGame_1.WordGalaxyGame
};
