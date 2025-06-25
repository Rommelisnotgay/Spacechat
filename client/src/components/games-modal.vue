<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
    <div class="bg-[#1e1e2e] rounded-lg w-full max-w-md mx-auto shadow-2xl relative overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-2 sm:p-3 border-b border-gray-800">
        <div class="flex items-center gap-2">
          <span class="text-purple-400 text-lg sm:text-xl">🎮</span>
          <h2 class="text-lg sm:text-xl font-semibold text-[#a881fc]">Space Games</h2>
        </div>
        <button 
          @click="$emit('close')" 
          class="text-gray-400 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>
      
      <!-- Debug Info - HIDDEN -->
      <div v-if="false" class="bg-black/50 text-xs text-gray-400 p-1 border-b border-gray-800">
        Status: {{ debugInfo }}
      </div>
      
      <!-- Game Select View -->
      <div v-if="!selectedGame" class="p-3 sm:p-4">
        <!-- Games Grid -->
        <div class="grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-4">
          <!-- Rock Paper Scissors -->
          <button 
            class="bg-[#2e2e42] p-2 sm:p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative"
            :class="{'opacity-50 cursor-not-allowed': !isConnected}"
            :disabled="!isConnected"
            @click="selectGame('rock-paper-scissors')"
          >
            <div class="bg-yellow-500 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-3 text-base sm:text-xl">👊</div>
            <div class="text-white text-xs sm:text-sm font-medium">Rock Paper Scissors</div>
            <div class="text-xs text-gray-400 hidden sm:block">vs Partner</div>
          </button>
          
          <!-- Word Galaxy -->
          <button 
            class="bg-[#2e2e42] p-2 sm:p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative"
            :class="{'opacity-50 cursor-not-allowed': !isConnected}"
            :disabled="!isConnected"
            @click="selectGame('word-galaxy')"
          >
            <div class="bg-white text-gray-800 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-3 text-base sm:text-xl">💬</div>
            <div class="text-white text-xs sm:text-sm font-medium">Word Galaxy</div>
            <div class="text-xs text-gray-400 hidden sm:block">Word Guessing Game</div>
          </button>
          
          <!-- Tic Tac Toe -->
          <button 
            class="bg-[#2e2e42] p-2 sm:p-4 rounded-lg flex flex-col items-center text-center hover:bg-[#3a3a52] transition-colors relative"
            :class="{'opacity-50 cursor-not-allowed': !isConnected}"
            :disabled="!isConnected"
            @click="selectGame('tic-tac-toe')"
          >
            <div class="bg-red-600 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-3 text-base sm:text-xl">⭕</div>
            <div class="text-white text-xs sm:text-sm font-medium">Tic-Tac-Toe</div>
            <div class="text-xs text-gray-400 hidden sm:block">vs Partner</div>
          </button>
          
          <!-- Future Game -->
          <button 
            class="bg-[#2e2e42] p-2 sm:p-4 rounded-lg flex flex-col items-center text-center relative"
            :class="{'opacity-50 cursor-not-allowed': true}"
            disabled
          >
            <div class="absolute inset-0 flex items-center justify-center bg-[#2e2e42]/80 rounded-lg">
              <span class="bg-purple-500 text-white text-xs px-2 py-1 rounded-md font-medium">Coming Soon</span>
            </div>
            <div class="bg-purple-600 text-white w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-2 sm:mb-3 text-base sm:text-xl">🎲</div>
            <div class="text-white text-xs sm:text-sm font-medium">Mystery Game</div>
            <div class="text-xs text-gray-400 hidden sm:block">More Fun Ahead</div>
          </button>
        </div>
        
        <!-- Connection Notice -->
        <p class="text-center text-xs sm:text-sm text-gray-400 mt-2">
          Connect to play with others
        </p>
      </div>
      
      <!-- Error Message -->
      <div v-else-if="errorMessage" class="text-center p-4 sm:p-6">
        <div class="mb-4">
          <div class="w-12 h-12 sm:w-16 sm:h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
            <span class="text-xl sm:text-2xl">⚠️</span>
          </div>
          <h3 class="text-lg sm:text-xl font-bold mb-2 text-red-400">Game Error</h3>
          <p class="text-sm sm:text-base text-gray-300">{{ errorMessage }}</p>
        </div>
        
        <button 
          @click="closeGame" 
          class="px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors mt-2"
        >
          Back to Games
        </button>
      </div>
      
      <!-- Game View -->
      <div v-else>
        <!-- Waiting overlay -->
        <div v-if="waitingForAcceptance" class="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
          <div class="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h3 class="text-lg font-medium text-white mb-2">Waiting for Response</h3>
          <p class="text-sm text-gray-300 text-center max-w-xs">
            Your game invitation has been sent.<br>
            Please wait for your partner to accept.
          </p>
          <button 
            @click="cancelInvitation" 
            class="mt-6 px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors text-sm"
          >
            Cancel Invitation
          </button>
        </div>
        
        <TicTacToe
          v-if="selectedGame === 'tic-tac-toe'"
          :partnerId="partnerId"
          :isFirstPlayer="isFirstPlayer"
          :partnerReady="partnerReady"
          @back="closeGame"
          @error="handleGameError"
        />
        <RockPaperScissors
          v-if="selectedGame === 'rock-paper-scissors'"
          :partnerId="partnerId"
          :partnerReady="partnerReady"
          @back="closeGame"
          @error="handleGameError"
        />
        <WordGalaxy
          v-if="selectedGame === 'word-galaxy'"
          :partnerId="partnerId"
          :partnerReady="partnerReady"
          @back="closeGame"
          @error="handleGameError"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useSocket } from '@/services/socket';
