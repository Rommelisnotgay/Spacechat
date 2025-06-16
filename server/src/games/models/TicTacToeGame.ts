import { AbstractGame } from './AbstractGame';

// Define move type
interface TicTacToeMove {
  index?: number;
  row?: number;
  col?: number;
}

// Define game state
interface TicTacToeState {
  board: Array<string | null>;
  currentTurn: string;
  players: string[];
  marks: Record<string, string>;
  winner: string | null;
  gameOver: boolean;
  winningLine: number[] | null;
  roomId: string;
}

/**
 * Implementation of the Tic-Tac-Toe game
 */
export class TicTacToeGame extends AbstractGame {
  readonly gameType: string = 'tic-tac-toe';
  
  private board: Array<string | null>;
  private marks: Record<string, string>;
  protected currentTurn: string;
  private winningLine: number[] | null;
  
  constructor() {
    super();
    this.board = Array(9).fill(null);
    this.marks = {};
    this.currentTurn = '';
    this.winningLine = null;
  }
  
  /**
   * Initialize the game with room and players
   */
  initialize(roomId: string, players: string[]): boolean {
    if (!super.initialize(roomId, players)) {
      return false;
    }
    
    // Reset game state
    this.board = Array(9).fill(null);
    this.winningLine = null;
    this.gameOver = false;
    this.winner = null;
    
    // Assign marks to players
    if (players.length >= 2) {
      this.marks = {
        [players[0]]: 'X',
        [players[1]]: 'O'
      };
      
      // First player starts
      this.currentTurn = players[0];
    } else if (players.length === 1) {
      this.marks = {
        [players[0]]: 'X'
      };
      this.currentTurn = players[0];
    }
    
    return true;
  }
  
  /**
   * Process a move from a player
   */
  processMove(playerId: string, move: TicTacToeMove | number): TicTacToeState {
    // معالجة الحركة إذا كانت رقمًا مباشرًا (التنسيق القديم)
    let moveObject: TicTacToeMove;
    if (typeof move === 'number') {
      moveObject = { index: move };
    } else {
      moveObject = move;
    }
    
    if (!this.validateMove(playerId, moveObject)) {
      return this.getState();
    }
    
    // Record the last activity
    this.updateActivity();
    
    // Get the index based on the move type
    let index: number;
    if (typeof moveObject.index === 'number') {
      index = moveObject.index;
    } else if (typeof moveObject.row === 'number' && typeof moveObject.col === 'number') {
      index = moveObject.row * 3 + moveObject.col;
    } else {
      // Invalid move format
      console.error('Invalid move format:', moveObject);
      return this.getState();
    }
    
    // Place the mark on the board
    this.board[index] = this.marks[playerId];
    
    // Check for a win
    this.checkGameStatus();
    
    // Switch turns if game is not over
    if (!this.gameOver) {
      this.switchTurn();
    }
    
    return this.getState();
  }
  
  /**
   * Validate a move
   */
  validateMove(playerId: string, move: TicTacToeMove | number): boolean {
    // معالجة الحركة إذا كانت رقمًا مباشرًا (التنسيق القديم)
    let moveObject: TicTacToeMove;
    if (typeof move === 'number') {
      moveObject = { index: move };
    } else {
      moveObject = move;
    }
    
    // Check if it's a valid player
    if (!this.players.includes(playerId)) {
      return false;
    }
    
    // Check if it's the player's turn
    if (this.currentTurn !== playerId) {
      return false;
    }
    
    // Check if the game is already over
    if (this.gameOver) {
      return false;
    }
    
    // Get the index based on the move type
    let index: number;
    if (typeof moveObject.index === 'number') {
      index = moveObject.index;
    } else if (typeof moveObject.row === 'number' && typeof moveObject.col === 'number') {
      index = moveObject.row * 3 + moveObject.col;
    } else {
      // Invalid move format
      return false;
    }
    
    // Check if the move is within bounds
    if (index < 0 || index >= 9) {
      return false;
    }
    
    // Check if the position is empty
    if (this.board[index] !== null) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Switch turns between players
   */
  private switchTurn(): void {
    const otherPlayer = this.players.find(p => p !== this.currentTurn);
    if (otherPlayer) {
      this.currentTurn = otherPlayer;
    }
  }
  
  /**
   * Check if the game is over (win or draw)
   */
  private checkGameStatus(): void {
    // Check for winning combinations
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (
        this.board[a] !== null &&
        this.board[a] === this.board[b] &&
        this.board[a] === this.board[c]
      ) {
        // We have a winner
        this.gameOver = true;
        this.winningLine = pattern;
        
        // Find the player with this mark
        const winningMark = this.board[a];
        this.winner = Object.keys(this.marks).find(
          playerId => this.marks[playerId] === winningMark
        ) || null;
        
        // تسجيل معلومات الفوز للمساعدة في تتبع الأخطاء
        console.log(`Game won by player ${this.winner} with mark ${winningMark}. Winning line: ${this.winningLine.join(',')}`);
        
        return;
      }
    }
    
    // Check for a draw (all cells filled)
    if (this.board.every(cell => cell !== null)) {
      this.gameOver = true;
      this.winner = null; // Draw
      console.log('Game ended in a draw');
    }
  }
  
  /**
   * Reset the game
   */
  reset(swapRoles: boolean = false): boolean {
    // Keep the same players but reset the board
    this.board = Array(9).fill(null);
    this.winningLine = null;
    this.gameOver = false;
    this.winner = null;
    
    // Swap roles if requested
    if (swapRoles && this.players.length >= 2) {
      const temp = this.marks[this.players[0]];
      this.marks[this.players[0]] = this.marks[this.players[1]];
      this.marks[this.players[1]] = temp;
    }
    
    // First player starts
    this.currentTurn = this.players[0];
    
    // Update activity timestamp
    this.updateActivity();
    
    return true;
  }
  
  /**
   * Get the current game state
   */
  getState(): TicTacToeState {
    return {
      board: [...this.board],
      currentTurn: this.currentTurn,
      players: [...this.players],
      marks: { ...this.marks },
      winner: this.winner,
      gameOver: this.gameOver,
      winningLine: this.winningLine ? [...this.winningLine] : null,
      roomId: this.roomId
    };
  }
  
  /**
   * Clean up resources when destroying the game
   */
  destroy(): void {
    super.destroy();
    this.board = Array(9).fill(null);
    this.winningLine = null;
  }
} 