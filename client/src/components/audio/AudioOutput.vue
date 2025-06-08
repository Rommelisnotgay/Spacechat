<template>
  <div>
    <!-- Hidden audio element that does all the heavy lifting - this is the most important part -->
    <audio ref="audioElement" autoplay playsinline class="hidden"></audio>
    
    <!-- Only show debug panel during development -->
    <div v-if="DEBUG" class="fixed bottom-4 right-4 z-50 text-xs bg-gray-800/70 p-3 rounded-lg text-white">
      <div class="flex items-center gap-2 mb-1">
        <span v-if="isPlaying" class="text-green-300 animate-pulse">●</span>
        <span v-else class="text-red-300">●</span>
        <span>{{ isPlaying ? 'Audio Active' : 'Audio Inactive' }}</span>
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>Connection:</span>
        <span :class="{
          'text-green-400': correctedConnectionState === 'connected', 
          'text-yellow-400': correctedConnectionState === 'connecting', 
          'text-red-400': correctedConnectionState === 'failed' || correctedConnectionState === 'disconnected'
        }">{{ correctedConnectionState }}</span>
        
        <span>Stream:</span>
        <span :class="{'text-green-400': hasRemoteStream, 'text-red-400': !hasRemoteStream}">
          {{ hasRemoteStream ? 'Available' : 'Not Available' }}
        </span>
        
        <span>Tracks:</span>
        <span>{{ tracksCount }}</span>
      </div>
      <div class="mt-2 flex justify-between">
        <button @click="checkAudioTracks" class="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded-full">
          Debug
        </button>
        <button @click="forceTryPlayAudio" class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-full">
          Play Audio
        </button>
        <button @click="forceReconnectStream" class="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded-full">
          Reconnect
      </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useWebRTC } from '@/services/webrtc';

// Debug flag
const DEBUG = false; // Change to false for production

const props = defineProps({
  showControls: {
    type: Boolean,
    default: true
  }
});

const { remoteStream, connectionState, partnerId, isAudioMuted } = useWebRTC();
const audioElement = ref<HTMLAudioElement | null>(null);
const volume = ref(0.8); // Default volume
const isPlaying = ref(false);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 10; // Increased number of attempts

// Check if we have a remote stream
const hasRemoteStream = computed(() => {
  const streamExists = remoteStream.value !== null;
  // Use a safe method to check for tracks
  const hasTracks = streamExists && remoteStream.value ? remoteStream.value.getAudioTracks().length > 0 : false;
  const hasEnabledTracks = hasTracks && remoteStream.value ? remoteStream.value.getAudioTracks().some(track => track.enabled) : false;
  
  // Diagnostic log
  if (DEBUG && streamExists && remoteStream.value) {
    console.log(`[AudioOutput] Stream status: tracks=${remoteStream.value.getAudioTracks().length}, enabled=${hasEnabledTracks}`);
  }
  
  return hasEnabledTracks;
});

// Get track count for display - shows only active tracks
const tracksCount = computed(() => {
  if (!remoteStream.value) return 0;
  
  // Count only active tracks
  return remoteStream.value.getAudioTracks().filter(track => 
    track.enabled && track.readyState === 'live'
  ).length;
});

// Corrected connection state based on actual audio status
const correctedConnectionState = computed(() => {
  // If audio is playing, the connection must be "connected" regardless of the official state
  if (isPlaying.value && hasRemoteStream.value) {
    return 'connected';
  }
  
  // If the official connection state is "connected" but no audio, there's a problem
  if (connectionState.value === 'connected' && !hasRemoteStream.value && !isPlaying.value) {
    // Try reconnecting audio after a short delay
    setTimeout(connectAudioStream, 500);
  }
  
  return connectionState.value;
});

