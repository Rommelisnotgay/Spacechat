<template>
  <div class="filter-panel">
    <div class="mb-4">
      <h2 class="text-xl font-bold text-white mb-2">Vibe Filters</h2>
      <p class="text-sm text-white opacity-70">Choose the type of conversations you're looking for</p>
    </div>

    <div class="space-y-3">
      <button 
        v-for="(label, vibe) in vibeDisplayNames" 
        :key="vibe" 
        @click="selectVibe(vibe)" 
        class="w-full text-left px-4 py-3 rounded-lg flex items-center"
        :class="vibe === selectedVibe ? 'bg-purple-600' : 'bg-purple-900 bg-opacity-50'"
      >
        <span class="mr-3 text-xl">{{ vibeEmojis[vibe as VibeType] }}</span>
        <span>{{ vibeDisplayNames[vibe as VibeType] }}</span>
      </button>
    </div>
    
    <!-- Filters Button -->
    <button 
      @click="openFilterModal"
      class="filter-button py-3 px-6 bg-space-purple-800 bg-opacity-70 rounded-full flex items-center ml-4"
    >
      <span class="text-blue-300 mr-2">🌐</span>
      <span>Filters</span>
    </button>
    
    <!-- Filter Modal -->
    <div 
      v-if="showFilterModal"
      class="filter-modal fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
    >
      <div class="filter-modal-content bg-space-purple-900 rounded-xl overflow-hidden shadow-2xl w-full max-w-md">
        <div class="filter-modal-header bg-gradient-to-r from-blue-800 to-purple-800 px-6 py-4 flex justify-between items-center">
          <h2 class="text-xl font-bold">Connection Filters</h2>
          <button 
            @click="closeFilterModal"
            class="text-gray-300 hover:text-white"
          >
            <span class="text-xl">✖</span>
          </button>
        </div>
        
        <div class="filter-modal-body p-6">
          <div class="mb-6">
            <h3 class="text-lg font-medium mb-2">Audio Preferences</h3>
            <div class="space-y-3">
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="noise-reduction" 
                  v-model="filters.noiseReduction"
                  class="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label for="noise-reduction" class="ml-2">Enable noise reduction</label>
              </div>
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="echo-cancellation" 
                  v-model="filters.echoCancellation"
                  class="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label for="echo-cancellation" class="ml-2">Enable echo cancellation</label>
              </div>
            </div>
          </div>
          
          <div class="mb-6">
            <h3 class="text-lg font-medium mb-2">Matching Preferences</h3>
            <div class="space-y-3">
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="same-language" 
                  v-model="filters.sameLanguage"
                  class="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label for="same-language" class="ml-2">Prefer same language (when available)</label>
              </div>
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="stable-connection" 
                  v-model="filters.stableConnection"
                  class="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <label for="stable-connection" class="ml-2">Prioritize connection stability</label>
              </div>
            </div>
          </div>
          
          <div class="mb-6">
            <h3 class="text-lg font-medium mb-2">User Language</h3>
            <select 
              v-model="filters.language"
              class="w-full px-4 py-2 bg-space-purple-800 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="auto">Auto Detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ru">Russian</option>
            </select>
          </div>
          
          <div class="text-center">
            <button 
              @click="saveFilters"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, onMounted, onUnmounted } from 'vue';
import { useLocalStorage } from '@/services/storage';

type VibeType = 'any' | 'friendly' | 'deep' | 'funny' | 'chill';

const vibeDisplayNames: Record<VibeType, string> = {
  any: 'Any Vibe',
  friendly: 'Friendly Chat',
  deep: 'Deep Conversations',
  funny: 'Humor & Fun',
  chill: 'Chill & Relaxed'
};

const vibeEmojis: Record<VibeType, string> = {
  any: '⭐',
  friendly: '👋',
  deep: '🌌',
  funny: '😂',
  chill: '🌊'
};

interface FilterSettings {
  noiseReduction: boolean;
  echoCancellation: boolean;
  sameLanguage: boolean;
  stableConnection: boolean;
  language: string;
}

export default defineComponent({
  name: 'FilterPanel',
  emits: ['vibe-changed', 'filters-changed'],
  setup(props, { emit }) {
    const { getItem, setItem } = useLocalStorage();
    
    // Vibe selection
    const showVibeOptions = ref(false);
    const selectedVibe = ref<VibeType>('any');
    
    // Filter modal
    const showFilterModal = ref(false);
    const filters = ref<FilterSettings>({
      noiseReduction: true,
      echoCancellation: true,
      sameLanguage: false,
      stableConnection: true,
      language: 'auto'
    });
    
    // Load saved preferences on mount
    onMounted(() => {
      // Load saved vibe
      const savedVibe = getItem('selectedVibe');
      if (savedVibe && Object.keys(vibeDisplayNames).includes(savedVibe)) {
        selectedVibe.value = savedVibe as VibeType;
      }
      
      // Load saved filters
      const savedFilters = getItem('filterSettings');
      if (savedFilters) {
        try {
          const parsedFilters = JSON.parse(savedFilters);
          filters.value = { ...filters.value, ...parsedFilters };
        } catch (error) {
          console.error('Error parsing saved filters:', error);
        }
      }
    });
    
    // Close options when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.any-vibe-dropdown')) {
        showVibeOptions.value = false;
      }
      
      if (showFilterModal.value && !target.closest('.filter-modal-content')) {
        closeFilterModal();
      }
    };
    
    // Add/remove event listeners
    onMounted(() => {
      document.addEventListener('click', handleClickOutside);
    });
    
    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside);
    });
    
    // Select a vibe
    const selectVibe = (vibe: VibeType) => {
      selectedVibe.value = vibe;
      showVibeOptions.value = false;
      
      // Save preference
      setItem('selectedVibe', vibe);
      
      // Emit change event
      emit('vibe-changed', vibe);
    };
    
    // Open filter modal
    const openFilterModal = () => {
      showFilterModal.value = true;
      // Prevent scrolling of background content
      document.body.style.overflow = 'hidden';
    };
    
    // Close filter modal
    const closeFilterModal = () => {
      showFilterModal.value = false;
      // Restore scrolling
      document.body.style.overflow = '';
    };
    
    // Save filters
    const saveFilters = () => {
      // Save preferences
      setItem('filterSettings', JSON.stringify(filters.value));
      
      // Emit change event
      emit('filters-changed', filters.value);
      
      // Close modal
      closeFilterModal();
    };
    
    // Watch for filter changes
    watch(() => selectedVibe.value, (newVibe) => {
      emit('vibe-changed', newVibe);
    });
    
    return {
      showVibeOptions,
      selectedVibe,
      vibeDisplayNames,
      vibeEmojis,
      showFilterModal,
      filters,
      selectVibe,
      openFilterModal,
      closeFilterModal,
      saveFilters
    };
  }
});
</script>

<style scoped>
.any-vibe-dropdown,
.filter-button {
  transition: all 0.2s;
}

.any-vibe-dropdown:active,
.filter-button:active {
  transform: scale(0.98);
}

.vibe-options {
  animation: fadeDown 0.2s ease-out;
}

.filter-modal {
  animation: fadeIn 0.2s ease-out;
}

.filter-modal-content {
  animation: slideUp 0.3s ease-out;
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(50px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style> 