<template>
  <div class="min-h-screen font-sans">
    <!-- Purple glow effects -->
    <div class="fixed inset-0 pointer-events-none">
      <div class="absolute top-1/4 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute top-1/3 right-1/3 w-24 h-24 bg-violet-500/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
      <div class="absolute bottom-1/4 left-1/3 w-28 h-28 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      <div class="absolute top-1/2 right-1/4 w-20 h-20 bg-fuchsia-500/20 rounded-full blur-2xl animate-pulse delay-500"></div>
    </div>
    
    <Starfield />
    
    <div class="relative min-h-screen z-10 text-white">
      <!-- Header -->
      <header class="p-2 sm:p-4 border-b border-white/10">
        <div class="max-w-4xl mx-auto">
          <!-- Logo -->
          <div class="text-center mb-2 sm:mb-4">
            <div class="inline-flex items-center gap-2">
              <div class="w-6 h-6 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
                <span class="text-white text-xs">✨</span>
              </div>
              <h1 class="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent drop-shadow-lg">
                SpaceTalk.live
              </h1>
            </div>
          </div>

          <!-- Statistics -->
          <div class="flex justify-center gap-2 mb-2 sm:mb-3">
            <div class="bg-green-500/20 rounded-full px-2 py-1 text-xs flex items-center gap-1">
              <div class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
              <span>{{ onlineCount }} online</span>
            </div>
            <div v-if="dailyConnections > 0" class="bg-purple-500/20 rounded-full px-2 py-1 text-xs">
              Today: {{ dailyConnections }} voices
            </div>
          </div>

          <!-- Vibe Selector -->
          <div class="grid grid-cols-2 gap-2 text-xs relative">
            <div class="relative" ref="vibeDropdownRef">
              <div @click="toggleVibeDropdown" class="cursor-pointer bg-purple-500/20 border border-purple-500/30 rounded-full h-8 flex items-center justify-between px-3 text-xs shadow-lg shadow-purple-500/20 text-white hover:bg-purple-500/30 active:scale-95 transition-all duration-150">
                <span class="flex items-center truncate">
                  {{ getVibeEmoji(selectedVibe) }} {{ getVibeText(selectedVibe) }}
                </span>
                <span class="ml-2 text-xs transition-transform duration-300" :class="{ 'rotate-180': showVibeDropdown }">▼</span>
              </div>
              
              <!-- Dropdown -->
              <div v-if="showVibeDropdown" class="absolute top-full left-0 mt-1 w-full bg-gray-800/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden transition-all duration-200 animate-dropdown">
                <div class="py-1">
                  <div
                    v-for="vibe in vibes" 
                    :key="vibe.value"
                    @click="selectVibe(vibe.value)"
                    class="px-3 py-2 hover:bg-gray-700/80 cursor-pointer transition-colors flex items-center gap-2"
                    :class="{'bg-gray-700/70': selectedVibe === vibe.value}"
                  >
                    <span class="text-sm">{{ vibe.emoji }}</span>
                    <span>{{ vibe.text }}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              @click="isFiltersOpen = true"
              class="bg-violet-500/20 border border-violet-500/30 rounded-full h-8 px-3 text-xs hover:bg-violet-500/30 active:scale-95 transition-all duration-150 shadow-lg shadow-violet-500/20"
            >
              🔍 Filters
            </button>
          </div>
        </div>
      </header>

      <!-- Main Content Area -->
      <main class="flex-1 p-2 sm:p-4">
        <div class="max-w-md mx-auto space-y-4 sm:space-y-6">
          <!-- Connection Status Card -->
          <connection-card 
            :status="connectionStatus" 
            :partner-info="partnerInfo" 
            :error-message="connectionError"
            :show-status="true"
          />

          <!-- Auto-reconnect option -->
          <div class="flex items-center justify-center gap-2 mb-2 sm:mb-4">
            <input
              type="checkbox"
              id="auto-reconnect"
              v-model="autoReconnect"
              class="w-3 h-3 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500 focus:ring-1"
            />
            <label for="auto-reconnect" class="text-xs text-gray-400 cursor-pointer">
              Auto-reconnect to others
            </label>
          </div>

          <!-- Control Buttons -->
          <control-buttons
            :is-muted="isMuted"
            :is-disabled="connectionStatus !== 'connected'"
            @toggle-mute="toggleMute"
            @find-next="findNext"
            @toggle-chat="toggleChat"
            @toggle-games="isGamesOpen = true"
            @toggle-history="isHistoryOpen = true"
            @toggle-donation="isDonationOpen = true"
          />

          <!-- Quote -->
          <div class="text-center">
            <p class="text-xs text-gray-400 italic">"{{ currentQuote }}"</p>
          </div>
        </div>
      </main>

      <!-- Guidelines Section -->
      <footer class="p-2 sm:p-4 border-t border-white/10">
        <div class="max-w-md mx-auto text-center space-y-1 sm:space-y-2">
          <h3 class="text-sm font-semibold text-emerald-400">Community Guidelines</h3>
          <div class="text-xs text-gray-300 space-y-0.5 sm:space-y-1">
            <p>• Must be 18+ years old to use this service</p>
            <p>• Be respectful and kind to other users</p>
            <p>• No harassment, hate speech, or inappropriate content</p>
            <p>• Report any misconduct using the report feature</p>
            <p>• Your privacy and safety are our priority</p>
          </div>
          <p class="text-xs text-gray-400 mt-2 sm:mt-3">
            By using SpaceTalk.live, you agree to follow these guidelines
          </p>
          
          <!-- Links Section -->
          <div class="flex flex-wrap justify-center gap-2 sm:gap-3 mt-2 sm:mt-4 text-xs">
            <a href="#" class="bg-cyan-500/20 border border-cyan-500/30 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/30 transition-all shadow-lg shadow-cyan-500/20">
              ℹ️ About
            </a>
            <a href="https://instagram.com" target="_blank" class="bg-pink-500/20 border border-pink-500/30 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 text-pink-300 hover:text-pink-200 hover:bg-pink-500/30 transition-all shadow-lg shadow-pink-500/20">
              📷 Instagram
            </a>
            <a href="https://facebook.com" target="_blank" class="bg-blue-500/20 border border-blue-500/30 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 text-blue-300 hover:text-blue-200 hover:bg-blue-500/30 transition-all shadow-lg shadow-blue-500/20">
              📘 Facebook
            </a>
            <a href="mailto:contact@spacetalk.live" class="bg-emerald-500/20 border border-emerald-500/30 rounded-full px-2 py-1 sm:px-3 sm:py-1.5 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/30 transition-all shadow-lg shadow-emerald-500/20">
              📧 Contact
            </a>
          </div>
        </div>
      </footer>
    </div>

    <!-- Call History Modal -->
    <div v-if="isHistoryOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-sm">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold text-indigo-400">📞 Call History</h2>
          <button
            @click="isHistoryOpen = false"
            class="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <div v-if="callHistory.length === 0" class="text-center py-8">
            <p class="text-gray-400 text-sm">No recent calls</p>
            <p class="text-xs text-gray-500 mt-1">Your last 3 conversations will appear here</p>
          </div>
          
          <div
            v-else
            v-for="(call, index) in callHistory"
            :key="call.id"
            class="bg-gray-700 rounded-lg p-3 flex items-center justify-between hover:bg-gray-600 transition-colors"
          >
            <div class="flex items-center gap-3">
              <span class="text-2xl">{{ call.flag }}</span>
              <div>
                <p class="text-white text-sm font-medium">{{ call.country }}</p>
                <p class="text-gray-400 text-xs">
                  {{ formatTime(call.timestamp) }}
                </p>
              </div>
            </div>
            <div class="text-xs text-gray-500">
              #{{ index + 1 }}
            </div>
          </div>
        </div>

        <p v-if="callHistory.length > 0" class="text-xs text-gray-500 text-center mt-4">
          History clears when you leave the page
        </p>
      </div>
    </div>

    <!-- Filters Modal -->
    <div v-if="isFiltersOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-20 p-4">
      <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto relative">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-lg font-semibold text-emerald-400">Filters & Preferences</h2>
          <button
            @click="isFiltersOpen = false"
            class="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        <div class="space-y-6">
          <!-- Preferred Countries -->
          <div>
            <label class="block text-sm font-medium mb-3 text-emerald-400">Preferred Countries</label>
            <div class="bg-gray-700 border border-gray-600 rounded-lg p-3 min-h-[60px] max-h-32 overflow-y-auto scrollbar-hide">
              <p v-if="preferredCountries.length === 0" class="text-xs text-gray-400 p-2">No countries selected</p>
              <div v-else class="flex flex-wrap gap-2">
                <span 
                  v-for="countryCode in preferredCountries" 
                  :key="countryCode"
                  class="bg-emerald-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1"
                >
                  <span class="flag-icon">{{ getCountryFlag(countryCode) }}</span> {{ getCountryName(countryCode) }}
                  <button
                    @click="removePreferredCountry(countryCode)"
                    class="text-emerald-200 hover:text-white ml-1"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
            
            <div class="mt-2 relative preferred-dropdown" ref="preferredDropdownRef">
              <div @click="togglePreferredDropdown" class="cursor-pointer flex items-center justify-between w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white">
                <span class="text-gray-300">Add preferred country...</span>
                <span class="ml-1">▼</span>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-2">You'll be matched only with users from these countries</p>
          </div>

          <!-- Blocked Countries -->
          <div>
            <label class="block text-sm font-medium mb-3 text-red-400">Blocked Countries</label>
            <div class="bg-gray-700 border border-gray-600 rounded-lg p-3 min-h-[60px] max-h-32 overflow-y-auto scrollbar-hide">
              <p v-if="blockedCountries.length === 0" class="text-xs text-gray-400 p-2">No countries blocked</p>
              <div v-else class="flex flex-wrap gap-2">
                <span 
                  v-for="countryCode in blockedCountries" 
                  :key="countryCode"
                  class="bg-red-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1"
                >
                  <span class="flag-icon">{{ getCountryFlag(countryCode) }}</span> {{ getCountryName(countryCode) }}
                  <button
                    @click="removeBlockedCountry(countryCode)"
                    class="text-red-200 hover:text-white ml-1"
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
            
            <div class="mt-2 relative blocked-dropdown" ref="blockedDropdownRef">
              <div @click="toggleBlockedDropdown" class="cursor-pointer flex items-center justify-between w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white">
                <span class="text-gray-300">Add blocked country...</span>
                <span class="ml-1">▼</span>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-2">You won't be matched with users from these countries</p>
          </div>
        </div>
        
        <div class="flex gap-2 mt-8">
          <button
            @click="clearFilters"
            class="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg text-sm transition-colors"
          >
            Clear All
          </button>
          <button
            @click="applyFilters"
            class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-lg text-sm transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
    
    <!-- Dropdown lists outside the filters modal -->
    <div v-if="showPreferredDropdown" class="fixed z-50 max-h-64 bg-gray-700 border border-gray-600 rounded-lg shadow-lg overflow-y-auto scrollbar-hide dropdown-outer preferred-outer">
      <div class="py-1 w-full">
        <div v-if="availableCountriesForPreferred.length === 0" class="text-xs text-gray-400 px-3 py-2">No more countries available</div>
        <div 
          v-for="country in availableCountriesForPreferred" 
          :key="country.value"
          @click="() => { addPreferredCountry(country.value); togglePreferredDropdown(); }"
          class="cursor-pointer px-3 py-2 hover:bg-gray-600 flex items-center gap-2"
        >
          <span class="flag-icon w-6 text-center">{{ country.flag }}</span>
          <span class="text-sm">{{ country.name }}</span>
        </div>
      </div>
    </div>
    
    <div v-if="showBlockedDropdown" class="fixed z-50 max-h-64 bg-gray-700 border border-gray-600 rounded-lg shadow-lg overflow-y-auto scrollbar-hide dropdown-outer blocked-outer">
      <div class="py-1 w-full">
        <div v-if="availableCountriesForBlocked.length === 0" class="text-xs text-gray-400 px-3 py-2">No more countries available</div>
        <div 
          v-for="country in availableCountriesForBlocked" 
          :key="country.value"
          @click="() => { addBlockedCountry(country.value); toggleBlockedDropdown(); }"
          class="cursor-pointer px-3 py-2 hover:bg-gray-600 flex items-center gap-2"
        >
          <span class="flag-icon w-6 text-center">{{ country.flag }}</span>
          <span class="text-sm">{{ country.name }}</span>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <chat-modal
      :is-open="isChatOpen"
      @close="isChatOpen = false"
      :messages="chatMessages"
      @send-message="sendChatMessage"
      :is-connected="connectionStatus === 'connected'"
    />
    
    <games-modal
      :is-open="isGamesOpen"
      @close="isGamesOpen = false"
      :is-connected="connectionStatus === 'connected'"
      @select-game="selectGame"
      :partner-id="partnerId || ''"
      :initial-game-room-id="gameRoomId"
    />
    
    <donation-modal
      :is-open="isDonationOpen"
      @close="isDonationOpen = false"
    />
    
    <!-- Audio component integrated with controls but not directly visible -->
    <div class="hidden" v-if="connectionStatus === 'connected'">
      <AudioOutput :showControls="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue';
