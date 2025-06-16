// أنواع البيانات المشتركة للنظام

// معلومات المستخدم
export interface UserInfo {
  socketId: string;
  vibe?: string;
  preferences?: Record<string, any>;
  nickname?: string;
  location?: GeoLocation;
}

// معلومات الموقع الجغرافي
export interface GeoLocation {
  country: string;
  countryCode: string;
  flag: string;
}

// مستخدم في قائمة الانتظار
export interface QueueUser {
  userId: string;
  vibe: string;
  joinTime: number;
  preferences?: Record<string, any>;
}

// معلومات تحديد المعدل
export interface RateLimitInfo {
  lastJoinTime: number;
  joinCount: number;
}

// أنواع الألعاب
export const IMPLEMENTED_GAMES = ['tic-tac-toe', 'rock-paper-scissors', 'word-galaxy'];

// واجهات رسائل الألعاب
export interface GameRoomJoin {
  gameType: string;
  roomId: string;
  to: string;
  isFirstPlayer: boolean;
}

export interface GameRoomLeave {
  roomId: string;
  to: string;
}

export interface GameMove {
  gameType: string;
  roomId?: string;
  move: any;
  to: string;
}

export interface GameReset {
  gameType: string;
  roomId?: string;
  to: string;
  swapRoles?: boolean;
  shouldBeCreator?: boolean;
  roundCount?: number;
  guesserScore?: number;
  creatorScore?: number;
}

export interface GameError {
  message: string;
  from: string;
  gameType?: string;
}

export interface GameStartRound {
  gameType: string;
  round: number;
  to: string;
}

export interface GameWordSetup {
  gameType: string;
  wordLength: number;
  difficulty: string;
  to: string;
}

export interface GameGuessResult {
  gameType: string;
  result: any;
  to: string;
}

// غرفة اللعب
export interface GameRoom {
  gameType: string;
  players: string[];
  createdAt: number;
  state?: any; // حالة اللعبة (يمكن تطويرها لكل نوع لعبة)
} 