// Watch for changes to the remote stream
watch(() => remoteStream.value, (newStream) => {
  if (DEBUG) {
    console.log('[AudioOutput] Remote stream changed:', newStream ? 'Stream available' : 'No stream');
    if (newStream) {
      const tracks = newStream.getTracks();
      console.log(`[AudioOutput] Remote stream has ${tracks.length} tracks`);
      tracks.forEach(track => {
        console.log(`[AudioOutput] Track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
      });
    }
  }
  
  // When we get a new stream, connect it immediately
  connectAudioStream();
  
  // Reset reconnect attempts when stream changes
  reconnectAttempts.value = 0;
  
  // Try to play immediately
  setTimeout(tryPlayAudio, 500);
});

// Watch mute state to ensure it's respected
watch(() => isAudioMuted.value, (muted) => {
  if (DEBUG) console.log(`[AudioOutput] Audio mute state changed to: ${muted}`);
  
  // Ensure audio plays when unmuting if we have a stream
  if (!muted && remoteStream.value && audioElement.value) {
    setTimeout(() => {
      if (audioElement.value && audioElement.value.paused) {
        audioElement.value.play().catch(err => {
          if (DEBUG) console.warn('[AudioOutput] Could not auto-play after unmute:', err);
        });
      }
    }, 300);
  }
});

// Watch connection state
watch(() => connectionState.value, (newState) => {
  if (DEBUG) console.log(`[AudioOutput] WebRTC connection state changed to: ${newState}`);
  
  if (newState === 'connected') {
    // Try to play the audio when connection is established
    setTimeout(() => {
      connectAudioStream();
      tryPlayAudio();
    }, 1000);
  } else if (newState === 'new' || newState === 'connecting') {
    // Connection is being established
    reconnectAttempts.value = 0;
  } else if (newState === 'disconnected' || newState === 'failed') {
    // Connection was lost - try reconnecting
    reconnectStream();
  }
});

// Watch for partner ID changes to reset state
watch(() => partnerId.value, (newPartnerId) => {
  if (DEBUG) console.log(`[AudioOutput] Partner ID changed: ${newPartnerId}`);
  
  // Reset status when partner changes
  isPlaying.value = false;
  reconnectAttempts.value = 0;
  
  if (!newPartnerId) {
    // No partner, stop audio
    if (audioElement.value) {
      audioElement.value.srcObject = null;
    }
  }
});

onMounted(() => {
  if (DEBUG) console.log('[AudioOutput] Component mounted');
  connectAudioStream();
  
  // Set up audio play monitoring
  if (audioElement.value) {
    audioElement.value.onplaying = () => {
      if (DEBUG) console.log('[AudioOutput] Audio started playing');
      isPlaying.value = true;
    };
    
    audioElement.value.onpause = () => {
      if (DEBUG) console.log('[AudioOutput] Audio paused');
      isPlaying.value = false;
    };
    
    audioElement.value.onended = () => {
      if (DEBUG) console.log('[AudioOutput] Audio ended');
      isPlaying.value = false;
    };
    
    audioElement.value.onerror = (e) => {
      console.error('[AudioOutput] Audio error:', e);
      isPlaying.value = false;
    };
    
    // Set initial volume
    audioElement.value.volume = volume.value;
  }
  
  // Add visibility change listener to handle page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Start checking for audio every 5 seconds
  startAudioCheck();
});

onBeforeUnmount(() => {
  if (DEBUG) console.log('[AudioOutput] Component unmounting, cleaning up');
  
  // Clean up resources
  if (audioElement.value) {
    audioElement.value.srcObject = null;
  }
  
  // Remove event listeners
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  // Clear any intervals
  stopAudioCheck();
});

// Start periodic checks for audio
let audioCheckInterval: number | null = null;
function startAudioCheck() {
  stopAudioCheck(); // Clear any existing interval
  
  audioCheckInterval = window.setInterval(() => {
    if (!isPlaying.value && hasRemoteStream.value && connectionState.value === 'connected') {
      if (DEBUG) console.log('[AudioOutput] Periodic check: Audio not playing, trying to reconnect');
      connectAudioStream();
      tryPlayAudio();
    }
  }, 5000) as unknown as number;
}

function stopAudioCheck() {
  if (audioCheckInterval) {
    clearInterval(audioCheckInterval);
    audioCheckInterval = null;
  }
}

// Handle visibility change (when user switches tabs)
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    if (DEBUG) console.log('[AudioOutput] Page became visible, trying to reconnect audio');
    // Try to reconnect audio when page becomes visible again
    connectAudioStream();
    setTimeout(() => {
      if (!isPlaying.value && hasRemoteStream.value) {
        tryPlayAudio();
      }
    }, 500);
  }
}

// Connect the audio stream to the audio element
function connectAudioStream() {
  if (!audioElement.value) {
    if (DEBUG) console.log('[AudioOutput] No audio element ref available');
    return;
  }
  
  if (remoteStream.value) {
    if (DEBUG) {
      const audioTracks = remoteStream.value.getAudioTracks();
      console.log(`[AudioOutput] Connecting remote stream with ${audioTracks.length} audio tracks`);
      
      audioTracks.forEach(track => {
        console.log(`[AudioOutput] Audio track: ${track.label}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      });
    }
    
    // Always set the stream to ensure it's connected properly
    audioElement.value.srcObject = remoteStream.value;
    
    // Make sure tracks are enabled
    remoteStream.value.getAudioTracks().forEach(track => {
      track.enabled = true;
    });
    
    // Try to play the audio
    tryPlayAudio();
  } else {
    if (DEBUG) console.log('[AudioOutput] No remote stream to connect');
    audioElement.value.srcObject = null;
    isPlaying.value = false;
  }
}

// Try to play audio with retry logic
async function tryPlayAudio() {
  if (!audioElement.value || !audioElement.value.srcObject) {
    if (DEBUG) console.log('[AudioOutput] Cannot play: no audio element or srcObject');
    return;
  }
  
  try {
    if (DEBUG) console.log(`[AudioOutput] Attempting to play audio (attempt ${reconnectAttempts.value + 1})`);
    
    // Check if we have audio tracks and they're enabled
    const hasTracks = remoteStream.value && remoteStream.value.getAudioTracks().length > 0;
    if (!hasTracks) {
      if (DEBUG) console.log('[AudioOutput] No audio tracks available in remote stream');
    }
    
    // Try to play
    await audioElement.value.play();
    
    isPlaying.value = true;
    reconnectAttempts.value = 0;
    if (DEBUG) console.log('[AudioOutput] Audio playing successfully');
  } catch (error) {
    console.error('[AudioOutput] Error playing audio:', error);
    isPlaying.value = false;
    
    // Check if this is a user interaction error
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      console.warn('[AudioOutput] Audio play was blocked by browser policy, user interaction needed');
    }
    
    // Retry automatically with increasing delay if not manually triggered
    if (reconnectAttempts.value < maxReconnectAttempts) {
      reconnectAttempts.value++;
      const delay = reconnectAttempts.value * 1000; // Increasing delay
      
      if (DEBUG) console.log(`[AudioOutput] Will retry playing in ${delay}ms`);
      setTimeout(tryPlayAudio, delay);
    } else {
      console.warn('[AudioOutput] Max retry attempts reached, manual play required');
    }
  }
}

// Function to explicitly reconnect stream
function reconnectStream() {
  reconnectAttempts.value = 0;
  if (DEBUG) console.log('[AudioOutput] Manual reconnect requested');
  
  if (audioElement.value) {
    audioElement.value.srcObject = null;
  }
  
  setTimeout(() => {
    connectAudioStream();
    tryPlayAudio();
  }, 500);
}

// Update audio volume
function updateVolume() {
  if (audioElement.value) {
    audioElement.value.volume = volume.value;
    if (DEBUG) console.log(`[AudioOutput] Volume set to ${volume.value}`);
  }
}

// New function to check audio tracks
function checkAudioTracks() {
  if (remoteStream.value) {
    const tracks = remoteStream.value.getAudioTracks();
    console.log(`[AudioOutput] Remote stream has ${tracks.length} audio tracks`);
    tracks.forEach(track => {
      console.log(`[AudioOutput] Track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
    });
  }
}

// Force reconnect with reset state
function forceReconnectStream() {
  reconnectAttempts.value = 0;
  if (DEBUG) console.log('[AudioOutput] Manual reconnect requested');
  
  if (audioElement.value) {
    audioElement.value.srcObject = null;
  }
  
  setTimeout(() => {
    connectAudioStream();
    tryPlayAudio();
  }, 500);
}

// Force try play audio
function forceTryPlayAudio() {
  if (DEBUG) console.log('[AudioOutput] Manual play requested');
  // Reset playing state
  isPlaying.value = false;
  
  // Try to play with user interaction
  setTimeout(() => {
    tryPlayAudio();
  }, 100);
}
</script>

<style scoped>
.audio-controls {
  transition: all 0.3s ease;
}

.animate-pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Style the range input (volume slider) */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.hidden {
  display: none;
}
</style> 