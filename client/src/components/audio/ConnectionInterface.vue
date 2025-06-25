<template>
  <div class="flex flex-col items-center">
    <!-- Filter Section -->
    <div class="w-full max-w-md flex justify-between mb-6">
      <div class="flex-1 mr-2">
        <VibeDropdown v-model="selectedVibe" />
      </div>
      <div>
        <FiltersButton />
      </div>
    </div>

    <!-- Connection Area -->
    <div class="bg-purple-800 bg-opacity-30 rounded-3xl p-8 w-full max-w-md flex flex-col items-center mb-8 shadow-lg">
      <div 
        class="w-28 h-28 rounded-full bg-gray-700 flex items-center justify-center mb-6 shadow-inner"
        :class="{ 'animate-pulse-slow': status === 'searching' }"
      >
        <span class="text-yellow-300 text-3xl">⭐</span>
      </div>
      
      <h2 class="text-white text-2xl font-bold mb-3">
        {{ statusText }}
      </h2>
      
      <p class="text-white text-lg mb-8">
        {{ statusDescription }}
      </p>
      
      <!-- Auto-reconnect Option -->
      <label class="flex items-center text-white mt-4">
        <input 
          type="checkbox" 
          v-model="autoReconnect" 
          class="mr-3 h-5 w-5"
        />
        <span class="text-lg">Auto-reconnect to others</span>
      </label>
    </div>

    <!-- Control Buttons -->
    <div class="flex justify-center space-x-8 mb-8">
      <button 
        @click="toggleMicrophone"
        class="call-button"
        :class="{'end-call': isAudioMuted}"
      >
        <span>🎤</span>
      </button>
      
      <button 
        @click="findPartner"
        class="call-button"
        style="width: 80px; height: 80px; font-size: 28px;"
      >
        <span>📞</span>
      </button>
      
      <button 
        @click="handleChatToggle"
        class="call-button"
        style="background-color: #607d8b;"
      >
        <span>💬</span>
      </button>
    </div>

    <!-- Hidden Audio Output for sound playback -->
    <div style="display:none;">
      <AudioOutput v-if="status === 'connected'" :showControls="false" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useSocket } from '@/services/socket';
import { useWebRTC } from '@/services/webrtc';
import VibeDropdown from '@/components/filters/VibeDropdown.vue';
import FiltersButton from '@/components/filters/FiltersButton.vue';
import AudioOutput from '@/components/audio/AudioOutput.vue';

// Debug flag
const DEBUG = true;

const props = defineProps<{
  currentPartnerId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-chat'): void;
  (e: 'partner-connected', partnerId: string): void;
  (e: 'searching'): void;
}>();

const { socket } = useSocket();
const { 
  initializeLocalStream: initializeMediaStream, 
  toggleMicrophone: toggleMic, 
  isAudioMuted,
  connectionState,
  createOffer,
  closeConnection,
  remoteStream,
  localStream
} = useWebRTC();

// Connection state
const status = ref<'idle' | 'searching' | 'connecting' | 'connected'>('idle');
const autoReconnect = ref(false);
const partnerId = ref<string | null>(null);
const selectedVibe = ref('any');
const callActive = ref(false);

// UI state
const showDebugOptions = ref(false);
const showGames = ref(false);
const showHistory = ref(false);
const showSupport = ref(false);

// Store the local stream info for debugging
const localStreamInfo = ref<{ tracks: { label: string; enabled: boolean }[] } | null>(null);

// New connection status variables
const isMuted = ref(false);
const connectionStartTime = ref(Date.now());
const connectionDuration = ref(0);
const showDiagnostics = ref(false);
const audioTestResult = ref('');
const connectionStats = ref<any>(null);
const diagnosticTimer = ref<number | null>(null);
const statsTimer = ref<number | null>(null);

// Search timeout to prevent getting stuck in queue
let searchTimeout: number | null = null;

