import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { io, Socket } from 'socket.io-client';

// تحديد عنوان API بناءً على البيئة
const getApiUrl = () => {
  // في الإنتاج، استخدم نفس النطاق (حيث يقدم الخادم العميل)
  if (import.meta.env.PROD) {
    // عند التشغيل على Railway أو أي استضافة أخرى
    return window.location.origin;
  }
  
  // للتطوير، استخدم عنوان API المكون أو الافتراضي مع المنفذ 8080
  return import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080`;
};

// مثيل Socket
const socket = ref<Socket | null>(null);
const userId = ref<string | null>(null);
const isConnected = ref(false);
let pingInterval: ReturnType<typeof setInterval> | null = null;

// Queue status variables
const queueStatus = ref<'idle' | 'waiting' | 'timeout' | 'matched'>('idle');
const queueMessage = ref<string>('');
const queueWaitTime = ref<number>(0);

// Optimized for high traffic - connection backoff parameters
const MAX_RECONNECTION_ATTEMPTS = 10;
const INITIAL_RECONNECTION_DELAY = 1000;
const MAX_RECONNECTION_DELAY = 10000;
const PING_INTERVAL = 45000; // 45 seconds ping interval
const CONNECTION_TIMEOUT = 30000; // 30 seconds connection timeout

/**
 * Socket service for managing real-time connections
 * Optimized for high traffic (200+ users, 2000 reqs/sec)
 */
export function useSocket() {
  // Check if we're in a component setup context
  const isInSetupContext = !!getCurrentInstance();
  
  // Initialize the socket connection if not already initialized
  if (!socket.value) {
    initializeSocket();
  }
  
  // Only register lifecycle hooks if we're in a component setup context
  if (isInSetupContext) {
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
  }

  // Initialize the socket connection with optimized settings for high traffic
  function initializeSocket() {
    const apiUrl = getApiUrl();
    
    // Try to get previously stored user ID
    const storedUserId = localStorage.getItem('spacechat_user_id');
    
    // Connect to socket.io server - optimized for high concurrency
    socket.value = io(apiUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
      reconnectionDelay: INITIAL_RECONNECTION_DELAY,
      reconnectionDelayMax: MAX_RECONNECTION_DELAY,
      timeout: CONNECTION_TIMEOUT, 
      transports: ['websocket', 'polling'], // محاولة WebSocket أولاً ثم الرجوع إلى polling إذا لزم الأمر
      extraHeaders: {
        'X-Client-Version': '1.0.0'
      },
      // Add stored user ID in query params for immediate identification
      query: storedUserId ? { userId: storedUserId } : undefined,
      forceNew: false, // Reuse existing connection
      withCredentials: true
    });

    setupSocketListeners();
    
    // Setup ping/pong to keep connection alive and updating last seen time
    startPingInterval();
  }
  
  // Setup ping interval - optimized to reduce unnecessary traffic
  function startPingInterval() {
    // Clear existing interval if any
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    
    // Start new interval - ping less frequently to reduce server load
    pingInterval = setInterval(() => {
      if (socket.value && isConnected.value) {
        // Send heartbeat to update last seen time
        socket.value.emit('heartbeat');
      }
    }, PING_INTERVAL);
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

    // Handle queue timeout event
    socket.value.on('queue-timeout', (data: { message: string, waitTime: number }) => {
      console.log('Queue timeout:', data);
      queueStatus.value = 'timeout';
      // If the message is in Arabic, replace it with English
      queueMessage.value = "We couldn't find a suitable match in the allotted time. Please try again.";
      queueWaitTime.value = data.waitTime;
      
      // Emit a custom event for components to react to
      window.dispatchEvent(new CustomEvent('queue-status-changed', { 
        detail: { status: 'timeout', message: queueMessage.value, waitTime: data.waitTime }
      }));
    });
    
    // Handle queue waiting notification
    socket.value.on('queue-waiting', (data: { message: string, waitTime: number }) => {
      console.log('Queue waiting notification:', data);
      queueStatus.value = 'waiting';
      // If the message is in Arabic, replace it with English
      queueMessage.value = "We're still looking for a match for you. Please wait...";
      queueWaitTime.value = data.waitTime;
      
      // Emit a custom event for components to react to
      window.dispatchEvent(new CustomEvent('queue-status-changed', { 
        detail: { status: 'waiting', message: queueMessage.value, waitTime: data.waitTime }
      }));
    });
    
    // Update status when matched
    socket.value.on('matched', () => {
      queueStatus.value = 'matched';
      queueMessage.value = '';
      queueWaitTime.value = 0;
    });
    
    // Reset queue status when joining queue
    socket.value.on('join-queue', () => {
      queueStatus.value = 'waiting';
      queueMessage.value = 'Looking for someone matching your preferences...';
      queueWaitTime.value = 0;
    });

    // Add handler for visibility change to update activity when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket.value && socket.value.connected) {
        socket.value.emit('heartbeat');
        console.log('Tab became visible, sending heartbeat');
      }
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
    
    // Clean up queue event listeners
    socket.value.off('queue-timeout');
    socket.value.off('queue-waiting');
  }

  // Force reconnection with improved handling
  function reconnect() {
    if (socket.value) {
      console.log('Forcing socket reconnection...');
      
      // إلغاء أي محاولات إعادة اتصال حالية
      socket.value.io.opts.reconnection = false;
      socket.value.disconnect();
      
      // إعادة تعيين خيارات إعادة الاتصال
      setTimeout(() => {
        if (socket.value) {
          // تمكين إعادة الاتصال مرة أخرى
          socket.value.io.opts.reconnection = true;
          socket.value.io.opts.reconnectionAttempts = MAX_RECONNECTION_ATTEMPTS;
          socket.value.io.opts.reconnectionDelay = INITIAL_RECONNECTION_DELAY;
          socket.value.io.opts.reconnectionDelayMax = MAX_RECONNECTION_DELAY;
          
          // محاولة الاتصال
          socket.value.connect();
          console.log('Reconnection attempt initiated');
        } else {
          // إذا لم يكن هناك اتصال، قم بتهيئة اتصال جديد
          initializeSocket();
        }
      }, 1000);
    } else {
      // إذا لم يكن هناك اتصال، قم بتهيئة اتصال جديد
      initializeSocket();
    }
  }

  return {
    socket,
    userId,
    isConnected,
    queueStatus,
    queueMessage,
    queueWaitTime,
    reconnect,
    isInSetupContext
  };
}
