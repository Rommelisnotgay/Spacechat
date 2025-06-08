<template>
  <div class="app-container">
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0;
  background-color: #3A2273; /* خلفية احتياطية */
  min-height: 100vh;
  color: white;
  overflow-x: hidden;
}

.app-container {
  background: linear-gradient(to bottom right, #4c1d95, #6d28d9, #7c3aed);
  min-height: 100vh;
  width: 100%;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* Animations */
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { 
    transform: translateY(0); 
  }
  50% { 
    transform: translateY(-10px); 
  }
}

/* Button styles */
button {
  transition: all 0.2s ease;
}

button:active {
  transform: scale(0.95);
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(76, 29, 149, 0.3);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: rgba(124, 58, 237, 0.6);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(124, 58, 237, 0.8);
}
</style>
