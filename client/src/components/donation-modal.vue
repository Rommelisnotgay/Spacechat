<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gray-900 rounded-lg w-full max-w-md mx-auto p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <span class="text-red-400 text-xl">❤️</span>
          <h2 class="text-lg font-semibold text-violet-400">Support SpaceTalk</h2>
        </div>
        <button 
          @click="$emit('close')" 
          class="text-gray-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>
      
      <!-- Content -->
      <div class="mb-6 text-center">
        <p class="text-gray-300">Keep SpaceTalk free for everyone</p>
      </div>
      
      <!-- Donation Options -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <button 
          :class="[
            'bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition-colors duration-200 transform',
            selectedAmount === 5 ? 'ring-2 ring-emerald-500 scale-105' : ''
          ]"
          @click="selectAmount(5)"
        >
          <div class="text-lg font-bold text-white">$5</div>
          <div class="text-sm text-gray-400">Coffee</div>
        </button>
        
        <button 
          :class="[
            'bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition-colors duration-200 transform',
            selectedAmount === 15 ? 'ring-2 ring-emerald-500 scale-105' : ''
          ]"
          @click="selectAmount(15)"
        >
          <div class="text-lg font-bold text-white">$15</div>
          <div class="text-sm text-gray-400">Fuel</div>
        </button>
        
        <button 
          :class="[
            'bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition-colors duration-200 transform',
            selectedAmount === 50 ? 'ring-2 ring-emerald-500 scale-105' : ''
          ]"
          @click="selectAmount(50)"
        >
          <div class="text-lg font-bold text-white">$50</div>
          <div class="text-sm text-gray-400">Rocket</div>
        </button>
      </div>
      
      <!-- Development Info -->
      <div class="flex justify-center items-center gap-1 mb-6">
        <span class="text-yellow-400">⭐</span>
        <span class="text-sm text-gray-300">Boost development</span>
      </div>
      
      <!-- Donate Button -->
      <button 
        class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-lg transition-colors mb-2 active:scale-95 transform duration-150"
        @click="openPayPal"
      >
        Donate via PayPal
      </button>
      
      <!-- Secure Payment Notice -->
      <div class="text-xs text-gray-500 text-center">
        Secure payments via PayPal
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

const selectedAmount = ref(15);

const selectAmount = (amount: number) => {
  selectedAmount.value = amount;
};

const openPayPal = () => {
  // Redirect to the specified PayPal link with the selected amount
  window.open(`https://www.paypal.com/paypalme/spacetalk/${selectedAmount.value}`, '_blank');
  emit('close');
};
</script> 