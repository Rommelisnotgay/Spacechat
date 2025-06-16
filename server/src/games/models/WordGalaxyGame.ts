import { AbstractGame } from './AbstractGame';

// Define difficulty levels
type DifficultyLevel = 'easy' | 'medium' | 'hard';

interface DifficultySettings {
  maxAttempts: number;
  timeLimit: number;
  basePoints: number;
  pointMultiplier: number;
}

// Define player roles
type PlayerRole = 'creator' | 'guesser';

// Define move types
interface WordSetupMove {
  type: 'setup';
  word: string;
  difficulty: DifficultyLevel;
}

interface GuessMove {
  type: 'guess';
  word: string;
}

type WordGalaxyMove = WordSetupMove | GuessMove;

// Define game state
interface WordGalaxyState {
  creatorId: string | null;
  guesserId: string | null;
  wordLength: number;
  difficulty: DifficultyLevel;
  secretWord: string | null;
  attempts: number;
  maxAttempts: number;
  timeRemaining: number;
  revealedPositions: number[];
  guessHistory: Array<{
    word: string;
    matches: number;
  }>;
  scores: Record<string, number>;
  roundCount: number;
  isComplete: boolean;
  gameOver: boolean;
  winner: string | null;
}

/**
 * Implementation of the Word Galaxy game
 */
export class WordGalaxyGame extends AbstractGame {
  readonly gameType: string = 'word-galaxy';
  
  private roles: Record<string, PlayerRole>;
  private secretWord: string;
  private wordLength: number;
  private difficulty: DifficultyLevel;
  private difficultySettings: Record<DifficultyLevel, DifficultySettings>;
  private attempts: number;
  private maxAttempts: number;
  private timeRemaining: number;
  private timerInterval: NodeJS.Timeout | null;
  private revealedPositions: number[];
  private guessHistory: Array<{ word: string; matches: number }>;
  private scores: Record<string, number>;
  private roundCount: number;
  private isComplete: boolean;
  
  constructor() {
    super();
    this.roles = {};
    this.secretWord = '';
    this.wordLength = 0;
    this.difficulty = 'medium';
    this.difficultySettings = {
      easy: {
        maxAttempts: 10,
        timeLimit: 60,
        basePoints: 50,
        pointMultiplier: 1
      },
      medium: {
        maxAttempts: 8,
        timeLimit: 45,
        basePoints: 75,
        pointMultiplier: 1.5
      },
      hard: {
        maxAttempts: 6,
        timeLimit: 30,
        basePoints: 100,
        pointMultiplier: 2
      }
    };
    this.attempts = 0;
    this.maxAttempts = this.difficultySettings.medium.maxAttempts;
    this.timeRemaining = this.difficultySettings.medium.timeLimit;
    this.timerInterval = null;
    this.revealedPositions = [];
    this.guessHistory = [];
    this.scores = {};
    this.roundCount = 1;
    this.isComplete = false;
  }
  
  /**
   * Initialize the game with room and players
   */
  initialize(roomId: string, players: string[]): boolean {
    if (!super.initialize(roomId, players)) {
      return false;
    }
    
    // Reset game state
    this.roles = {
      [players[0]]: 'creator',
      [players[1]]: 'guesser'
    };
    
    this.secretWord = '';
    this.wordLength = 0;
    this.difficulty = 'medium';
    this.attempts = 0;
    this.maxAttempts = this.difficultySettings.medium.maxAttempts;
    this.timeRemaining = this.difficultySettings.medium.timeLimit;
    this.stopTimer();
    this.revealedPositions = [];
    this.guessHistory = [];
    
    // Initialize scores if not already set
    if (!this.scores[players[0]]) this.scores[players[0]] = 0;
    if (!this.scores[players[1]]) this.scores[players[1]] = 0;
    
    this.roundCount = 1;
    this.isComplete = false;
    this.winner = null;
    this.gameOver = false;
    
    return true;
  }
  