import { useSocket } from '@/services/socket';
import { useWebRTC } from '@/services/webrtc';
import { useChat } from '@/services/chat';
import { useRoute } from 'vue-router';

// Components
import ConnectionCard from '@/components/connection-card.vue';
import ControlButtons from '@/components/control-buttons.vue';
import ChatModal from '@/components/chat-modal.vue';
import GamesModal from '@/components/games-modal.vue';
import DonationModal from '@/components/donation-modal.vue';
import SelectVue from '@/components/ui/select.vue';
import Starfield from '@/components/starfield.vue';
import AudioOutput from '@/components/audio/AudioOutput.vue';

// State management
const connectionStatus = ref<string>('disconnected'); // disconnected, searching, matched, connected
const partnerId = ref<string | null>(null);
const partnerInfo = ref<any>(null);
const connectionError = ref<string>(''); // Add variable for error messages
const isMuted = ref(false);
let connectionCheckInterval: ReturnType<typeof setInterval> | null = null; // Add interval for checking connection status

// UI state
const isChatOpen = ref(false);
const isGamesOpen = ref(false);
const isDonationOpen = ref(false);
const isHistoryOpen = ref(false);
const isFiltersOpen = ref(false);
const onlineCount = ref(0);
const dailyConnections = ref(0);
const autoReconnect = ref(false);
const chatMessages = ref<Array<{id: string; message: string; isOwn: boolean; timestamp: number}>>([]);
const callHistory = ref<Array<{id: string; country: string; flag: string; timestamp: number}>>([]);