import TicTacToe from './games/TicTacToe.vue';
import RockPaperScissors from './games/RockPaperScissors.vue';
import WordGalaxy from './games/WordGalaxy.vue';

const { socket, userId } = useSocket();

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  partnerId: {
    type: String,
    required: true
  },
  isConnected: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

// Game state
const selectedGame = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const isFirstPlayer = ref(true);
const gameRoomId = ref<string | null>(null);
const partnerReady = ref(false);
const debugInfo = ref<string>('');

// Add waiting state for invitation acceptance
const waitingForAcceptance = ref(false);
const invitationId = ref<string | null>(null);
const invitationTimeout = ref<number | null>(null);
const invitationSentTime = ref<number | null>(null);

// Debug helper - only logs to console, not UI
const logDebugInfo = (msg: string) => {
  console.log(`[Game Debug] ${msg}`);
  debugInfo.value = msg;
};

// Create a reference to the event handler so we can remove it later
const gameInvitationAcceptedHandler = ((event: CustomEvent) => {
  const { gameType, partnerId: gamePartnerId, inviteId } = event.detail;
  
  if (gamePartnerId === props.partnerId) {
    logDebugInfo(`Received invitation acceptance via custom event: ${inviteId}`);
    
    // Clear any timeout
    if (invitationTimeout.value) {
      clearTimeout(invitationTimeout.value);
      invitationTimeout.value = null;
    }
    
    // Clear any error messages from previous invitations
    errorMessage.value = null;
    
    // Set the game type if it's not already set
    if (!selectedGame.value || selectedGame.value !== gameType) {
      selectedGame.value = gameType;
    }
    
    // Update state to allow gameplay
    waitingForAcceptance.value = false;
    partnerReady.value = true;
    
    // Create a deterministic room ID if needed
    if (!gameRoomId.value) {
      const userIds = [userId.value, props.partnerId].sort();
      gameRoomId.value = `${gameType}-${userIds[0]}-${userIds[1]}`;
      logDebugInfo(`Created game room: ${gameRoomId.value}`);
    }
  }
}) as EventListener;