// إضافة عرض لعدد محاولات إعادة الاتصال
const connectionRetryDisplay = computed(() => {
  const webrtc = useWebRTC();
  if (webrtc.connectionState.value === 'connecting') {
    // الوصول إلى متغير connectionRetryCount في وحدة WebRTC
    const retryCount = (window as any).__webrtc_debug?.connectionRetryCount || 0;
    return `محاولة الاتصال: ${retryCount + 1}`;
  }
  return '';
});

// مراقبة حالة الاتصال لإضافة معلومات أكثر تفصيلاً
const detailedConnectionState = computed(() => {
  const webrtc = useWebRTC();
  const state = webrtc.connectionState.value;
  
  switch (state) {
    case 'connecting':
      return 'جاري إنشاء الاتصال... انتظر لحظة';
    case 'connected':
      if (!hasRemoteAudio.value) {
        return 'متصل لكن لا يوجد صوت. جرب إعادة الاتصال أو التحقق من إعدادات الميكروفون';
      }
      return 'تم الاتصال بنجاح';
    case 'disconnected':
      return 'انقطع الاتصال. جاري محاولة إعادة الاتصال تلقائياً...';
    case 'failed':
      return 'فشل الاتصال. يرجى الضغط على "إعادة المحاولة"';
    default:
      return state;
  }
});

// إضافة معلومات حول أي أخطاء حدثت
const lastErrorMessage = ref('');

// تحديث معلومات الخطأ كل 2 ثانية
let errorInterval: number | null = null;

// Watch for partner changes from props
watch(() => props.currentPartnerId, (newPartnerId) => {
  if (DEBUG) console.log(`[ConnectionInterface] Current partner ID from props changed: ${newPartnerId}`);
  if (newPartnerId) {
    partnerId.value = newPartnerId;
    
    // If we have a partner ID but aren't connected, update status
    if (status.value !== 'connected') {
      status.value = 'connected';
      callActive.value = true;
      if (DEBUG) console.log(`[ConnectionInterface] Status updated to connected based on partner ID: ${newPartnerId}`);
    }
  }
});

// Watch connection state for auto-reconnect
watch(() => status.value, (newStatus, oldStatus) => {
  if (DEBUG) console.log(`[ConnectionInterface] Status changed from ${oldStatus} to ${newStatus}`);
  if (newStatus === 'idle' && oldStatus === 'connected' && autoReconnect.value) {
    // Automatically find a new partner after a delay
    if (DEBUG) console.log('[ConnectionInterface] Will auto-reconnect in 2 seconds');
    setTimeout(() => {
      if (status.value === 'idle') {
        findPartner();
      }
    }, 2000);
  }
});

// Watch for WebRTC connection state changes
watch(() => connectionState.value, (newState, oldState) => {
  if (DEBUG) console.log(`[ConnectionInterface] WebRTC connection state changed from ${oldState} to ${newState}`);
  
  if (newState === 'connected') {
    if (DEBUG) console.log('[ConnectionInterface] WebRTC connection established');
    // Make sure our UI shows connected state
    if (status.value !== 'connected' && partnerId.value) {
      status.value = 'connected';
      callActive.value = true;
    }
  } else if ((newState === 'failed' || newState === 'disconnected') && oldState === 'connected') {
    // Connection was established but then failed - we should show reconnect option
    // but keep the UI in connected state since we still have the partner ID
    if (DEBUG) console.log('[ConnectionInterface] WebRTC connection lost but keeping UI in connected state');
    
    // After some delay, try to automatically reconnect
    setTimeout(() => {
      if (partnerId.value && (connectionState.value === 'failed' || connectionState.value === 'disconnected')) {
        if (DEBUG) console.log('[ConnectionInterface] Attempting automatic connection restart');
        restartConnection();
      }
    }, 3000);
  }
});

// Watch for remote stream changes
watch(() => remoteStream.value, (newStream) => {
  if (DEBUG) console.log(`[ConnectionInterface] Remote stream ${newStream ? 'received' : 'lost'}`);
});

