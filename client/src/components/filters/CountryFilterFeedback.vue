<template>
  <div class="filter-feedback">
    <div v-if="preferredCountries.length > 0" class="mt-2 p-2 bg-emerald-900/30 rounded-lg">
      <p class="text-xs text-emerald-300">
        <span class="font-medium">{{ matchPercentage }}%</span> of users match your preferences
      </p>
      <div class="w-full bg-gray-700 rounded-full h-2 mt-1">
        <div 
          class="bg-emerald-500 h-2 rounded-full" 
          :style="{ width: `${matchPercentage}%` }"
        ></div>
      </div>
    </div>
    
    <div v-if="preferredCountries.length > 0" class="mt-2">
      <p class="text-xs text-gray-400">
        Your current preferences will match you only with users from:
        <span v-for="(code, index) in preferredCountries" :key="code">
          {{ getCountryName(code) }}{{ index < preferredCountries.length - 1 ? ', ' : '' }}
        </span>
      </p>
    </div>
    
    <div v-if="blockedCountries.length > 0" class="mt-2">
      <p class="text-xs text-gray-400">
        You will not be matched with users from: 
        <span v-for="(code, index) in blockedCountries" :key="code">
          {{ getCountryName(code) }}{{ index < blockedCountries.length - 1 ? ', ' : '' }}
        </span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  preferredCountries: {
    type: Array as () => string[],
    required: true
  },
  blockedCountries: {
    type: Array as () => string[],
    required: true
  },
  onlineUsers: {
    type: Number,
    default: 0
  },
  countries: {
    type: Array as () => Array<{value: string, name: string, flag: string}>,
    required: true
  }
});

// Estimate the percentage of users matching your preferences
const matchPercentage = computed(() => {
  if (props.preferredCountries.length === 0) return 100;
  
  // These are just simple estimates - can be replaced with real stats from the server
  const totalCountries = 195; // Approximate number of countries in the world
  const preferredPercentage = (props.preferredCountries.length / totalCountries) * 100;
  
  // The more preferred countries, the higher the possible match percentage
  return Math.min(Math.round(preferredPercentage), 100);
});

const getCountryName = (countryCode: string): string => {
  const country = props.countries.find(c => c.value === countryCode);
  return country ? country.name : countryCode;
};
</script>

<style scoped>
.filter-feedback {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style> 