import { AbstractGame } from './AbstractGame';

// Define the choice type
type Choice = 'rock' | 'paper' | 'scissors';

// Define the move type for Rock Paper Scissors
interface RPSMove {
  choice: Choice;
  round?: number;
}

// Define the player move record
interface PlayerMove {
  playerId: string;
  choice: Choice;
}

// Define the game state type
interface RPSState {
  currentRound: number;
  scores: Record<string, number>;
  moves: PlayerMove[];
  lastResult?: {
    winner: string | 'tie' | null;
    moves: PlayerMove[];
  };
  gameOver: boolean;
  winner: string | null;
  roundComplete: boolean;
}

/**
 * Implementation of the Rock Paper Scissors game
 */
export class RockPaperScissorsGame extends AbstractGame {
  readonly gameType: string = 'rock-paper-scissors';
  
  private scores: Record<string, number>;
  private rounds: PlayerMove[][];
  private currentRound: number;
  private roundMoves: PlayerMove[];
  private maxRounds: number;
  private roundComplete: boolean;
  
  constructor() {
    super();
    this.scores = {};
    this.rounds = [];
    this.currentRound = 1;
    this.roundMoves = [];
    this.maxRounds = 5; // Default to 5 rounds
    this.roundComplete = false;
  }
  
  /**
   * Initialize the game with room and players
   */
  initialize(roomId: string, players: string[], options?: { maxRounds?: number }): boolean {
    if (!super.initialize(roomId, players)) {
      return false;
    }
    
    // Reset game state
    this.scores = {};
    players.forEach(id => this.scores[id] = 0);
    
    this.rounds = [];
    this.currentRound = 1;
    this.roundMoves = [];
    this.maxRounds = options?.maxRounds || 5;
    this.roundComplete = false;
    this.winner = null;
    this.gameOver = false;
    
    return true;
  }
  
  /**
   * Process a move from a player
   */
  processMove(playerId: string, move: RPSMove | string): RPSState {
    // تحويل الحركة إلى التنسيق الموحد
    let normalizedMove: RPSMove;
    
    if (typeof move === 'string') {
      normalizedMove = { choice: move as Choice };
    } else {
      normalizedMove = move;
    }
    
    if (!this.validateMove(playerId, normalizedMove)) {
      // Return current state without changes if move is invalid
      return this.getState();
    }
    
    // Record the last activity
    this.updateActivity();
    
    // Add the player's move to current round
    const alreadyMoved = this.roundMoves.findIndex(m => m.playerId === playerId);
    if (alreadyMoved >= 0) {
      // Player already moved this round, update the choice
      this.roundMoves[alreadyMoved].choice = normalizedMove.choice;
    } else {
      // New move for this round
      this.roundMoves.push({
        playerId,
        choice: normalizedMove.choice
      });
    }
    
    // Check if both players have moved
    if (this.roundMoves.length === 2) {
      this.resolveRound();
    }
    
    return this.getState();
  }
  
  /**
   * Check if a move is valid
   */
  validateMove(playerId: string, move: RPSMove | string): boolean {
    // تحويل الحركة إلى التنسيق الموحد
    let normalizedMove: RPSMove;
    
    if (typeof move === 'string') {
      normalizedMove = { choice: move as Choice };
    } else {
      normalizedMove = move;
    }
    
    // Check if game is already over
    if (this.gameOver) {
      return false;
    }
    
    // Check if player is part of the game
    if (!this.players.includes(playerId)) {
      return false;
    }
    
    // Validate the choice
    if (!['rock', 'paper', 'scissors'].includes(normalizedMove.choice)) {
      return false;
    }
    
    // Check if the round number matches (if provided)
    if (normalizedMove.round !== undefined && normalizedMove.round !== this.currentRound) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Reset the game for a new round
   */
  reset(): boolean {
    if (!super.reset()) {
      return false;
    }
    
    // Keep scores but start a new round
    this.startNewRound();
    
    return true;
  }
  
  /**
   * Get the current game state
   */
  getState(): RPSState {
    const state: RPSState = {
      ...super.getState(),
      currentRound: this.currentRound,
      scores: { ...this.scores },
      moves: [...this.roundMoves],
      gameOver: this.gameOver,
      winner: this.winner,
      roundComplete: this.roundComplete
    };
    
    // Add the last round result if available
    if (this.rounds.length > 0 && this.roundComplete) {
      const lastRound = this.rounds[this.rounds.length - 1];
      const lastResult = this.determineRoundWinner(lastRound);
      
      state.lastResult = {
        winner: lastResult.winner,
        moves: [...lastRound]
      };
    }
    
    return state;
  }
  
  /**
   * Resolve the current round after both players have made their choices
   */
  private resolveRound(): void {
    const result = this.determineRoundWinner(this.roundMoves);
    
    // Update scores
    if (result.winner && result.winner !== 'tie') {
      this.scores[result.winner]++;
    }
    
    // Store the round
    this.rounds.push([...this.roundMoves]);
    this.roundComplete = true;
    
    // Check if the game is over
    const maxScore = Math.max(...Object.values(this.scores));
    if (maxScore >= Math.ceil(this.maxRounds / 2)) { // Best of maxRounds
      // Find the player with the highest score
      for (const [playerId, score] of Object.entries(this.scores)) {
        if (score === maxScore) {
          this.winner = playerId;
          this.gameOver = true;
          break;
        }
      }
    } else if (this.currentRound >= this.maxRounds) {
      // Max rounds reached, determine winner by highest score
      let highestScore = -1;
      let winningPlayer = null;
      let tie = false;
      
      for (const [playerId, score] of Object.entries(this.scores)) {
        if (score > highestScore) {
          highestScore = score;
          winningPlayer = playerId;
          tie = false;
        } else if (score === highestScore) {
          tie = true;
        }
      }
      
      if (!tie && winningPlayer) {
        this.winner = winningPlayer;
      }
      
      this.gameOver = true;
    }
  }
  
  /**
   * Determine the winner of a round based on player moves
   */
  private determineRoundWinner(moves: PlayerMove[]): { winner: string | 'tie' | null } {
    if (moves.length !== 2) {
      return { winner: null };
    }
    
    const [player1, player2] = moves;
    
    // Check for a tie
    if (player1.choice === player2.choice) {
      return { winner: 'tie' };
    }
    
    // Determine the winner
    if (
      (player1.choice === 'rock' && player2.choice === 'scissors') ||
      (player1.choice === 'paper' && player2.choice === 'rock') ||
      (player1.choice === 'scissors' && player2.choice === 'paper')
    ) {
      return { winner: player1.playerId };
    } else {
      return { winner: player2.playerId };
    }
  }
  
  /**
   * Start a new round
   */
  startNewRound(): void {
    this.currentRound++;
    this.roundMoves = [];
    this.roundComplete = false;
  }
} 