// Initialize at the top level before any async code
onMounted(() => {
  if (DEBUG) console.log('[ConnectionInterface] Component mounted');
  
  // Set up error info interval
  errorInterval = window.setInterval(updateErrorInfo, 2000);
  
  // Start connection timer
  startConnectionTimer();
  startStatsCollection();
  
  // Setup socket listeners for connection events
  setupSocketListeners();
  
  // Initialize audio
  initializeMediaStream().then(() => {
    if (DEBUG) console.log('[ConnectionInterface] Audio initialized successfully');
    // Update local stream info after initialization
    updateLocalStreamInfo();
  }).catch((error) => {
    console.error('[ConnectionInterface] Failed to initialize audio:', error);
  });

  // Add listener for connection-closed custom event
  window.addEventListener('connection-closed', () => {
    if (DEBUG) console.log('[ConnectionInterface] Received connection-closed event');
    
    // Don't immediately change state to idle in case HomeView is showing disconnecting state
    // Wait for partner status to be cleared by parent component
    if (partnerId.value) {
      // Update local state to reflect disconnection
      callActive.value = false;
      
      // The parent component (HomeView) will handle setting status to disconnecting/disconnected
      if (DEBUG) console.log('[ConnectionInterface] Connection closed, status handled by parent');
    }
  });
});

// Clean up
onBeforeUnmount(() => {
  if (DEBUG) console.log('[ConnectionInterface] Component unmounting');
  
  // Clear intervals
  if (errorInterval) {
    clearInterval(errorInterval);
    errorInterval = null;
  }
  
  // Clear search timeout if it exists
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  // Clean up WebRTC connection
  closeConnection();
  
  // Remove custom event listeners
  window.removeEventListener('connection-closed', () => {});
  
  // Remove socket event listeners if socket exists
  if (socket.value) {
    socket.value.off('matched');
    socket.value.off('user-skipped');
    socket.value.off('user-disconnected');
    socket.value.off('skip-confirmed');
    socket.value.off('disconnect-confirmed');
    socket.value.off('already-matched');
    socket.value.off('queue-timeout');
    socket.value.off('queue-waiting');
  }
  
  // Stop connection timer
  stopConnectionTimer();
  stopStatsCollection();
});

function setupSocketListeners() {
  if (!socket.value) {
    if (DEBUG) console.log('[ConnectionInterface] No socket available, cannot set up listeners');
    return;
  }
  
  if (DEBUG) console.log('[ConnectionInterface] Setting up socket listeners');
  
  // Handle matched event
  socket.value.on('matched', (data: { partnerId: string }) => {
    if (DEBUG) console.log('[ConnectionInterface] Matched with partner:', data.partnerId);
    setupPartnerConnection(data.partnerId);
    
    // Create WebRTC offer
    createOffer(data.partnerId);
  });
  
  // Handle direct connection established event
  socket.value.on('direct-connection-established', (data: { partnerId: string }) => {
    if (DEBUG) console.log('[ConnectionInterface] Direct connection established with:', data.partnerId);
    setupPartnerConnection(data.partnerId);
  });
  
  // Handle direct connection failed event
  socket.value.on('direct-connection-failed', () => {
    if (DEBUG) console.log('[ConnectionInterface] Direct connection failed');
    status.value = 'idle';
    partnerId.value = null;
    callActive.value = false;
  });
  
  // Handle disconnect-confirmed event
  socket.value.on('disconnect-confirmed', (data: any) => {
    if (DEBUG) console.log('[ConnectionInterface] Disconnect confirmed by server', data);
  });
  
  // Handle skip-confirmed event
  socket.value.on('skip-confirmed', (data: any) => {
    if (DEBUG) console.log('[ConnectionInterface] Skip confirmed by server', data);
    // Skip confirmed means we wanted to skip - no UI action needed since we already handled it
  });
  
  // Handle when we get skipped by another user
  socket.value.on('user-skipped', (data: any) => {
    if (DEBUG) console.log('[ConnectionInterface] We got skipped by the other user', data);
    
    status.value = 'disconnecting';
    
    // After 2 seconds, transition to idle
    setTimeout(() => {
      if (status.value === 'disconnecting') {
        partnerId.value = null;
        status.value = 'idle';
        callActive.value = false;
      }
    }, 2000);
  });
  
  // Handle when the other user disappears (browser close, etc.)
  socket.value.on('user-disconnected', (data: any) => {
    if (DEBUG) console.log('[ConnectionInterface] The other user disconnected', data);
    
    status.value = 'disconnecting';
    
    // After 2 seconds, transition to idle
    setTimeout(() => {
      if (status.value === 'disconnecting') {
        partnerId.value = null;
        status.value = 'idle';
        callActive.value = false;
      }
    }, 2000);
  });
}

