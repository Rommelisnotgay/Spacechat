<template>
  <div>
    <!-- Filters Button -->
    <button 
      @click="toggleFiltersPanel"
      class="w-full bg-purple-900 bg-opacity-40 text-white rounded-full px-6 py-3 flex items-center shadow-md hover:bg-purple-800 transition-colors"
    >
      <span class="text-blue-300 mr-2 text-xl">🌐</span>
      <span class="text-lg">Filters</span>
    </button>
    
    <!-- Filters Panel Modal -->
    <div 
      v-if="isOpen" 
      class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      @click.self="closeFiltersPanel"
    >
      <div class="bg-purple-900 rounded-xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold text-white">Connection Filters</h2>
          <button @click="closeFiltersPanel" class="text-white opacity-70 hover:opacity-100">✕</button>
        </div>
        
        <div class="space-y-5">
          <!-- Age Group Filter -->
          <div>
            <label class="block text-white mb-2">Age Group</label>
            <div class="grid grid-cols-3 gap-2">
              <button 
                v-for="age in ageGroups" 
                :key="age"
                @click="toggleAgeFilter(age)"
                :class="[
                  'px-3 py-2 rounded-lg text-center',
                  filters.ageGroups.includes(age) ? 'bg-blue-600 text-white' : 'bg-purple-800 text-white opacity-70'
                ]"
              >
                {{ age }}
              </button>
            </div>
          </div>
          
          <!-- Gender Filter -->
          <div>
            <label class="block text-white mb-2">Gender</label>
            <div class="grid grid-cols-3 gap-2">
              <button 
                v-for="gender in genderOptions" 
                :key="gender"
                @click="toggleGenderFilter(gender)"
                :class="[
                  'px-3 py-2 rounded-lg text-center',
                  filters.gender === gender ? 'bg-blue-600 text-white' : 'bg-purple-800 text-white opacity-70'
                ]"
              >
                {{ genderLabels[gender as keyof typeof genderLabels] }}
              </button>
            </div>
          </div>
          
          <!-- Language Filter -->
          <div>
            <label class="block text-white mb-2">Language</label>
            <select 
              v-model="filters.language"
              class="w-full bg-purple-800 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="any">Any Language</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ar">Arabic</option>
              <option value="zh">Chinese</option>
            </select>
          </div>
          
          <!-- Audio Quality Filter -->
          <div>
            <label class="block text-white mb-2">Audio Quality</label>
            <div class="flex justify-between items-center">
              <span class="text-white opacity-70">Low</span>
              <input 
                v-model="filters.audioQuality"
                type="range" 
                min="1" 
                max="3" 
                class="w-2/3 mx-2"
              >
              <span class="text-white opacity-70">High</span>
            </div>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex justify-end space-x-3 mt-6">
          <button 
            @click="resetFilters"
            class="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
          <button 
            @click="applyFilters"
            class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

const isOpen = ref(false);

// Filter options
const ageGroups = ['18-24', '25-34', '35+'];
const genderOptions = ['any', 'male', 'female'];
const genderLabels: Record<string, string> = {
  any: 'Any',
  male: 'Male',
  female: 'Female'
};

// Filter state
const filters = reactive({
  ageGroups: [] as string[],
  gender: 'any',
  language: 'any',
  audioQuality: 2
});

// Saved filters to apply
const savedFilters = reactive({
  ageGroups: [] as string[],
  gender: 'any',
  language: 'any',
  audioQuality: 2
});

function toggleFiltersPanel() {
  isOpen.value = true;
  
  // Load saved filters when opening
  filters.ageGroups = [...savedFilters.ageGroups];
  filters.gender = savedFilters.gender;
  filters.language = savedFilters.language;
  filters.audioQuality = savedFilters.audioQuality;
}

function closeFiltersPanel() {
  isOpen.value = false;
}

function toggleAgeFilter(age: string) {
  const index = filters.ageGroups.indexOf(age);
  if (index === -1) {
    filters.ageGroups.push(age);
  } else {
    filters.ageGroups.splice(index, 1);
  }
}

function toggleGenderFilter(gender: string) {
  filters.gender = gender;
}

function resetFilters() {
  filters.ageGroups = [];
  filters.gender = 'any';
  filters.language = 'any';
  filters.audioQuality = 2;
}

function applyFilters() {
  // Save current filter state
  savedFilters.ageGroups = [...filters.ageGroups];
  savedFilters.gender = filters.gender;
  savedFilters.language = filters.language;
  savedFilters.audioQuality = filters.audioQuality;
  
  // Close panel
  closeFiltersPanel();
}
</script>

<style scoped>
/* Modal animation */
.fixed {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Custom range input styling */
input[type="range"] {
  -webkit-appearance: none;
  height: 7px;
  background: #4B5563;
  border-radius: 5px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #3B82F6;
  border-radius: 50%;
  cursor: pointer;
}
</style> 