  /**
   * Process a move from a player
   */
  processMove(playerId: string, move: WordGalaxyMove): WordGalaxyState {
    if (!this.validateMove(playerId, move)) {
      return this.getState();
    }
    
    // Record the last activity
    this.updateActivity();
    
    if (move.type === 'setup') {
      this.processSetupMove(playerId, move);
    } else if (move.type === 'guess') {
      this.processGuessMove(playerId, move);
    }
    
    return this.getState();
  }
  
  /**
   * Process word setup move from creator
   */
  private processSetupMove(playerId: string, move: WordSetupMove): void {
    // Ensure this player is the creator
    if (this.roles[playerId] !== 'creator') return;
    
    // Set the secret word and settings
    this.secretWord = move.word.toLowerCase();
    this.wordLength = this.secretWord.length;
    this.difficulty = move.difficulty;
    
    // Set attempts and time based on difficulty
    this.maxAttempts = this.difficultySettings[this.difficulty].maxAttempts;
    this.timeRemaining = this.difficultySettings[this.difficulty].timeLimit;
    this.attempts = 0;
    
    // Reset other game state
    this.revealedPositions = [];
    this.guessHistory = [];
    this.isComplete = false;
    
    // Start the timer
    this.startTimer();
  }
  
  /**
   * Process guess move from guesser
   */
  private processGuessMove(playerId: string, move: GuessMove): void {
    // Ensure this player is the guesser
    if (this.roles[playerId] !== 'guesser') return;
    
    // If game is already complete, do nothing
    if (this.isComplete) return;
    
    const guess = move.word.toLowerCase();
    
    // Process the guess
    const matches = this.checkGuess(guess);
    this.attempts++;
    
    // Add to guess history
    this.guessHistory.push({ word: guess, matches });
    
    // Check if the word was guessed correctly
    if (matches === this.wordLength) {
      this.handleCorrectGuess(playerId);
    }
    
    // Check if out of attempts
    if (this.attempts >= this.maxAttempts && !this.isComplete) {
      this.handleOutOfAttempts();
    }
  }
  
  /**
   * Check a guess against the secret word and return the number of matching positions
   */
  private checkGuess(guess: string): number {
    let matches = 0;
    const newRevealed: number[] = [...this.revealedPositions];
    
    // Compare each letter
    for (let i = 0; i < this.secretWord.length; i++) {
      if (i < guess.length && guess[i] === this.secretWord[i]) {
        matches++;
        if (!newRevealed.includes(i)) {
          newRevealed.push(i);
        }
      }
    }
    
    this.revealedPositions = newRevealed;
    return matches;
  }
  
  /**
   * Handle a correct guess
   */
  private handleCorrectGuess(guesserId: string): void {
    this.isComplete = true;
    this.stopTimer();
    
    // Guesser wins
    this.winner = guesserId;
    
    // Award points to guesser based on attempts and time
    const settings = this.difficultySettings[this.difficulty];
    const attemptBonus = (this.maxAttempts - this.attempts) * 5;
    const timeBonus = Math.round(this.timeRemaining / 3);
    const points = Math.round((settings.basePoints + attemptBonus + timeBonus) * settings.pointMultiplier);
    
    this.scores[guesserId] += points;
  }
  
  /**
   * Handle out of attempts
   */
  private handleOutOfAttempts(): void {
    this.isComplete = true;
    this.stopTimer();
    
    // Find the creator (the other player)
    const creatorId = Object.keys(this.roles).find(id => this.roles[id] === 'creator');
    if (creatorId) {
      this.winner = creatorId;
      
      // Award points to creator for stumping the guesser
      const settings = this.difficultySettings[this.difficulty];
      const points = Math.round(settings.basePoints * settings.pointMultiplier * 0.5);
      
      this.scores[creatorId] += points;
    }
  }
  
  /**
   * Start the timer for the game
   */
  private startTimer(): void {
    // Clear any existing timer
    this.stopTimer();
    
    // In a real implementation, this would be handled differently
    // with actual server timing mechanisms
    this.timerInterval = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
      }
      