// Filter options
const selectedVibe = ref('any');
const showVibeDropdown = ref(false);
const preferredCountries = ref<string[]>([]);
const blockedCountries = ref<string[]>([]);
const tempCountrySelect = ref('');
const tempBlockedSelect = ref('');
const showPreferredDropdown = ref(false);
const showBlockedDropdown = ref(false);

// Vibes options
const vibes = [
  { value: 'any', text: 'Go With the Flow', emoji: '🌟' },
  { value: 'chill', text: 'Chill', emoji: '😌' },
  { value: 'fun', text: 'Fun', emoji: '🎉' },
  { value: 'curious', text: 'Curious', emoji: '🤔' },
  { value: 'creative', text: 'Creative', emoji: '🎨' }
];

// Temporary countries list until API is loaded
const countries = ref<any[]>([
  { value: 'any', label: '🌍 Any Country', name: 'Any Country', flag: '🌍' },
  { value: 'ae', label: '🇦🇪 UAE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { value: 'af', label: '🇦🇫 Afghanistan', name: 'Afghanistan', flag: '🇦🇫' },
  { value: 'al', label: '🇦🇱 Albania', name: 'Albania', flag: '🇦🇱' },
  { value: 'dz', label: '🇩🇿 Algeria', name: 'Algeria', flag: '🇩🇿' },
  { value: 'ar', label: '🇦🇷 Argentina', name: 'Argentina', flag: '🇦🇷' },
  { value: 'au', label: '🇦🇺 Australia', name: 'Australia', flag: '🇦🇺' },
  { value: 'at', label: '🇦🇹 Austria', name: 'Austria', flag: '🇦🇹' },
  { value: 'bh', label: '🇧🇭 Bahrain', name: 'Bahrain', flag: '🇧🇭' },
  { value: 'bd', label: '🇧🇩 Bangladesh', name: 'Bangladesh', flag: '🇧🇩' },
  { value: 'be', label: '🇧🇪 Belgium', name: 'Belgium', flag: '🇧🇪' },
  { value: 'br', label: '🇧🇷 Brazil', name: 'Brazil', flag: '🇧🇷' },
  { value: 'ca', label: '🇨🇦 Canada', name: 'Canada', flag: '🇨🇦' },
  { value: 'cn', label: '🇨🇳 China', name: 'China', flag: '🇨🇳' },
  { value: 'dk', label: '🇩🇰 Denmark', name: 'Denmark', flag: '🇩🇰' },
  { value: 'eg', label: '🇪🇬 Egypt', name: 'Egypt', flag: '🇪🇬' },
  { value: 'fi', label: '🇫🇮 Finland', name: 'Finland', flag: '🇫🇮' },
  { value: 'fr', label: '🇫🇷 France', name: 'France', flag: '🇫🇷' },
  { value: 'de', label: '🇩🇪 Germany', name: 'Germany', flag: '🇩🇪' },
  { value: 'gr', label: '🇬🇷 Greece', name: 'Greece', flag: '🇬🇷' },
  { value: 'hk', label: '🇭🇰 Hong Kong', name: 'Hong Kong', flag: '🇭🇰' },
  { value: 'hu', label: '🇭🇺 Hungary', name: 'Hungary', flag: '🇭🇺' },
  { value: 'in', label: '🇮🇳 India', name: 'India', flag: '🇮🇳' },
  { value: 'id', label: '🇮🇩 Indonesia', name: 'Indonesia', flag: '🇮🇩' },
  { value: 'ir', label: '🇮🇷 Iran', name: 'Iran', flag: '🇮🇷' },
  { value: 'iq', label: '🇮🇶 Iraq', name: 'Iraq', flag: '🇮🇶' },
  { value: 'ie', label: '🇮🇪 Ireland', name: 'Ireland', flag: '🇮🇪' },
  { value: 'it', label: '🇮🇹 Italy', name: 'Italy', flag: '🇮🇹' },
  { value: 'jp', label: '🇯🇵 Japan', name: 'Japan', flag: '🇯🇵' },
  { value: 'jo', label: '🇯🇴 Jordan', name: 'Jordan', flag: '🇯🇴' },
  { value: 'kz', label: '🇰🇿 Kazakhstan', name: 'Kazakhstan', flag: '🇰🇿' },
  { value: 'kr', label: '🇰🇷 Korea', name: 'South Korea', flag: '🇰🇷' },
  { value: 'kw', label: '🇰🇼 Kuwait', name: 'Kuwait', flag: '🇰🇼' },
  { value: 'lb', label: '🇱🇧 Lebanon', name: 'Lebanon', flag: '🇱🇧' },
  { value: 'ly', label: '🇱🇾 Libya', name: 'Libya', flag: '🇱🇾' },
  { value: 'my', label: '🇲🇾 Malaysia', name: 'Malaysia', flag: '🇲🇾' },
  { value: 'mx', label: '🇲🇽 Mexico', name: 'Mexico', flag: '🇲🇽' },
  { value: 'ma', label: '🇲🇦 Morocco', name: 'Morocco', flag: '🇲🇦' },
  { value: 'nl', label: '🇳🇱 Netherlands', name: 'Netherlands', flag: '🇳🇱' },
  { value: 'nz', label: '🇳🇿 New Zealand', name: 'New Zealand', flag: '🇳🇿' },
  { value: 'ng', label: '🇳🇬 Nigeria', name: 'Nigeria', flag: '🇳🇬' },
  { value: 'no', label: '🇳🇴 Norway', name: 'Norway', flag: '🇳🇴' },
  { value: 'om', label: '🇴🇲 Oman', name: 'Oman', flag: '🇴🇲' },
  { value: 'pk', label: '🇵🇰 Pakistan', name: 'Pakistan', flag: '🇵🇰' },
  { value: 'ps', label: '🇵🇸 Palestine', name: 'Palestine', flag: '🇵🇸' },
  { value: 'ph', label: '🇵🇭 Philippines', name: 'Philippines', flag: '🇵🇭' },
  { value: 'pl', label: '🇵🇱 Poland', name: 'Poland', flag: '🇵🇱' },
  { value: 'pt', label: '🇵🇹 Portugal', name: 'Portugal', flag: '🇵🇹' },
  { value: 'qa', label: '🇶🇦 Qatar', name: 'Qatar', flag: '🇶🇦' },
  { value: 'ro', label: '🇷🇴 Romania', name: 'Romania', flag: '🇷🇴' },
  { value: 'ru', label: '🇷🇺 Russia', name: 'Russia', flag: '🇷🇺' },
  { value: 'sa', label: '🇸🇦 Saudi Arabia', name: 'Saudi Arabia', flag: '🇸🇦' },
  { value: 'sg', label: '🇸🇬 Singapore', name: 'Singapore', flag: '🇸🇬' },
  { value: 'za', label: '🇿🇦 South Africa', name: 'South Africa', flag: '🇿🇦' },
  { value: 'es', label: '🇪🇸 Spain', name: 'Spain', flag: '🇪🇸' },
  { value: 'sd', label: '🇸🇩 Sudan', name: 'Sudan', flag: '🇸🇩' },
  { value: 'se', label: '🇸🇪 Sweden', name: 'Sweden', flag: '🇸🇪' },
  { value: 'ch', label: '🇨🇭 Switzerland', name: 'Switzerland', flag: '🇨🇭' },
  { value: 'sy', label: '🇸🇾 Syria', name: 'Syria', flag: '🇸🇾' },
  { value: 'tw', label: '🇹🇼 Taiwan', name: 'Taiwan', flag: '🇹🇼' },
  { value: 'th', label: '🇹🇭 Thailand', name: 'Thailand', flag: '🇹🇭' },
  { value: 'tn', label: '🇹🇳 Tunisia', name: 'Tunisia', flag: '🇹🇳' },
  { value: 'tr', label: '🇹🇷 Turkey', name: 'Turkey', flag: '🇹🇷' },
  { value: 'ua', label: '🇺🇦 Ukraine', name: 'Ukraine', flag: '🇺🇦' },
  { value: 'gb', label: '🇬🇧 UK', name: 'United Kingdom', flag: '🇬🇧' },
  { value: 'us', label: '🇺🇸 USA', name: 'United States', flag: '🇺🇸' },
  { value: 'ye', label: '🇾🇪 Yemen', name: 'Yemen', flag: '🇾🇪' }
]);

// Load all countries from API
const loadCountries = async () => {
  try {
    const response = await fetch('/api/countries');
    if (!response.ok) {
      throw new Error('Failed to load countries');
    }
    
    let data = await response.json();
    // Use static list if API fails
    if (!data || data.length === 0) {
      console.log('Using static countries list');
      return;
    }
    
    // Filter out Israel from the API results
    data = data.filter((country: any) => country.value !== 'il');
    
    // Check if Palestine is in the list, add it if not
    const hasPalestine = data.some((country: any) => country.value === 'ps');
    if (!hasPalestine) {
      data.push({ value: 'ps', label: '🇵🇸 Palestine', name: 'Palestine', flag: '🇵🇸' });
    }
    
    // Make sure Egypt is in the list
    const hasEgypt = data.some((country: any) => country.value === 'eg');
    if (!hasEgypt) {
      data.push({ value: 'eg', label: '🇪🇬 Egypt', name: 'Egypt', flag: '🇪🇬' });
    }
    
    // Sort data alphabetically by name (after excluding 'any')
    data.sort((a: any, b: any) => a.name.localeCompare(b.name));
    
    // Add "any" option to the beginning
    countries.value = [
      { value: 'any', label: '🌍 Any Country', name: 'Any Country', flag: '🌍' },
      ...data
    ];
    
    console.log('Countries loaded:', countries.value.length);
    console.log('Filtered out Israel and ensured Palestine and Egypt are included');
  } catch (error) {
    console.error('Failed to load countries list:', error);
    // Static list is already loaded as fallback
  }
};

// User's own country information
const userLocation = ref<{
  country: string;
  countryCode: string;
  flag: string;
} | null>(null);

// Cosmic quotes
const cosmicQuotes = [
  "You're not alone in the universe.",
  "Every voice carries a story from across the stars.",
  "Connection transcends distance in the cosmic web.",
  "Discover new worlds through conversation.",
  "In space, every voice matters."
];
const currentQuote = ref(cosmicQuotes[Math.floor(Math.random() * cosmicQuotes.length)]);

// Initialize services
const socketService = useSocket();
const socket = socketService.socket;
const { isConnected } = socketService;
const { 
  remoteStream,
  localStream,
  connectionState: webRTCConnectionState,
  createOffer, 
  handleOffer, 
  handleAnswer, 
  handleIceCandidate,
  closeConnection,
  toggleMicrophone,
  initializeLocalStream
} = useWebRTC();
const chat = useChat();

// Extract route params
const route = useRoute();
const gameRoomId = ref(route.params.roomId as string || null);

// If we came from a game link, automatically open the games modal
watch(() => gameRoomId.value, (newRoomId) => {
  if (newRoomId) {
    isGamesOpen.value = true;
  }
}, { immediate: true });

// Computed properties for country selectors
const availableCountriesForPreferred = computed(() => {
  // Show all countries when no preferred countries are selected
  return countries.value.filter(c => 
    c.value !== 'any' && 
    !preferredCountries.value.includes(c.value) && 
    !blockedCountries.value.includes(c.value)
  );
});

const availableCountriesForBlocked = computed(() => {
  // Show all countries when no blocked countries are selected
  return countries.value.filter(c => 
    c.value !== 'any' && 
    !blockedCountries.value.includes(c.value) && 
    !preferredCountries.value.includes(c.value)
  );
});

// Methods
const toggleMute = async () => {
  const newValue = await toggleMicrophone();
  if (isMuted.value !== !newValue) {
    isMuted.value = !newValue;
  }
  
  if (connectionStatus.value === 'connected') {
    setTimeout(() => {
      const audioElement = document.querySelector('audio');
      if (audioElement && audioElement.paused) {
        audioElement.play().catch(() => {});
      }
    }, 300);
  }
};

const findNext = async () => {
  // If we don't have microphone access yet, request it
  if (!localStream.value) {
    try {
      await initializeLocalStream();
      console.log('Microphone initialized');
    } catch (error) {
      console.error('Failed to access microphone', error);
      alert('Please allow microphone access to use voice chat');
      return;
    }
  }
  
  // Handle next partner request
  if (socket.value) {
    // Show status of searching for a new partner
    connectionStatus.value = 'searching';
    
    // If there's a current partner, disconnect from them first
    if (partnerId.value) {
      console.log('Disconnecting from current partner');
      socket.value.emit('disconnect-partner');
      partnerId.value = null;
      partnerInfo.value = null;
      chatMessages.value = [];
      // Close current WebRTC connection
      closeConnection();
    }
    
    console.log('Finding new partner with preferences');
    // Send request to join the waiting queue with user preferences
    socket.value.emit('join-queue', {
      vibe: selectedVibe.value,
      preferences: {
        preferredCountries: preferredCountries.value.length ? preferredCountries.value : undefined,
        blockedCountries: blockedCountries.value.length ? blockedCountries.value : undefined
      }
    });
    
    dailyConnections.value++;
  }
};

const toggleChat = () => {
  isChatOpen.value = !isChatOpen.value;
  
  // Mark messages as read when opening chat
  if (isChatOpen.value && partnerId.value) {
    chat.markAsRead(partnerId.value);
  }
};

const toggleGamesOpen = () => {
  isGamesOpen.value = !isGamesOpen.value;
};

const toggleDonationOpen = () => {
  isDonationOpen.value = !isDonationOpen.value;
};

const toggleHistoryOpen = () => {
  isHistoryOpen.value = !isHistoryOpen.value;
};

const toggleFiltersOpen = () => {
  isFiltersOpen.value = !isFiltersOpen.value;
};

const sendChatMessage = (message: string) => {
  if (socket.value && partnerId.value) {
    socket.value.emit('chat-message', { message, to: partnerId.value });
    
    chatMessages.value.push({
      id: Date.now().toString(),
      message,
      isOwn: true,
      timestamp: Date.now()
    });
  }
};

const selectGame = (game: string) => {
  console.log(`Selected game: ${game}`);
  if (socket.value && partnerId.value) {
    socket.value.emit('game-invite', { game, to: partnerId.value });
  }
};

// Filter methods
const addPreferredCountry = (countryCode: string) => {
  if (countryCode && !preferredCountries.value.includes(countryCode)) {
    preferredCountries.value.push(countryCode);
  }
};

const removePreferredCountry = (countryCode: string) => {
  preferredCountries.value = preferredCountries.value.filter(c => c !== countryCode);
};

const addBlockedCountry = (countryCode: string) => {
  if (countryCode && !blockedCountries.value.includes(countryCode)) {
    blockedCountries.value.push(countryCode);
    const countryName = getCountryName(countryCode);
    console.log(`Added ${countryName} (${countryCode}) to blocked countries list`);
    // Save immediately to persist changes
    localStorage.setItem('blockedCountries', JSON.stringify(blockedCountries.value));
  }
};

const removeBlockedCountry = (countryCode: string) => {
  blockedCountries.value = blockedCountries.value.filter(c => c !== countryCode);
  const countryName = getCountryName(countryCode);
  console.log(`Removed ${countryName} (${countryCode}) from blocked countries list`);
  // Save immediately to persist changes
  localStorage.setItem('blockedCountries', JSON.stringify(blockedCountries.value));
};

const clearFilters = () => {
  preferredCountries.value = [];
  blockedCountries.value = [];
  localStorage.removeItem('preferredCountries');
  localStorage.removeItem('blockedCountries');
};

const applyFilters = () => {
  // Add diagnostic logs
  console.log('Applying filters with the following settings:');
  console.log('- Blocked countries:', blockedCountries.value.length ? blockedCountries.value : 'None');
  console.log('- Preferred countries:', preferredCountries.value.length ? preferredCountries.value : 'None');
  
  isFiltersOpen.value = false;
  saveFilterSettings();
  restartMatching();
};

// Utility methods
const getCountryFlag = (countryCode: string): string => {
  const country = countries.value.find(c => c.value === countryCode);
  return country ? country.flag : '🏳️';
};

const getCountryName = (countryCode: string): string => {
  const country = countries.value.find(c => c.value === countryCode);
  return country ? country.name : 'Earth';
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

// Vibe selector functions
const toggleVibeDropdown = () => {
  showVibeDropdown.value = !showVibeDropdown.value;
};

const selectVibe = (value: string) => {
  selectedVibe.value = value;
  showVibeDropdown.value = false;
};

const getVibeEmoji = (value: string) => {
  const vibe = vibes.find(v => v.value === value);
  return vibe ? vibe.emoji : '🌟';
};

const getVibeText = (value: string) => {
  const vibe = vibes.find(v => v.value === value);
  return vibe ? vibe.text : 'Go With the Flow';
};

// Toggle dropdown visibility
const preferredDropdownRef = ref<HTMLElement | null>(null);
const blockedDropdownRef = ref<HTMLElement | null>(null);

// Update dropdown positions
const updateDropdownPosition = () => {
  nextTick(() => {
    const preferredDropdownRect = preferredDropdownRef.value?.getBoundingClientRect();
    const blockedDropdownRect = blockedDropdownRef.value?.getBoundingClientRect();
    
    const preferredOuter = document.querySelector('.preferred-outer') as HTMLElement;
    const blockedOuter = document.querySelector('.blocked-outer') as HTMLElement;
    
    if (preferredDropdownRect && preferredOuter) {
      preferredOuter.style.left = `${preferredDropdownRect.left}px`;
      preferredOuter.style.top = `${preferredDropdownRect.bottom + 5}px`;
      preferredOuter.style.width = `${preferredDropdownRect.width}px`;
    }
    
    if (blockedDropdownRect && blockedOuter) {
      blockedOuter.style.left = `${blockedDropdownRect.left}px`;
      blockedOuter.style.top = `${blockedDropdownRect.bottom + 5}px`;
      blockedOuter.style.width = `${blockedDropdownRect.width}px`;
    }
  });
};

const togglePreferredDropdown = () => {
  showPreferredDropdown.value = !showPreferredDropdown.value;
  if (showPreferredDropdown.value) {
    showBlockedDropdown.value = false;
    updateDropdownPosition();
  }
};

const toggleBlockedDropdown = () => {
  showBlockedDropdown.value = !showBlockedDropdown.value;
  if (showBlockedDropdown.value) {
    showPreferredDropdown.value = false;
    updateDropdownPosition();
  }
};

// Save and load filter settings
const saveFilterSettings = () => {
  // Save to localStorage for persistence
  localStorage.setItem('preferredCountries', JSON.stringify(preferredCountries.value));
  localStorage.setItem('blockedCountries', JSON.stringify(blockedCountries.value));
};

const loadFilterSettings = () => {
  try {
    const savedPreferred = localStorage.getItem('preferredCountries');
    const savedBlocked = localStorage.getItem('blockedCountries');
    
    if (savedPreferred) {
      preferredCountries.value = JSON.parse(savedPreferred);
    }
    
    if (savedBlocked) {
      blockedCountries.value = JSON.parse(savedBlocked);
    }
  } catch (error) {
    console.error('Error loading filter settings:', error);
  }
};

const restartMatching = () => {
  if (socket.value && isConnected.value) {
    console.log('Restarting matching with updated filters:', {
      preferredCountries: preferredCountries.value,
      blockedCountries: blockedCountries.value
    });
    
    socket.value.emit('startMatching', {
      preferredCountries: preferredCountries.value.length > 0 ? preferredCountries.value : null,
      blockedCountries: blockedCountries.value // Always send this array, even if empty
    });
    
    // Update UI to show searching state
    connectionStatus.value = 'searching';
    connectionError.value = '';
  } else {
    console.warn('Cannot restart matching - socket not connected');
  }
};

// Watch connection status changes
watch(connectionStatus, (newStatus) => {
  console.log(`Connection status changed to: ${newStatus}`);
  
  // Set up connection monitoring when connected
  if (newStatus === 'connected') {
    // Clear existing interval if any
    if (connectionCheckInterval) {
      clearInterval(connectionCheckInterval);
    }
    
    // Create new interval that checks connection health
    connectionCheckInterval = setInterval(() => {
      // If we have a partner ID but no active WebRTC connection, something is wrong
      if (partnerId.value && webRTCConnectionState.value !== 'connected') {
        console.log('Connection health check: WebRTC not connected but partnerId exists');
        
        // Check how long the connection has been in a non-connected state
        if (['failed', 'closed', 'disconnected'].includes(webRTCConnectionState.value)) {
          console.log('Connection appears to be broken - resetting UI state');
          connectionStatus.value = 'disconnected';
          partnerId.value = null;
          partnerInfo.value = null;
        }
      }
    }, 2000); // Check every 2 seconds
  } else if (newStatus === 'disconnected') {
    // Clear the interval when disconnected
    if (connectionCheckInterval) {
      clearInterval(connectionCheckInterval);
      connectionCheckInterval = null;
    }
  }
});

// Socket event setup
onMounted(() => {
  console.log('Home view mounted');
  
  // Load countries list
  loadCountries();
  
  // Load saved preferences
  try {
    const savedPreferredCountries = localStorage.getItem('preferredCountries');
    const savedBlockedCountries = localStorage.getItem('blockedCountries');
    
    if (savedPreferredCountries) {
      preferredCountries.value = JSON.parse(savedPreferredCountries);
    }
    
    if (savedBlockedCountries) {
      blockedCountries.value = JSON.parse(savedBlockedCountries);
    }
  } catch (error) {
    console.error('Error loading saved preferences:', error);
  }
  
  // Set up socket.io event listeners
  if (socket.value) {
    // Add handler for filters-updated event
    socket.value.on('filters-updated', (data: { success: boolean }) => {
      if (data.success) {
        console.log('Filters updated successfully on server');
        // Toast notification could be added here
      }
    });

    // Listen for user location data from server
    socket.value.on('user-location', (locationData: any) => {
      console.log('Received user location:', locationData);
      
      // تأكد من أن البيانات صحيحة وكاملة
      if (locationData && locationData.countryCode && locationData.country) {
        userLocation.value = locationData;
        
        // إضافة البلد تلقائياً إلى قائمة البلدان المفضلة إذا لم يكن المستخدم قد اختار أي بلد
        if (preferredCountries.value.length === 0 && locationData.countryCode !== 'unknown' && locationData.countryCode !== 'earth') {
          console.log(`Adding user's country ${locationData.country} (${locationData.countryCode}) to preferred countries`);
          preferredCountries.value.push(locationData.countryCode);
          
          // حفظ الإعدادات
          saveFilterSettings();
        }
        
        // إعلام المستخدم بالبلد المكتشف
        console.log(`Your location: ${locationData.flag} ${locationData.country}`);
      } else {
        console.warn('Received incomplete location data:', locationData);
      }
    });

    socket.value.on('online-count', (count: number) => {
      onlineCount.value = count;
    });
    
    socket.value.on('matched', (data: any) => {
      console.log('Partner matched with event:', data);
      
      // Set the state to "matched" explicitly
      connectionStatus.value = 'matched';
      connectionError.value = ''; // Clear any previous error messages
      
      partnerId.value = data.partnerId;
      partnerInfo.value = {
        id: data.partnerId,
        country: data.country || 'Earth',
        countryCode: data.countryCode || 'unknown',
        flag: data.flag || '🌍',
        vibe: data.vibe || 'any'
      };
      
      // Add to call history
      callHistory.value.unshift({
        id: Date.now().toString(),
        country: partnerInfo.value.country,
        flag: partnerInfo.value.flag,
        timestamp: Date.now()
      });
      
      // Keep only last 3 entries
      if (callHistory.value.length > 3) {
        callHistory.value = callHistory.value.slice(0, 3);
      }
      
      // Start WebRTC connection immediately without delay
      if (data.partnerId) {
        console.log('Initiating WebRTC connection with partner immediately');
        const { createOffer } = useWebRTC();
        createOffer(data.partnerId);
        
        // Make sure the state doesn't change to "connected" until audio is confirmed working
        setTimeout(() => {
          if (connectionStatus.value === 'matched' && webRTCConnectionState.value === 'connected') {
            console.log('WebRTC connection established, updating UI state');
            connectionStatus.value = 'connected';
          }
        }, 2000);
      }
    });

    socket.value.on('direct-connection-established', (data: any) => {
      console.log('Direct connection established:', data);
      connectionStatus.value = 'connected';
      partnerId.value = data.partnerId;
              partnerInfo.value = {
          id: data.partnerId,
          country: data.country || 'Earth',
          countryCode: data.countryCode || 'unknown',
          flag: data.flag || '🌍'
        };
    });
    
    socket.value.on('partner-disconnected', (data: any = {}) => {
      console.log('Partner disconnected event received:', data);
      
      // Close WebRTC connection to ensure all media tracks are stopped
      closeConnection();
      
      // Update UI state
      connectionStatus.value = 'disconnected';
      partnerId.value = null;
      partnerInfo.value = null;
      chatMessages.value = [];
      
      // Show a notification based on the reason for disconnection
      let disconnectReason = '';
      if (data && data.reason) {
        switch (data.reason) {
          case 'user-initiated':
            disconnectReason = 'الطرف الآخر أنهى المحادثة';
            break;
          case 'connection-lost':
            disconnectReason = 'انقطع اتصال الطرف الآخر';
            break;
          default:
            disconnectReason = 'انتهت المحادثة';
        }
        
        // Display a temporary notification
        connectionError.value = disconnectReason;
        setTimeout(() => {
          if (connectionError.value === disconnectReason) {
            connectionError.value = '';
          }
        }, 5000);
      }
      
      // If auto-reconnect is enabled, find a new partner
      if (autoReconnect.value) {
        setTimeout(() => {
          if (connectionStatus.value === 'disconnected' && autoReconnect.value) {
            findNext();
          }
        }, 2000);
      }
    });
    
    socket.value.on('chat-message', (data: any) => {
      chatMessages.value.push({
        id: Date.now().toString(),
        message: data.message,
        isOwn: false,
        timestamp: Date.now()
      });
    });
    
    socket.value.on('error', (data: any) => {
      console.error('Socket error:', data.message);
      if (data.type === 'matching') {
        connectionStatus.value = 'disconnected';
      }
    });

    socket.value.on('voice-offer', handleVoiceOffer);
    socket.value.on('voice-answer', handleVoiceAnswer);
    socket.value.on('ice-candidate', processIceCandidateMessage);
    
    // Request online count when component mounts
    socket.value.emit('get-online-count');
  }

  document.addEventListener('click', handleClickOutside);
  window.addEventListener('resize', updateDropdownPosition);
  document.addEventListener('scroll', updateDropdownPosition, true);
  
  // Check localStorage for saved filters
  loadFilterSettings();
});

onBeforeUnmount(() => {
  console.log('Home view unmounting, cleaning up connection');
  closeConnection();
  
  // Clear connection check interval
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  
  // Remove event listeners
  if (socket.value) {
    socket.value.off('online-count');
    socket.value.off('matched');
    socket.value.off('direct-connection-established');
    socket.value.off('partner-disconnected');
    socket.value.off('chat-message');
    socket.value.off('error');
    socket.value.off('voice-offer');
    socket.value.off('voice-answer');
    socket.value.off('ice-candidate');
  }

  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('resize', updateDropdownPosition);
  document.removeEventListener('scroll', updateDropdownPosition, true);
});

// WebRTC handling methods
const handleVoiceOffer = async (data: any) => {
  console.log('Received voice offer - forwarding to WebRTC service');
  // All operations are forwarded to the WebRTC service
  handleOffer(data.offer, data.from);
};

const handleVoiceAnswer = async (data: any) => {
  console.log('Received voice answer - forwarding to WebRTC service');
  // All operations are forwarded to the WebRTC service
  handleAnswer(data.answer);
};

const processIceCandidateMessage = async (data: any) => {
  console.log('Received ICE candidate - forwarding to WebRTC service');
  // All operations are forwarded to the WebRTC service
  handleIceCandidate(data.candidate);
};

// WebRTC connection state monitor
watch(webRTCConnectionState, (newState, oldState) => {
  console.log(`[HomeView] WebRTC connection state changed: ${oldState} -> ${newState}`);
  
  // Show connection status to the user
  if (newState === 'connected' && connectionStatus.value === 'matched') {
    // Don't change the status immediately, first make sure audio is working
    setTimeout(() => {
      // Check again that the connection is still connected
      if (webRTCConnectionState.value === 'connected' && connectionStatus.value === 'matched') {
        connectionStatus.value = 'connected';
        connectionError.value = ''; // Clear any previous error messages
        console.log('[HomeView] Successfully transitioned from matched to connected');
      }
    }, 1000); // Short delay to ensure connection stability
  } else if (newState === 'failed') {
    // Hide error message initially, show after 1 minute if still not connected
    connectionError.value = '';
    setTimeout(() => {
      if (webRTCConnectionState.value === 'failed' && 
          (connectionStatus.value === 'matched' || connectionStatus.value === 'connected')) {
        connectionError.value = 'Connection failed. Press "Next" to find a new partner.';
      }
    }, 60000); // 1 minute delay
  } else if (newState === 'disconnected') {
    // Only set error if we were in connected or matched state, but delay showing it
    if (connectionStatus.value === 'connected' || connectionStatus.value === 'matched') {
      connectionError.value = '';
      setTimeout(() => {
        // Only show error if we're still disconnected after 1 minute
        if (webRTCConnectionState.value === 'disconnected' && 
            (connectionStatus.value === 'connected' || connectionStatus.value === 'matched')) {
          connectionError.value = 'Connection lost. Trying to reconnect...';
        }
      }, 60000); // 1 minute delay
    }
  }
});

// Close dropdown when clicking outside
const vibeDropdownRef = ref<HTMLElement | null>(null);

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  
  if (vibeDropdownRef.value && !vibeDropdownRef.value.contains(target)) {
    showVibeDropdown.value = false;
  }

  // Close country dropdown menus
  if (showPreferredDropdown.value) {
    const preferredBtn = preferredDropdownRef.value;
    const preferredDropdown = document.querySelector('.preferred-outer');
    if (preferredBtn && preferredDropdown && 
        !preferredBtn.contains(target) && 
        !preferredDropdown.contains(target)) {
      showPreferredDropdown.value = false;
    }
  }
  
  if (showBlockedDropdown.value) {
    const blockedBtn = blockedDropdownRef.value;
    const blockedDropdown = document.querySelector('.blocked-outer');
    if (blockedBtn && blockedDropdown && 
        !blockedBtn.contains(target) && 
        !blockedDropdown.contains(target)) {
      showBlockedDropdown.value = false;
    }
  }
};
</script>

<style scoped>
/* Animation for the pulse effect */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.delay-500 {
  animation-delay: 0.5s;
}

.delay-1000 {
  animation-delay: 1s;
}

.delay-2000 {
  animation-delay: 2s;
}

/* Hide scrollbar but allow scrolling */
.scrollbar-hide {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;  /* Chrome, Safari, Opera */
}

/* Thin scrollbar style */
.scrollbar-thin {
  scrollbar-width: thin;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 3px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
}

/* Flag icon styling */
.flag-icon {
  display: inline-block;
  font-size: 1.1em;
  line-height: 1;
}

.dropdown-outer {
  min-width: 300px; /* عرض ثابت أكبر */
  width: max-content;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.2s ease-out;
  border-radius: 0.5rem;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style> 