// Status text and description
const statusText = computed(() => {
  switch (status.value) {
    case 'idle': return 'Ready to Connect';
    case 'searching': return 'Finding Someone...';
    case 'connecting': return 'Connecting...';
    case 'connected': return 'Connected';
    default: return 'Ready to Connect';
  }
});

const statusDescription = computed(() => {
  switch (status.value) {
    case 'idle': return 'Tap "Next" to find someone';
    case 'searching': return 'Looking for a connection...';
    case 'connecting': return 'Establishing connection...';
    case 'connected': return 'You are now connected!';
    default: return 'Tap "Next" to find someone';
  }
});

// Functions
async function findPartner() {
  if (DEBUG) console.log(`[ConnectionInterface] Finding partner, current status: ${status.value}`);
  
  // Check socket connection
  if (!socket.value) {
    console.error('[ConnectionInterface] Failed to connect to server');
    return;
  }
  
  // Prevent joining queue if already connected or connecting
  if (status.value === 'connected' || partnerId.value) {
    // Disconnect from current partner
    if (DEBUG) console.log('[ConnectionInterface] Disconnecting from current partner');
    disconnectPartner();
    return; // Don't immediately join queue after disconnecting
  } else if (status.value === 'connecting') {
    if (DEBUG) console.log('[ConnectionInterface] Connection in progress, ignoring request');
    return;
  } else if (status.value === 'searching') {
    // If already searching, just reset the timeout but don't send another join-queue
    if (DEBUG) console.log('[ConnectionInterface] Already searching, resetting timeout');
    
    // Clear any existing search timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    
    // Set a new timeout
    searchTimeout = window.setTimeout(() => {
      if (status.value === 'searching') {
        if (DEBUG) console.log('[ConnectionInterface] Search timeout - rejoining queue');
        socket.value?.emit('join-queue', { vibe: selectedVibe.value });
      }
    }, 10000);
    
    return;
  }
  
  // Start searching
  status.value = 'searching';
  
  // Clear any existing search timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  // Find a new partner
  if (DEBUG) console.log(`[ConnectionInterface] Joining queue with vibe: ${selectedVibe.value}`);
  socket.value.emit('join-queue', { vibe: selectedVibe.value });
  
  // Set a timeout to retry if no match is found within 10 seconds
  searchTimeout = window.setTimeout(() => {
    if (status.value === 'searching') {
      if (DEBUG) console.log('[ConnectionInterface] Search timeout - rejoining queue');
      socket.value?.emit('join-queue', { vibe: selectedVibe.value });
    }
  }, 10000);
}

function toggleMicrophone() {
  const result = toggleMic();
  if (DEBUG) console.log(`[ConnectionInterface] Microphone toggled, is muted: ${!result}`);
}

function handleChatToggle() {
  if (DEBUG) console.log('[ConnectionInterface] Toggling chat');
  emit('toggle-chat');
}

// Open games panel
function openGames() {
  showGames.value = true;
  if (DEBUG) console.log('[ConnectionInterface] Opening games panel');
}

// Open history panel
function openHistory() {
  showHistory.value = true;
  if (DEBUG) console.log('[ConnectionInterface] Opening history panel');
}

// Open support panel
function openSupport() {
  showSupport.value = true;
  if (DEBUG) console.log('[ConnectionInterface] Opening support panel');
}

