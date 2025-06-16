"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordGalaxyGame = void 0;
const AbstractGame_1 = require("./AbstractGame");
/**
 * Implementation of the Word Galaxy game
 */
class WordGalaxyGame extends AbstractGame_1.AbstractGame {
    constructor() {
        super();
        this.gameType = 'word-galaxy';
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
    initialize(roomId, players) {
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
        if (!this.scores[players[0]])
            this.scores[players[0]] = 0;
        if (!this.scores[players[1]])
            this.scores[players[1]] = 0;
        this.roundCount = 1;
        this.isComplete = false;
        this.winner = null;
        this.gameOver = false;
        return true;
    }
    /**
     * Process a move from a player
     */
    processMove(playerId, move) {
        if (!this.validateMove(playerId, move)) {
            return this.getState();
        }
        // Record the last activity
        this.updateActivity();
        if (move.type === 'setup') {
            this.processSetupMove(playerId, move);
        }
        else if (move.type === 'guess') {
            this.processGuessMove(playerId, move);
        }
        return this.getState();
    }
    /**
     * Process word setup move from creator
     */
    processSetupMove(playerId, move) {
        // Ensure this player is the creator
        if (this.roles[playerId] !== 'creator')
            return;
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
    processGuessMove(playerId, move) {
        // Ensure this player is the guesser
        if (this.roles[playerId] !== 'guesser')
            return;
        // If game is already complete, do nothing
        if (this.isComplete)
            return;
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
    checkGuess(guess) {
        let matches = 0;
        const newRevealed = [...this.revealedPositions];
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
    handleCorrectGuess(guesserId) {
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
    handleOutOfAttempts() {
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
    startTimer() {
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
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    /**
     * Handle timeout when time runs out
     */
    handleTimeout() {
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
    validateMove(playerId, move) {
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
        }
        else if (move.type === 'guess') {
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
    reset(swapRoles = true) {
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
    getState() {
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
    getPlayerState(playerId) {
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
    destroy() {
        this.stopTimer();
    }
}
exports.WordGalaxyGame = WordGalaxyGame;