// Select a game
const selectGame = (gameType: string) => {
  if (!props.isConnected) return;
  
  logDebugInfo(`Starting game: ${gameType} with partner: ${props.partnerId}`);
  
  errorMessage.value = null;
  selectedGame.value = gameType;
  isFirstPlayer.value = true;
  partnerReady.value = false;
  
  // Create a deterministic room ID based on user IDs
  // This ensures both users try to join the same room
  const userIds = [userId.value, props.partnerId].sort();
  gameRoomId.value = `${gameType}-${userIds[0]}-${userIds[1]}`;
  
  logDebugInfo(`Created game room: ${gameRoomId.value}`);
  
  // Set waiting state to block UI until partner accepts
  waitingForAcceptance.value = true;
  invitationSentTime.value = Date.now();
  
  // Generate a unique invitation ID
  const inviteId = `invite-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  invitationId.value = inviteId;
  
  // Join the game room
  socket.value?.emit('game-join-room', {
    gameType,
    roomId: gameRoomId.value,
    to: props.partnerId,
    isFirstPlayer: true
  });

  // Send game invitation to partner
  if (socket.value && props.partnerId) {
    // Send the invitation
    socket.value.emit('game-invite', {
      gameType,
      to: props.partnerId,
      inviteId: inviteId
    });
    
    console.log(`Sent game invitation for ${gameType} to ${props.partnerId}`);
    
    // Show a toast or notification that invitation was sent
    showToastMessage(`Invitation sent! Waiting for response...`, 'info');
    
    // Set a timeout to cancel the invitation if no response
    invitationTimeout.value = window.setTimeout(() => {
      if (waitingForAcceptance.value) {
        // Partner didn't respond in time
        waitingForAcceptance.value = false;
        errorMessage.value = "Your partner didn't respond to the invitation. Please try again.";
        logDebugInfo("Invitation timed out - no response from partner");
        
        // Clear game selection
        selectedGame.value = null;
        gameRoomId.value = null;
        invitationId.value = null;
      }
    }, 30000); // 30 seconds timeout (changed from 45 seconds)
  }
};

// Close game
const closeGame = () => {
  // Clear any pending invitation timeout
  if (invitationTimeout.value) {
    clearTimeout(invitationTimeout.value);
    invitationTimeout.value = null;
  }
  
  // Reset waiting state
  waitingForAcceptance.value = false;
  invitationId.value = null;
  
  // Notify partner that we're leaving the game but still in chat
  if (props.partnerId) {
    socket.value?.emit('game-leave-notification', {
      gameType: selectedGame.value || 'unknown',
      to: props.partnerId,
      message: 'Your partner returned to the game menu'
    });
    
    // Send notification to partner first
    if (socket.value) {
      socket.value.emit('game-notification', {
        gameType: selectedGame.value || 'unknown',
        to: props.partnerId,
        message: 'Your partner has left the game',
        type: 'leave'
      });
    }
    
    // Small delay before leaving room to ensure notification is sent
    setTimeout(() => {
      // Leave the room to clean up server resources
      if (gameRoomId.value && socket.value) {
        socket.value.emit('game-leave-room', {
      roomId: gameRoomId.value,
      to: props.partnerId
    });
  }
  
  // Reset state
  selectedGame.value = null;
  errorMessage.value = null;
  isFirstPlayer.value = true;
  gameRoomId.value = null;
  partnerReady.value = false;
    }, 100);
  } else {
    // Reset state immediately if no partner
    selectedGame.value = null;
    errorMessage.value = null;
    isFirstPlayer.value = true;
    gameRoomId.value = null;
    partnerReady.value = false;
  }
};

// Handle game error
const handleGameError = (error: string) => {
  errorMessage.value = error;
  logDebugInfo(`Error: ${error}`);
};

// Cancel an ongoing invitation
const cancelInvitation = () => {
  // Clear the timeout
  if (invitationTimeout.value) {
    clearTimeout(invitationTimeout.value);
    invitationTimeout.value = null;
  }
  
  // Notify the partner that we've cancelled the invitation
  if (socket.value && props.partnerId && invitationId.value) {
    socket.value.emit('game-invite-cancel', {
      inviteId: invitationId.value,
      to: props.partnerId,
      gameType: selectedGame.value
    });
    
    logDebugInfo(`Cancelled invitation: ${invitationId.value}`);
    
    // Show a confirmation toast message
    showToastMessage('Game invitation cancelled', 'info');
  }
  
  // Reset states - important to clear ALL game-related state
  waitingForAcceptance.value = false;
  invitationId.value = null;
  selectedGame.value = null;
  gameRoomId.value = null;
  partnerReady.value = false;
  
  // If there was a game room created, leave it explicitly
  if (gameRoomId.value && socket.value && props.partnerId) {
    socket.value.emit('game-leave-room', {
      roomId: gameRoomId.value,
      to: props.partnerId
    });
  }
};

// Set up socket event listeners
onMounted(() => {
  logDebugInfo('Setting up game events');
  
  // Listen for custom game invitation accepted event from HomeView
  window.addEventListener('game-invitation-accepted', gameInvitationAcceptedHandler);
  
  // Add event listener for game error events from parent
  window.addEventListener('game-error', ((event: CustomEvent) => {
    const { message, gameType } = event.detail;
    
    if (message && gameType === selectedGame.value) {
      logDebugInfo(`Received game error event: ${message}`);
      errorMessage.value = message;
      
      // Reset game state to prevent issues with future invitations
      waitingForAcceptance.value = false;
      invitationId.value = null;
      
      // We don't reset selectedGame here to allow the error to be displayed
    }
  }) as EventListener);
  
  // Add event listener for direct game selection from notifications
  document.addEventListener('select-game', ((event: CustomEvent) => {
    const { gameType, partnerId: gamePartnerId } = event.detail;
    
    if (gameType && gamePartnerId && gamePartnerId === props.partnerId) {
      logDebugInfo(`Received direct game selection: ${gameType}`);
      selectedGame.value = gameType;
      errorMessage.value = null;
      isFirstPlayer.value = false; // We're joining as second player
      partnerReady.value = true;
      
      // Create a deterministic room ID based on user IDs
      const userIds = [userId.value, props.partnerId].sort();
      gameRoomId.value = `${gameType}-${userIds[0]}-${userIds[1]}`;
      
      logDebugInfo(`Created game room: ${gameRoomId.value}`);
    }
  }) as EventListener);
  
  // Handle game invites and room joins
  socket.value?.on('game-room-invite', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Received invitation to join game room: ${data.roomId}`);
      gameRoomId.value = data.roomId;
      selectedGame.value = data.gameType;
      isFirstPlayer.value = false; // We're joining, so we're the second player
      
      // Join the room
      socket.value?.emit('game-join-room', {
        gameType: data.gameType,
        roomId: data.roomId,
        to: props.partnerId,
        isFirstPlayer: false
      });
    }
  });
  
  // Handle invitation responses
  socket.value?.on('game-invite-accepted', (data: any) => {
    if (data.from === props.partnerId && waitingForAcceptance.value) {
      logDebugInfo(`Partner accepted game invitation: ${data.inviteId}`);
      
      // Clear any timeout
      if (invitationTimeout.value) {
        clearTimeout(invitationTimeout.value);
        invitationTimeout.value = null;
      }
      
      // Update state to allow gameplay
      waitingForAcceptance.value = false;
      partnerReady.value = true;
      
      // Show success message
      showToastMessage('Your partner accepted! Game starting...', 'success');
    }
  });
  
  socket.value?.on('game-invite-declined', (data: any) => {
    if (data.from === props.partnerId && waitingForAcceptance.value) {
      logDebugInfo(`Partner declined game invitation: ${data.inviteId}`);
      
      // Clear any timeout
      if (invitationTimeout.value) {
        clearTimeout(invitationTimeout.value);
        invitationTimeout.value = null;
      }
      
      // Reset state and show error
      waitingForAcceptance.value = false;
      errorMessage.value = "Your partner declined the game invitation.";
      
      // إغلاق اللعبة بالكامل بدلاً من الاحتفاظ بـ selectedGame
      selectedGame.value = null;
      gameRoomId.value = null;
      partnerReady.value = false;
      
      // تأكيد أن أي غرفة لعبة قائمة تم مغادرتها
      if (gameRoomId.value && socket.value && props.partnerId) {
        socket.value.emit('game-leave-room', {
          roomId: gameRoomId.value,
          to: props.partnerId
        });
      }
    }
  });
  
  socket.value?.on('game-invite-timeout', (data: any) => {
    if (waitingForAcceptance.value && invitationId.value === data.inviteId) {
      logDebugInfo(`Game invitation timed out: ${data.inviteId}`);
      
      // Clear any timeout
      if (invitationTimeout.value) {
        clearTimeout(invitationTimeout.value);
        invitationTimeout.value = null;
      }
      
      // Reset state and show error
      waitingForAcceptance.value = false;
      errorMessage.value = "The game invitation expired. Please try again.";
      selectedGame.value = null;
      gameRoomId.value = null;
    }
  });
  
  socket.value?.on('game-invite-cancel', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Partner cancelled game invitation: ${data.inviteId}`);
      
      // Instead of showing an error message, just reset the game state silently
      // This allows future invitations to work properly
      waitingForAcceptance.value = false;
      invitationId.value = null;
      gameRoomId.value = null;
      
      // Don't set errorMessage here to avoid showing the error screen
      // Don't reset selectedGame here to allow for a smoother transition if a new invitation is accepted
    }
  });
  
  // Handle game partner joined
  socket.value?.on('game-partner-joined', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Partner joined the game: ${data.gameType}`);
      partnerReady.value = true;
    }
  });
  
  // Handle errors
  socket.value?.on('game-error', (data: any) => {
    if (data.from === 'system' || data.from === props.partnerId) {
      errorMessage.value = data.message || "An error occurred in the game.";
      logDebugInfo(`Game error: ${data.message}`);
    }
  });
  
  // Handle partner leaving
  socket.value?.on('game-partner-left', (data: any) => {
    if (selectedGame.value) {
      // إغلاق اللعبة بدون إظهار رسالة خطأ
      logDebugInfo('Partner left the game - closing silently');
      
      // إعادة تعيين الحالة بدون عرض رسالة خطأ
      selectedGame.value = null;
      gameRoomId.value = null;
      partnerReady.value = false;
      
      // تأكد من إزالة أي رسائل خطأ موجودة
      errorMessage.value = null;
    }
  });
  
  // Handle notifications
  socket.value?.on('game-notification', (data: any) => {
    if (data.from === props.partnerId) {
      logDebugInfo(`Notification from partner: ${data.message}`);
    }
  });
});