// Connect to a user from history
function connectToHistoryUser(userId: string) {
  if (DEBUG) console.log(`[ConnectionInterface] Connecting to user from history: ${userId}`);
  showHistory.value = false;
  
  // Disconnect current connection if any
  if (status.value === 'connected') {
    socket.value?.emit('disconnect-partner');
  }
  
  // Connect to the selected user from history
  status.value = 'connecting';
  socket.value?.emit('connect-to-user', { targetUserId: userId });
}

// Function to disconnect from current partner
function disconnectPartner() {
  if (socket.value && partnerId.value) {
    // Emit disconnect event with 'skip' reason
    socket.value.emit('disconnect-partner', { reason: 'skip' });
    
    // When user initiates skip, don't show disconnecting state
    // instead go straight to searching state to prepare for next connection
    partnerId.value = null;
    status.value = 'searching';
    callActive.value = false;
    
    // Close WebRTC connection
    closeConnection();
    
    if (DEBUG) console.log('[ConnectionInterface] Disconnected from partner via skip');
    
    // Emit an event to notify parent component that we're searching for a new partner
    emit('searching');
  }
}

// Helper function to set up connection with a partner
function setupPartnerConnection(id: string) {
  // Clear search timeout if it exists
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  
  partnerId.value = id;
  status.value = 'connected';
  callActive.value = true;
  
  if (DEBUG) console.log(`[ConnectionInterface] Partner connection set up with ID: ${id}`);
  
  // Emit the event to let parent component know
  emit('partner-connected', id);
}

// Function to restart connection if it failed
function restartConnection() {
  if (DEBUG) console.log('[ConnectionInterface] Manually restarting connection');
  
  // Only attempt to restart if we have a partner ID
  if (!partnerId.value) {
    if (DEBUG) console.log('[ConnectionInterface] Cannot restart: no partner ID');
    return;
  }
  
  // Try to establish a new connection
  createOffer(partnerId.value);
}

// Request new microphone access
async function requestNewMicrophoneAccess() {
  if (DEBUG) console.log('[ConnectionInterface] Re-requesting microphone access');
  
  try {
    // Stop current tracks
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => track.stop());
    }
    
    // Get new stream
    await initializeMediaStream();
    
    // Update local stream info
    updateLocalStreamInfo();
    
    // If connected, restart the connection to use the new stream
    if (status.value === 'connected' && partnerId.value) {
      restartConnection();
    }
  } catch (error) {
    console.error('[ConnectionInterface] Error requesting new microphone access:', error);
  }
}

// Force recreate peer connection
function forcePeerReconnection() {
  if (!partnerId.value) {
    if (DEBUG) console.log('[ConnectionInterface] Cannot force reconnection: no partner ID');
    return;
  }

  if (DEBUG) console.log('[ConnectionInterface] Forcing peer reconnection');
  createOffer(partnerId.value);
}

// Update the local stream information for debugging
function updateLocalStreamInfo() {
  if (!localStream.value) {
    localStreamInfo.value = { tracks: [] };
    return;
  }
  
  const tracks = localStream.value.getAudioTracks();
  localStreamInfo.value = {
    tracks: tracks.map(track => ({
      label: track.label,
      enabled: track.enabled
    }))
  };
  
  if (DEBUG) console.log('[ConnectionInterface] Updated local stream info:', localStreamInfo.value);
}

// Watch for changes in local stream
watch(() => localStream.value, () => {
  updateLocalStreamInfo();
});

// New connection status functions
const startConnectionTimer = () => {
  connectionStartTime.value = Date.now();
  const timer = setInterval(() => {
    connectionDuration.value = Date.now() - connectionStartTime.value;
  }, 1000);
  diagnosticTimer.value = timer as unknown as number;
};

const stopConnectionTimer = () => {
  if (diagnosticTimer.value) {
    clearInterval(diagnosticTimer.value);
    diagnosticTimer.value = null;
  }
};

