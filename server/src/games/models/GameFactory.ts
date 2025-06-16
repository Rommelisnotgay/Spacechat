import { IGame } from '../interfaces/IGame';
import { TicTacToeGame } from './TicTacToeGame';
import { RockPaperScissorsGame } from './RockPaperScissorsGame';
import { WordGalaxyGame } from './WordGalaxyGame';

/**
 * المصنع المسؤول عن إنشاء ألعاب من أنواع مختلفة
 */
export class GameFactory {
  // قائمة بجميع أنواع الألعاب المدعومة
  private static readonly supportedGames: Record<string, new () => IGame> = {
    'tic-tac-toe': TicTacToeGame,
    'rock-paper-scissors': RockPaperScissorsGame,
    'word-galaxy': WordGalaxyGame
  };
  
  /**
   * إنشاء لعبة جديدة من النوع المحدد
   * @param gameType نوع اللعبة المطلوب إنشاؤها
   * @returns كائن اللعبة أو null إذا كان النوع غير مدعوم
   */
  static createGame(gameType: string): IGame | null {
    const GameClass = this.supportedGames[gameType];
    
    if (!GameClass) {
      console.error(`Game type not supported: ${gameType}`);
      return null;
    }
    
    try {
      return new GameClass();
    } catch (error) {
      console.error(`Error creating game of type ${gameType}:`, error);
      return null;
    }
  }
  
  /**
   * التحقق من دعم نوع لعبة معين
   * @param gameType نوع اللعبة للتحقق منه
   * @returns true إذا كان النوع مدعومًا، false خلاف ذلك
   */
  static isGameSupported(gameType: string): boolean {
    return gameType in this.supportedGames;
  }
  
  /**
   * الحصول على قائمة بجميع أنواع الألعاب المدعومة
   * @returns مصفوفة من أنواع الألعاب المدعومة
   */
  static getSupportedGameTypes(): string[] {
    return Object.keys(this.supportedGames);
  }
  
  /**
   * الحصول على معلومات حول لعبة معينة
   * @param gameType نوع اللعبة
   * @returns كائن يحتوي على معلومات اللعبة أو null إذا كان النوع غير مدعوم
   */
  static getGameInfo(gameType: string): any {
    if (!this.isGameSupported(gameType)) {
      return null;
    }
    
    // إنشاء معلومات مخصصة لكل نوع لعبة
    const gameInfoMap: Record<string, any> = {
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