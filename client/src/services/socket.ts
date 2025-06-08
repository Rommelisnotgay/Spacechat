import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

// Determine the API URL based on environment
const getApiUrl = () => {
  // For production on Glitch, use relative URL which will use the same host
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  
  // For development, use the configured API URL or default
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
};

// Socket instance
const socket = ref<Socket | null>(null);
const userId = ref<string | null>(null);
const isConnected = ref(false);

/**
 * Socket service for managing real-time connections
 */
export function useSocket() {
  onMounted(() => {
    if (!socket.value) {
      initializeSocket();
    }
  });

  onUnmounted(() => {
    // Clean up socket connection when component is unmounted
    // But don't disconnect completely - just remove listeners from this instance
    if (socket.value) {
      cleanupSocketListeners();
    }
  });

  // Initialize the socket connection
  function initializeSocket() {
    const apiUrl = getApiUrl();
    console.log(`Connecting to socket server at: ${apiUrl}`);
    
    // Connect to socket.io server
    socket.value = io(apiUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // Try to reconnect forever
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Max delay between reconnections
      timeout: 20000, // Increased timeout
      transports: ['websocket', 'polling'] // Prefer WebSocket but fallback to polling
    });

    setupSocketListeners();
  }

  // Set up all socket event listeners
  function setupSocketListeners() {
    if (!socket.value) return;

    // Set up event listeners
    socket.value.on('connect', () => {
      console.log('Socket connected');
      isConnected.value = true;
      
      // Get user ID from the server after connecting
      socket.value?.emit('user:identify', {}, (id: string) => {
        console.log('Identified with server, user ID:', id);
        userId.value = id;
      });
      
      // Request online count update
      socket.value?.emit('get-online-count');
    });

    socket.value.on('disconnect', () => {
      console.log('Socket disconnected');
      isConnected.value = false;
    });

    socket.value.on('reconnect', (attemptNumber: number) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
      isConnected.value = true;
      
      // Re-identify with the server and refresh state
      if (userId.value) {
        socket.value?.emit('user:identify', { prevUserId: userId.value }, (id: string) => {
          console.log('Re-identified with server after reconnection, user ID:', id);
          userId.value = id;
          
          // Re-request online count
          socket.value?.emit('get-online-count');
        });
      }
    });

    socket.value.on('reconnect_attempt', (attemptNumber: number) => {
      console.log(`Socket reconnection attempt ${attemptNumber}`);
    });

    socket.value.on('reconnect_error', (error: Error) => {
      console.error('Socket reconnection error:', error);
    });

    socket.value.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      
      // Try to initialize socket again after a delay
      setTimeout(() => {
        if (!isConnected.value) {
          console.log('Attempting to reinitialize socket connection...');
          cleanupSocketListeners();
          initializeSocket();
        }
      }, 5000);
    });

    socket.value.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });
    
    // Handle user ID from server
    socket.value.on('user-id', (id: string) => {
      console.log('Received user ID from server:', id);
      userId.value = id;
    });
  }

  // Clean up all socket listeners
  function cleanupSocketListeners() {
    if (!socket.value) return;
    
    socket.value.off('connect');
    socket.value.off('disconnect');
    socket.value.off('reconnect');
    socket.value.off('reconnect_attempt');
    socket.value.off('reconnect_error');
    socket.value.off('reconnect_failed');
    socket.value.off('error');
    socket.value.off('user-id');
  }

  // Force reconnection
  function reconnect() {
    if (socket.value) {
      console.log('Forcing socket reconnection...');
      socket.value.disconnect();
      socket.value.connect();
    } else {
      initializeSocket();
    }
  }

  return { 
    socket, 
    isConnected, 
    userId,
    reconnect 
  };
}
