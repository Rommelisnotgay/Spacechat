import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

// Determine the API URL based on environment
const getApiUrl = () => {
  // In production, use the same domain (as the server serves the client)
  if (import.meta.env.PROD) {
    // When running on Railway, the client is served by the server,
    // so we use relative URL in production
    return window.location.origin;
  }
  
  // For development, use the configured API URL or default
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
};

// Socket instance
const socket = ref<Socket | null>(null);
const userId = ref<string | null>(null);
const isConnected = ref(false);
let pingInterval: ReturnType<typeof setInterval> | null = null;

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
    
    // Clear ping interval
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  });

  // Initialize the socket connection
  function initializeSocket() {
    const apiUrl = getApiUrl();
    console.log(`Connecting to socket server at: ${apiUrl}`);
    
    // Try to get previously stored user ID
    const storedUserId = localStorage.getItem('spacechat_user_id');
    console.log('Retrieved stored user ID:', storedUserId);
    
    // Connect to socket.io server
    socket.value = io(apiUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // Try to reconnect forever
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Max delay between reconnections
      timeout: 30000, // Increased timeout to 30 seconds
      transports: ['websocket', 'polling'], // Prefer WebSocket but fallback to polling
      extraHeaders: {
        'X-Client-Version': '1.0.0', // Helps identify client versions for debugging
      },
      // Add stored user ID in query params for immediate identification
      query: storedUserId ? { userId: storedUserId } : undefined,
      // Path settings - uncomment if needed for specific server setup
      // path: '/socket.io/',
      forceNew: false, // Reuse existing connection if possible
      rememberUpgrade: true, // Remember websocket connection between page refreshes
      // Added to enhance connection behind proxies and firewalls
      withCredentials: true
    });

    setupSocketListeners();
    
    // Setup ping/pong to keep connection alive and updating last seen time
    startPingInterval();
  }
  
  // Setup ping interval
  function startPingInterval() {
    // Clear existing interval if any
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    
    // Start new interval - ping every 30 seconds
    pingInterval = setInterval(() => {
      if (socket.value && isConnected.value) {
        socket.value.emit('ping');
      }
    }, 30000);
  }

  // Set up all socket event listeners
  function setupSocketListeners() {
    if (!socket.value) return;

    // Set up event listeners
    socket.value.on('connect', () => {
      console.log('Socket connected');
      isConnected.value = true;
      
      // Get stored user ID from localStorage if available
      const storedUserId = localStorage.getItem('spacechat_user_id');
      
      // Get user ID from the server after connecting
      socket.value?.emit('user:identify', 
        { prevUserId: storedUserId || undefined }, 
        (id: string) => {
          console.log('Identified with server, user ID:', id);
          userId.value = id;
          
          // Store user ID in localStorage for reconnection
          localStorage.setItem('spacechat_user_id', id);
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
      const storedUserId = localStorage.getItem('spacechat_user_id');
      if (storedUserId) {
        socket.value?.emit('user:identify', { prevUserId: storedUserId }, (id: string) => {
          console.log('Re-identified with server after reconnection, user ID:', id);
          userId.value = id;
          
          // Update stored ID if different
          if (id !== storedUserId) {
            localStorage.setItem('spacechat_user_id', id);
          }
          
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
    
    // Handle pong response
    socket.value.on('pong', () => {
      // Connection is active, nothing to do
    });
    
    // Handle user ID from server
    socket.value.on('user-id', (id: string) => {
      console.log('Received user ID from server:', id);
      userId.value = id;
      // Store user ID in localStorage for reconnection
      localStorage.setItem('spacechat_user_id', id);
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
    socket.value.off('pong');
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
