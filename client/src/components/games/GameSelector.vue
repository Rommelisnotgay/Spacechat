<template>
  <div class="w-full">
    <h3 class="text-xl font-semibold text-purple-300 mb-4 text-center">
      Choose a game to play with your partner
    </h3>
    
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      <!-- Tic Tac Toe -->
      <button 
        @click="selectGame('tic-tac-toe')"
        class="game-button bg-gray-800/80 backdrop-blur-sm p-5 rounded-lg flex flex-col items-center justify-center hover:bg-gray-700/80 transition-all game-interactive game-transition"
      >
        <div class="text-4xl mb-3 flex">
          <span class="text-blue-400 mr-1">X</span>
          <span class="text-green-400">O</span>
        </div>
        <h4 class="text-lg font-medium text-white">Tic Tac Toe</h4>
        <p class="text-sm text-gray-300 mt-2 text-center">
          Classic strategy game on a 3×3 grid
        </p>
      </button>
      
      <!-- Rock Paper Scissors -->
      <button 
        @click="selectGame('rock-paper-scissors')"
        class="game-button bg-gray-800/80 backdrop-blur-sm p-5 rounded-lg flex flex-col items-center justify-center hover:bg-gray-700/80 transition-all game-interactive game-transition"
      >
        <div class="text-4xl mb-3 flex">
          <span class="mr-2">👊</span>
          <span class="mr-2">✋</span>
          <span>✌️</span>
        </div>
        <h4 class="text-lg font-medium text-white">Rock Paper Scissors</h4>
        <p class="text-sm text-gray-300 mt-2 text-center">
          Intuitive game that's easy to learn and fun to play
        </p>
      </button>
      
      <!-- Word Galaxy -->
      <button 
        @click="selectGame('word-galaxy')"
        class="game-button bg-gray-800/80 backdrop-blur-sm p-5 rounded-lg flex flex-col items-center justify-center hover:bg-gray-700/80 transition-all game-interactive game-transition"
      >
        <div class="text-4xl mb-3 flex">
          <span>🔤</span>
        </div>
        <h4 class="text-lg font-medium text-white">Word Galaxy</h4>
        <p class="text-sm text-gray-300 mt-2 text-center">
          Test your language skills with word guessing
        </p>
      </button>
      
      <!-- Trivia Game -->
      <button 
        @click="selectGame('trivia')"
        class="game-button bg-gray-800/80 backdrop-blur-sm p-5 rounded-lg flex flex-col items-center justify-center hover:bg-gray-700/80 transition-all game-interactive game-transition"
      >
        <div class="text-4xl mb-3 flex">
          <span>❓</span>
        </div>
        <h4 class="text-lg font-medium text-white">Trivia Challenge</h4>
        <p class="text-sm text-gray-300 mt-2 text-center">
          Test your knowledge with varied questions
        </p>
      </button>
    </div>
    
    <!-- Game Information -->
    <div class="bg-gray-800/60 backdrop-blur-sm p-4 rounded-lg mb-4">
      <h4 class="text-lg font-semibold text-purple-300 mb-2">
        Game Information
      </h4>
      <ul class="space-y-2 text-gray-300">
        <li class="flex items-start">
          <span class="mr-2 text-yellow-300">•</span>
          <span>All games are played in real-time with your chat partner</span>
        </li>
        <li class="flex items-start">
          <span class="mr-2 text-yellow-300">•</span>
          <span>You can return to your chat at any time</span>
        </li>
        <li class="flex items-start">
          <span class="mr-2 text-yellow-300">•</span>
          <span>Click the mute button to toggle sound effects</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';
import { gameSoundEffects } from './GameEffects';

const props = defineProps({
  onSelect: {
    type: Function,
    required: true
  }
});

const selectGame = (gameType: string) => {
  gameSoundEffects.playSound('click');
  props.onSelect(gameType);
};
</script>

<style scoped>
@import '../../assets/games-responsive.css';
</style> 