// Clean up event listeners
onUnmounted(() => {
  logDebugInfo('Cleaning up game events');
  
  // Remove event listeners
  window.removeEventListener('game-invitation-accepted', gameInvitationAcceptedHandler);
  window.removeEventListener('game-error', (() => {}) as EventListener);
  
  // Clear any pending invitation timeout
  if (invitationTimeout.value) {
    clearTimeout(invitationTimeout.value);
    invitationTimeout.value = null;
  }
  
  // If we were waiting for an invitation response, cancel it
  if (waitingForAcceptance.value && invitationId.value && socket.value && props.partnerId) {
    socket.value.emit('game-invite-cancel', {
      inviteId: invitationId.value,
      to: props.partnerId,
      gameType: selectedGame.value
    });
  }
  
  // Remove socket event listeners
  if (socket.value) {
    socket.value.off('game-room-invite');
    socket.value.off('game-partner-joined');
    socket.value.off('game-error');
    socket.value.off('game-partner-left');
    socket.value.off('game-notification');
    socket.value.off('game-invite-accepted');
    socket.value.off('game-invite-declined');
    socket.value.off('game-invite-timeout');
    socket.value.off('game-invite-cancel');
    
    // Leave any active game room
    if (gameRoomId.value && props.partnerId) {
      socket.value.emit('game-leave-room', {
        roomId: gameRoomId.value,
        to: props.partnerId
      });
    }
  }
  
  // Reset all states
  waitingForAcceptance.value = false;
  invitationId.value = null;
  
  // Remove event listener
  document.removeEventListener('select-game', (() => {}) as EventListener);
});

// Watch for dialog close to reset game state
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    closeGame();
  }
});

// Helper function to show toast messages
const showToastMessage = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  // Create a div for the toast notification
  const toast = document.createElement('div');
  
  // Set class based on type
  let bgColor = 'bg-blue-600';
  if (type === 'success') bgColor = 'bg-emerald-600';
  if (type === 'error') bgColor = 'bg-red-600';
  
  // Apply styles
  toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
  toast.style.animationDuration = '0.3s';
  
  // Add content
  toast.innerHTML = message;
  
  // Add to DOM
  document.body.appendChild(toast);
  
  // Remove after delay
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
};
</script>

<style scoped>
/* No custom styles needed */
</style>