const startStatsCollection = () => {
  if (statsTimer.value) {
    clearInterval(statsTimer.value);
  }
  
  const timer = setInterval(async () => {
    if (connectionState.value === 'connected') {
      try {
        connectionStats.value = await createOffer(partnerId.value);
      } catch (err) {
        console.error('Failed to get connection stats:', err);
      }
    }
  }, 5000);
  
  statsTimer.value = timer as unknown as number;
};

const stopStatsCollection = () => {
  if (statsTimer.value) {
    clearInterval(statsTimer.value);
    statsTimer.value = null;
  }
};

const hasLocalTracks = computed(() => {
  const stream = localStream.value;
  return stream && stream.getAudioTracks().length > 0;
});

const hasRemoteAudio = computed(() => {
  const stream = remoteStream.value;
  return stream && stream.getAudioTracks().length > 0;
});

const diagnosticMessage = computed(() => {
  return connectionState.value === 'connected' ? 
    'تم الاتصال بنجاح' :
    'لا توجد معلومات تشخيصية متاحة';
});

const connectionStateDetails = computed(() => {
  const state = connectionState.value;
  
  if (state === 'connecting') {
    const seconds = Math.floor(connectionDuration.value / 1000);
    return `جاري الاتصال (${seconds} ثانية)...`;
  }
  
  return '';
});

const connectionStateText = computed(() => {
  const state = connectionState.value;
  
  switch (state) {
    case 'new': return 'جاري التحضير...';
    case 'connecting': return 'جاري الاتصال...';
    case 'connected': return 'متصل';
    case 'disconnected': return 'انقطع الاتصال';
    case 'failed': return 'فشل الاتصال';
    case 'closed': return 'تم إغلاق الاتصال';
    default: return state;
  }
});

const handleRetry = async () => {
  if (DEBUG) console.log('[ConnectionInterface] Retry button clicked');
  
  if (!partnerId.value) {
    if (DEBUG) console.log('[ConnectionInterface] Cannot retry: no partner ID');
    return;
  }
  
  // Force a new connection attempt
  connectionStats.value = await createOffer(partnerId.value);
};

const forceColdRestart = async () => {
  // Close connection first
  closeConnection();
  
  // Reinitialize camera and microphone
  try {
    await initializeMediaStream();
  } catch (err) {
    console.error('Failed to reinitialize local stream:', err);
  }
  
  // Reconnect
  if (partnerId.value) {
    setTimeout(() => {
      createOffer(partnerId.value);
      startConnectionTimer();
    }, 1000);
  }
};

const testLocalAudio = async () => {
  if (!localStream.value) {
    audioTestResult.value = 'الميكروفون غير متصل';
    return;
  }
  
  const tracks = localStream.value.getAudioTracks();
  if (tracks.length === 0) {
    audioTestResult.value = 'لا توجد مسارات صوت محلية';
    return;
  }
  
  // Check track states
  const trackInfo = tracks.map(track => 
    `${track.label}: ${track.enabled ? 'مفعل' : 'معطل'}, ${track.readyState}`
  ).join(', ');
  
  audioTestResult.value = `مسارات الصوت المحلية: ${trackInfo}`;
};

const testRemoteAudio = async () => {
  if (!remoteStream.value) {
    audioTestResult.value = 'لا يوجد اتصال بعد';
    return;
  }
  
  const tracks = remoteStream.value.getAudioTracks();
  if (tracks.length === 0) {
    audioTestResult.value = 'لا توجد مسارات صوت واردة';
    return;
  }
  
  // Check track states
  const trackInfo = tracks.map(track => 
    `${track.label}: ${track.enabled ? 'مفعل' : 'معطل'}, ${track.readyState}`
  ).join(', ');
  
  audioTestResult.value = `مسارات الصوت الواردة: ${trackInfo}`;
};

const requestMicrophoneAccess = async () => {
  try {
    await initializeMediaStream();
    audioTestResult.value = 'تم الحصول على إذن الميكروفون بنجاح';
  } catch (err) {
    audioTestResult.value = `فشل في الحصول على إذن الميكروفون: ${err}`;
  }
};

