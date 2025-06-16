/**
 * Interface for all game implementations
 * This ensures consistent functionality across different games
 */
export interface IGame {
  /**
   * Unique identifier for the game type
   */
  readonly gameType: string;
  
  /**
   * Initializes a new game session
   * @param roomId - Unique identifier for the game room
   * @param players - Array of player IDs
   * @returns Boolean indicating success or failure
   */
  initialize(roomId: string, players: string[]): boolean;
  
  /**
   * Processes a player's move
   * @param playerId - ID of the player making the move
   * @param move - The move data (type depends on the specific game)
   * @returns Game state after the move
   */
  processMove(playerId: string, move: any): any;
  
  /**
   * Resets the game to initial state
   * @param swapRoles - Whether to swap player roles
   * @returns Boolean indicating success or failure
   */
  reset(swapRoles?: boolean): boolean;
  
  /**
   * Gets the current state of the game
   * @returns Current game state
   */
  getState(): any;
  
  /**
   * Gets the current state of the game for a specific player
   * @param playerId - ID of the player
   * @returns Game state for the specified player
   */
  getPlayerState(playerId: string): any;
  
  /**
   * Validates if a move is legal according to game rules
   * @param playerId - ID of the player making the move
   * @param move - The move to validate
   * @returns Boolean indicating if move is valid
   */
  validateMove(playerId: string, move: any): boolean;
  
  /**
   * Handles a player disconnection
   * @param playerId - ID of the disconnected player
   * @returns Updated game state
   */
  handleDisconnect(playerId: string): any;
  
  /**
   * Determines if the game has ended
   * @returns Boolean indicating if game has ended
   */
  isGameOver(): boolean;
  
  /**
   * Gets the winner of the game (if any)
   * @returns ID of the winning player or null if no winner
   */
  getWinner(): string | null;
  
  /**
   * Determines if the game is inactive
   * @returns Boolean indicating if the game is inactive
   */
  isInactive(): boolean;
  
  /**
   * Destroys the game and cleans up resources
   */
  destroy(): void;
} 