<template>
  <div class="fixed inset-0 overflow-hidden pointer-events-none">
    <div v-for="star in stars" :key="star.id" 
         class="absolute rounded-full bg-white" 
         :style="{
           width: `${star.size}px`,
           height: `${star.size}px`,
           top: `${star.y}%`,
           left: `${star.x}%`,
           opacity: star.opacity,
           boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, ${star.opacity})`,
           animation: `twinkle ${star.duration}s infinite ease-in-out`
         }">
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
}

const stars = ref<Star[]>([]);

onMounted(() => {
  generateStars();
});

const generateStars = () => {
  const numStars = 50;
  const newStars: Star[] = [];
  
  for (let i = 0; i < numStars; i++) {
    newStars.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.7 + 0.3,
      duration: Math.random() * 8 + 2
    });
  }
  
  stars.value = newStars;
};
</script>

<style scoped>
@keyframes twinkle {
  0%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
 