// الحصول على معلومات الخطأ من WebRTC
const updateErrorInfo = async () => {
  const debug = (window as any).__webrtc_debug;
  if (debug) {
    lastErrorMessage.value = debug.lastConnectionError || debug.failureReason || '';
  }
};
</script>

<style scoped>
.animate-pulse-slow {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.95);
  }
}

.connection-interface {
  width: 100%;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.connection-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  border-radius: 6px;
  background-color: #eee;
  text-align: center;
}

.connection-status.connecting {
  background-color: #fff3cd;
  color: #856404;
  animation: pulse 1.5s infinite;
}

.connection-status.connected {
  background-color: #d4edda;
  color: #155724;
}

.connection-status.disconnected,
.connection-status.failed {
  background-color: #f8d7da;
  color: #721c24;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

.status-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  margin-bottom: 10px;
}

.status-icon.connected {
  background-color: #28a745;
}

.status-icon.failed {
  background-color: #dc3545;
}

.status-text {
  font-weight: bold;
  margin-bottom: 5px;
}

.status-details, .status-progress {
  font-size: 0.85rem;
  margin-top: 5px;
}

.mic-control {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  background-color: #e9ecef;
}

.mic-control button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.mic-control button:hover {
  background-color: #0069d9;
}

.mic-control.muted button {
  background-color: #6c757d;
}

.retry-button {
  margin-top: 10px;
  padding: 8px 15px;
  background-color: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: #c82333;
}

/* Animations */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Diagnostics */
.diagnostics-tools {
  margin-top: 10px;
}

.diagnostics-toggle {
  width: 100%;
  padding: 8px;
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.diagnostics-panel {
  margin-top: 10px;
  padding: 15px;
  background-color: #f1f1f1;
  border-radius: 6px;
  font-size: 0.9rem;
}

.diagnostics-panel h3, .diagnostics-panel h4 {
  margin-top: 0;
  margin-bottom: 10px;
  color: #333;
}

.diagnostic-item {
  margin-bottom: 10px;
  padding: 8px;
  background-color: #fff;
  border-radius: 4px;
}

.success {
  color: #28a745;
  font-weight: bold;
}

.error {
  color: #dc3545;
  font-weight: bold;
}

.error-message {
  margin: 8px 0;
  padding: 8px 12px;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
  color: #721c24;
  font-size: 0.9rem;
  text-align: center;
}

.audio-test-tools, .connection-actions {
  margin-top: 15px;
  padding: 10px;
  background-color: #fff;
  border-radius: 6px;
}

.test-button, .action-button {
  margin-right: 8px;
  margin-bottom: 8px;
  padding: 6px 12px;
  background-color: #17a2b8;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.test-button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.test-result {
  margin-top: 8px;
  padding: 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-size: 0.85rem;
}

.mini-button {
  margin-left: 5px;
  padding: 2px 6px;
  font-size: 0.75rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.advanced-stats {
  margin-top: 15px;
}

.advanced-stats pre {
  max-height: 200px;
  overflow-y: auto;
  background-color: #f8f9fa;
  padding: 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  direction: ltr;
  text-align: left;
}

.remote-audio-status {
  padding: 5px;
  border-radius: 4px;
  font-weight: bold;
  background-color: #d4edda;
  color: #155724;
}

.remote-audio-status.no-audio {
  background-color: #f8d7da;
  color: #721c24;
}

.retry-count {
  font-size: 0.9rem;
  margin-top: 5px;
  color: #856404;
  font-weight: bold;
}

.detailed-state {
  margin-top: 5px;
  font-size: 0.85rem;
  padding: 4px 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
  color: #333;
}

/* أنماط جديدة للأزرار */
.call-button {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background-color: #4caf50;
  color: white;
  font-size: 24px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.call-button:hover {
  transform: scale(1.05);
  background-color: #45a049;
}

.call-button:active {
  transform: scale(0.95);
}

.call-button.end-call {
  background-color: #f44336;
}

.call-button.end-call:hover {
  background-color: #d32f2f;
}
</style> 