      if (this.timeRemaining === 0 && !this.isComplete) {
        this.handleTimeout();
      }
    }, 1000);
  }
  
  /**
   * Stop the timer
   */
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
  
  /**
   * Handle timeout when time runs out
   */
  private handleTimeout(): void {
    this.isComplete = true;
    this.stopTimer();
    
    // Find the creator (the other player)
    const creatorId = Object.keys(this.roles).find(id => this.roles[id] === 'creator');
    if (creatorId) {
      this.winner = creatorId;
      
      // Award points to creator for timeout
      const settings = this.difficultySettings[this.difficulty];
      const points = Math.round(settings.basePoints * settings.pointMultiplier * 0.3);
      
      this.scores[creatorId] += points;
    }
  }
  
  /**
   * Validate a move
   */
  validateMove(playerId: string, move: WordGalaxyMove): boolean {
    // Check if player is part of the game
    if (!this.players.includes(playerId)) {
      return false;
    }
    
    // Validate based on move type
    if (move.type === 'setup') {
      // Only the creator can set up the word
      if (this.roles[playerId] !== 'creator') {
        return false;
      }
      
      // Validate word length (3-15 characters)
      if (move.word.length < 3 || move.word.length > 15) {
        return false;
      }
      
      // Validate difficulty
      if (!['easy', 'medium', 'hard'].includes(move.difficulty)) {
        return false;
      }
      
      return true;
    } else if (move.type === 'guess') {
      // Only the guesser can make guesses
      if (this.roles[playerId] !== 'guesser') {
        return false;
      }
      
      // Game must be set up first
      if (this.secretWord.length === 0) {
        return false;
      }
      
      // Game must not be complete
      if (this.isComplete) {
        return false;
      }
      
      // Must not be out of attempts
      if (this.attempts >= this.maxAttempts) {
        return false;
      }
      
      // Validate guess length
      if (move.word.length !== this.wordLength) {
        return false;
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Reset the game for a new round
   */
  reset(swapRoles: boolean = true): boolean {
    if (!super.reset()) {
      return false;
    }
    
    // Swap roles if requested
    if (swapRoles && this.players.length === 2) {
      const [player1, player2] = this.players;
      this.roles = {
        [player1]: this.roles[player1] === 'creator' ? 'guesser' : 'creator',
        [player2]: this.roles[player2] === 'creator' ? 'guesser' : 'creator'
      };
    }
    
    // Reset game state but keep scores
    this.secretWord = '';
    this.wordLength = 0;
    this.difficulty = 'medium';
    this.attempts = 0;
    this.maxAttempts = this.difficultySettings.medium.maxAttempts;
    this.timeRemaining = this.difficultySettings.medium.timeLimit;
    this.stopTimer();
    this.revealedPositions = [];
    this.guessHistory = [];
    this.isComplete = false;
    this.roundCount++;
    
    return true;
  }
  
  /**
   * Get the current game state
   */
  getState(): WordGalaxyState {
    const creatorId = Object.keys(this.roles).find(id => this.roles[id] === 'creator') || null;
    const guesserId = Object.keys(this.roles).find(id => this.roles[id] === 'guesser') || null;
    
    return {
      ...super.getState(),
      creatorId,
      guesserId,
      wordLength: this.wordLength,
      difficulty: this.difficulty,
      secretWord: this.isComplete ? this.secretWord : null, // Only reveal word when complete
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      timeRemaining: this.timeRemaining,
      revealedPositions: [...this.revealedPositions],
      guessHistory: [...this.guessHistory],
      scores: { ...this.scores },
      roundCount: this.roundCount,
      isComplete: this.isComplete,
      gameOver: this.gameOver,
      winner: this.winner
    };
  }
  
  /**
   * Provide a safe version of the game state for a specific player
   * Filters out sensitive information like the secret word
   */
  getPlayerState(playerId: string): WordGalaxyState {
    const state = this.getState();
    
    // If player is not the creator, don't send the secret word unless game is complete
    if (this.roles[playerId] !== 'creator' && !this.isComplete) {
      state.secretWord = null;
    }
    
    return state;
  }
  
  /**
   * Clean up resources when game is destroyed
   */
  destroy(): void {
    this.stopTimer();
  }
} 