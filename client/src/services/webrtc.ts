import { ref, onUnmounted, shallowRef, watch, computed } from 'vue';
import type { Ref } from 'vue';
import { useSocket } from './socket';
import { Socket } from 'socket.io-client';
import { 
  standardRtcConfiguration, 
  fastRtcConfiguration, 
  turnOnlyRtcConfiguration, 
  localRtcConfiguration,
  getOptimalRtcConfiguration
} from './rtc-configurations';
import { useMicrophoneState } from './storage';

// إضافة تعريف للمتغيرات العالمية المستخدمة لتخزين ترشيحات ICE
declare global {
  interface Window {
    __localIceCandidates?: RTCIceCandidate[];
    __remoteIceCandidates?: RTCIceCandidate[];
    __iceCandidatePairs?: any[];
  }
}

interface ConnectionPreferences {
  vibe?: string;
  language?: string;
  preferSameLanguage?: boolean;
}

// Initialize with standard config, but this will be replaced with server-provided config
let currentRtcConfig: RTCConfiguration = standardRtcConfiguration;

// Initialize rtcConfiguration as a ref to allow it to be updated dynamically
const rtcConfiguration = ref<RTCConfiguration>(currentRtcConfig);

// Flag to track if we have loaded dynamic configuration
let hasDynamicConfig = false;

// Load optimal configuration asynchronously
getOptimalRtcConfiguration().then(config => {
  currentRtcConfig = config;
  rtcConfiguration.value = config;
  hasDynamicConfig = true;
  console.log('Loaded optimal WebRTC configuration from server');
}).catch(err => {
  console.error('Failed to load optimal configuration, using fallback:', err);
});

// Singleton instances for WebRTC to ensure persistence across component lifecycles
let globalPeerConnection: RTCPeerConnection | null = null;
let globalLocalStream: MediaStream | null = null;
let globalRemoteStream: MediaStream | null = null;
const globalConnectionState = ref<string>('new');
const globalIsAudioMuted = ref<boolean>(false);
const globalPartnerId = ref<string | null>(null);

// Add debug flag
const DEBUG = true;

// Debugging info storage
let lastConnectionError: string = '';
let failureReason: string = '';
let peerConnectionStats: any = null;

// Adding variables to control the connection
let isNegotiating = false; // Prevent offer/answer overlap
let isRestartingIce = false; // Control ICE restart
let connectionRetryCount = 0; // Number of connection retry attempts
const MAX_CONNECTION_RETRIES = 15; // Increased number of attempts
let pendingCandidates: RTCIceCandidate[] = []; // List of pending ICE candidates

// Adding stability variables
let heartbeatInterval: number | null = null;
let trackCheckInterval: number | null = null;
let connectionMonitorInterval: number | null = null;
const HEARTBEAT_INTERVAL = 5000; 
const TRACK_CHECK_INTERVAL = 5000;
const CONNECTION_MONITOR_INTERVAL = 8000;
const CONNECTION_STABILITY_THRESHOLD = 15000; // seconds before considering the connection stable

// Add constants for connection timeouts - optimized for faster connections
const CONNECTION_TIMEOUT = 10000; // 10 seconds for initial connection
const RECONNECT_DELAY = 800; // 800ms delay for reconnect

// Add an automatic reconnection system with exponential backoff
let reconnectionTimer: number | null = null;
let reconnectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10; // زيادة من 5 إلى 10
const INITIAL_RECONNECTION_DELAY = 1000; // 1 second

// Define interface for the return type of useWebRTC
interface WebRTCHook {
  socket: Ref<any>; // Using any to bypass socket.io-client type issues
  peerConnection: Ref<RTCPeerConnection | null>;
  remoteStream: Ref<MediaStream | null>;
  localStream: Ref<MediaStream | null>;
  connectionState: Ref<string>;
  isAudioMuted: Ref<boolean>;
  partnerId: Ref<string | null>;
  createOffer: (targetPartnerId: string | null) => Promise<any>;
  handleOffer: (offer: RTCSessionDescriptionInit, targetPartnerId: string) => Promise<void>;
  handleAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  handleIceCandidate: (candidate: RTCIceCandidate) => Promise<void>;
  toggleMicrophone: () => Promise<boolean>;
  closeConnection: () => void;
  initializeLocalStream: () => Promise<MediaStream>;
  cleanup: () => void;
  diagnosticReport: any;
  restoreMicrophoneState: () => Promise<void>;
  initializeConnection: (partnerId?: string | null) => Promise<void>;
  diagnoseAndFixConnection: () => boolean;
  startNegotiation: () => void;
  attemptReconnection: (partnerId: string | null) => void;
}

// Add function to collect and send diagnostic data to server
async function sendDiagnosticData(pc: RTCPeerConnection | null, event: string, details: any = {}): Promise<void> {
  if (!pc) return;
  
  try {
    // Collect basic diagnostics
    const stats = await pc.getStats();
    const statsData: any = {};
    
    // Convert stats to a simple object
    stats.forEach(stat => {
      statsData[stat.id] = {
        type: stat.type,
        timestamp: stat.timestamp,
        ...stat
      };
    });
    
    // Collect basic data
    const diagnosticData = {
      event,
      timestamp: Date.now(),
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      localCandidates: (window as any).__localIceCandidates?.length || 0,
      remoteCandidates: (window as any).__remoteIceCandidates?.length || 0,
      iceCandidatePairsCount: (window as any).__iceCandidatePairs?.length || 0,
      rtcConfiguration: rtcConfiguration.value,
      hasDynamicConfig,
      details,
      statsData
    };
    
    // تحديد عنوان API بطريقة مرنة تعمل في أي بيئة
    const baseUrl = (() => {
      // استخدام متغير البيئة إذا كان متوفرًا
      if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL;
      }
      
      // في بيئة الإنتاج، استخدم نفس المصدر
      if (import.meta.env.PROD) {
        return window.location.origin;
      }
      
      // في بيئة التطوير، استخدم المضيف مع المنفذ المخصص للخادم
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      const serverPort = import.meta.env.VITE_SERVER_PORT || '8080';
      return `${protocol}//${host}:${serverPort}`;
    })();
    
    // Send to server - don't wait for response
    fetch(`${baseUrl}/api/webrtc-diagnostics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(diagnosticData)
    }).catch(err => {
      console.error('Failed to send diagnostic data:', err);
    });
  } catch (error) {
    console.error('Error collecting diagnostic data:', error);
  }
}

// Get connection statistics
async function getConnectionStats(): Promise<any> {
  if (!globalPeerConnection) {
    return { error: 'No peer connection available' };
  }
  
  try {
    const stats: any = {};
    const statsReport = await globalPeerConnection.getStats();
    
    statsReport.forEach((report: any) => {
      if (report.type === 'transport') {
        stats.transport = {
          bytesReceived: report.bytesReceived,
          bytesSent: report.bytesSent,
          dtlsState: report.dtlsState,
          selectedCandidatePairId: report.selectedCandidatePairId
        };
      } else if (report.type === 'candidate-pair' && report.selected) {
        stats.selectedCandidatePair = {
          localCandidateId: report.localCandidateId,
          remoteCandidateId: report.remoteCandidateId,
          state: report.state,
          availableOutgoingBitrate: report.availableOutgoingBitrate
        };
      } else if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
        if (!stats.candidates) stats.candidates = [];
        stats.candidates.push({
          type: report.type,
          id: report.id,
          ip: report.ip,
          port: report.port,
          protocol: report.protocol,
          candidateType: report.candidateType
        });
      } else if (report.type === 'media-source' || report.type === 'track' || report.type === 'media-playout') {
        if (!stats.media) stats.media = [];
        stats.media.push({
          type: report.type,
          id: report.id,
          kind: report.kind,
          audioLevel: report.audioLevel,
          trackIdentifier: report.trackIdentifier
        });
      }
    });
    
    return stats;
  } catch (error) {
    console.error('[WebRTC] Error getting stats:', error);
    return { error: 'Failed to get stats: ' + error };
  }
}

// Update connection statistics periodically
function startStatsCollection() {
  // Clear any existing timer
  stopStatsCollection();
  
  // Start a new timer to collect stats every 5 seconds
  const statsTimer = setInterval(async () => {
    if (globalPeerConnection && 
        (globalConnectionState.value === 'connected' || 
         globalConnectionState.value === 'connecting')) {
      peerConnectionStats = await getConnectionStats();
      if (DEBUG) console.log('[WebRTC] Connection stats:', peerConnectionStats);
    } else {
      stopStatsCollection();
    }
  }, 5000);
  
  // Store the timer ID globally
  (window as any).__webrtcStatsTimer = statsTimer;
}

// Stop stats collection
function stopStatsCollection() {
  const timer = (window as any).__webrtcStatsTimer;
  if (timer) {
    clearInterval(timer);
    (window as any).__webrtcStatsTimer = null;
  }
}

// Diagnose connection issues
function diagnoseConnectionIssues(): string {
  if (!globalPeerConnection) {
    return 'لا يوجد اتصال. حاول تحديث الصفحة أو التحقق من إعدادات متصفحك.';
  }
  
  // Check for specific issues
  if (failureReason) {
    return `فشل الاتصال: ${failureReason}`;
  }
  
  if (lastConnectionError) {
    return `آخر خطأ: ${lastConnectionError}`;
  }
  
  if (!globalLocalStream || globalLocalStream.getAudioTracks().length === 0) {
    return 'لم يتم العثور على المايكروفون. يرجى التحقق من إعدادات الصوت وإذن المتصفح.';
  }
  
  if (!globalRemoteStream || globalRemoteStream.getAudioTracks().length === 0) {
    return 'لم يتم استلام صوت من الطرف الآخر. قد تكون هناك مشكلة في الشبكة أو إعدادات المايكروفون لديهم.';
  }
  
  const state = globalPeerConnection.connectionState || globalPeerConnection.iceConnectionState;
  
  // Provide user-friendly messages based on connection state
  switch (state) {
    case 'new': return 'الاتصال قيد الإعداد. يرجى الانتظار...';
    case 'connecting': return 'يتم إنشاء الاتصال. قد يستغرق هذا بعض الوقت حسب إعدادات الشبكة.';
    case 'connected': return 'تم الاتصال بنجاح! إذا كنت لا تسمع الطرف الآخر، تأكد من تشغيل الصوت في متصفحك.';
    case 'disconnected': return 'انقطع الاتصال مؤقتًا. جار محاولة إعادة الاتصال...';
    case 'failed': return 'فشل الاتصال. يرجى تحديث الصفحة أو إعادة تشغيل الاتصال.';
    case 'closed': return 'تم إغلاق الاتصال. يمكنك تحديث الصفحة للمحاولة مرة أخرى.';
    default: return `حالة الاتصال غير معروفة: ${state}. يرجى إعادة تحميل الصفحة.`;
  }
}

/**
 * WebRTC service for audio calls
 */
export function useWebRTC(): WebRTCHook {
  const { socket, userId, isInSetupContext } = useSocket();
  
  // Use shallow refs to the global objects
  const peerConnection = shallowRef<RTCPeerConnection | null>(globalPeerConnection);
  const localStream = shallowRef<MediaStream | null>(globalLocalStream);
  const remoteStream = shallowRef<MediaStream | null>(globalRemoteStream);
  const connectionState = globalConnectionState;
  const isAudioMuted = globalIsAudioMuted;
  const partnerId = globalPartnerId;
  
  // Audio constraints
  const audioConstraints = ref<MediaTrackConstraints>({
    echoCancellation: true,
    noiseSuppression: true
  });
  
  /**
   * Initialize local media stream (microphone)
   */
  const initializeLocalStream = async (): Promise<MediaStream> => {
    // إذا كان التدفق المحلي موجوداً وفيه مسارات صوت، استخدمه
    if (globalLocalStream && globalLocalStream.getAudioTracks().length > 0) {
      if (DEBUG) console.log('[WebRTC] Reusing existing local stream');
      return globalLocalStream;
    }
    
    try {
      // إنشاء طلب للوصول إلى ميكروفون المستخدم
      if (DEBUG) console.log('[WebRTC] Requesting microphone access');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      // التأكد من أن التدفق يحتوي على مسارات صوتية
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available in media stream');
      }
      
      if (DEBUG) {
        console.log(`[WebRTC] Got local stream with ${audioTracks.length} audio tracks`);
        console.log('[WebRTC] Audio track settings:', audioTracks[0].getSettings());
      }
      
      // تخزين التدفق المحلي
      globalLocalStream = stream;
      localStream.value = stream;
      
      // استرجاع حالة كتم الصوت وتطبيقها على التدفق الجديد مباشرة
      const { getSavedMicrophoneState } = useMicrophoneState();
      const savedMuteState = getSavedMicrophoneState();
      
      if (savedMuteState === true) {
        if (DEBUG) console.log('[WebRTC] Applying saved mute state to new stream (muted)');
        // تطبيق حالة كتم الصوت على المسارات
        audioTracks.forEach(track => {
          track.enabled = false;
        });
        // تحديث المتغير العام
        globalIsAudioMuted.value = true;
        // إرسال حدث لتحديث واجهة المستخدم
        window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: true } }));
      } else {
        // التأكد من أن الصوت مفعل
        audioTracks.forEach(track => {
          track.enabled = true;
        });
        globalIsAudioMuted.value = false;
      }
      
      return stream;
    } catch (error) {
      console.error('[WebRTC] Error accessing microphone:', error);
      failureReason = `Failed to access microphone: ${error}`;
      throw error;
    }
  };
  
  /**
   * إنشاء اتصال RTCPeerConnection جديد مع تحسينات الاستقرار
   */
  const createPeerConnection = (): RTCPeerConnection => {
    // Cleanup any existing connection
    if (globalPeerConnection) {
      try {
        globalPeerConnection.close();
        // Clear any global references to the connection and streams
        globalPeerConnection = null;
        if (globalRemoteStream) {
          globalRemoteStream.getTracks().forEach(track => {
            track.stop();
          });
          globalRemoteStream = null;
        }
      } catch (err) {
        console.error('[WebRTC] Error cleaning up old peer connection:', err);
      }
    }

    try {
      // تعزيز تكوين WebRTC للعمل عبر الشبكات المختلفة
      // هذه الإعدادات الإضافية تساعد في التعامل مع NAT وجدران الحماية المختلفة
      const enhancedConfig = {
        ...rtcConfiguration.value,
        sdpSemantics: 'unified-plan',
        // زيادة مجموعة المرشحين لتحسين فرص الاتصال
        iceCandidatePoolSize: 20,
        // تمكين التراجع إلى TCP عند الحاجة (قد يكون أبطأ ولكن أكثر موثوقية عبر بعض الشبكات)
        iceTransportPolicy: 'all' as RTCIceTransportPolicy
      };

      // Create a new RTCPeerConnection with our enhanced configuration
      const pc = new RTCPeerConnection(enhancedConfig);
    
      // On negotiation needed
      pc.onnegotiationneeded = async (event) => {
        if (DEBUG) console.log('[WebRTC] Negotiation needed event', event);
        
        if (!canSetLocalDescription(pc) || isNegotiating) {
          if (DEBUG) console.log('[WebRTC] Skipping negotiation - already in progress or not in stable state');
          return;
        }
        
        isNegotiating = true;
        
        try {
          if (DEBUG) console.log('[WebRTC] Starting negotiation');
          startNegotiation();
        } catch (err) {
          console.error('[WebRTC] Negotiation error:', err);
          failureReason = `Negotiation error: ${err}`;
          isNegotiating = false;
        }
      };
      
      // Track ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        if (DEBUG) console.log('[WebRTC] ICE Connection state changed to:', pc.iceConnectionState);
        
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          // We have a connection! Clear any previous failures and reset retry counter
          failureReason = '';
          connectionRetryCount = 0;
          
          // Start monitoring the connection
          startConnectionMonitoring();
          // Start collecting stats for debugging
          startStatsCollection();
          
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          updateGlobalState(pc.iceConnectionState);
          
          if (DEBUG) console.log('[WebRTC] ICE Connection terminated:', pc.iceConnectionState);
          
          // If we have a partner ID and socket, notify them of connection state change
          if (globalPartnerId.value && socket.value) {
            socket.value.emit('webrtc-connection-state', { 
              to: globalPartnerId.value, 
              state: pc.iceConnectionState,
              reason: 'ice-connection-state-change'
            });
          }
          
          // If the connection has failed or closed, update global state after a short delay
          // This gives time for any recovery mechanisms to kick in
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            setTimeout(() => {
              // Only update if we're still in bad state
              if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                updateGlobalState('failed');
              }
            }, 2000);
          }
        }
      };

      // ICE candidate events
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (DEBUG) console.log('[WebRTC] New ICE candidate:', event.candidate);
          
          // Store local candidates for diagnostics
          if (!(window as any).__localIceCandidates) {
            (window as any).__localIceCandidates = [];
          }
          (window as any).__localIceCandidates.push(event.candidate);
          
          if (partnerId.value) {
            // Send the ICE candidate to the peer
            socket.value?.emit('webrtc-signal', {
              type: 'ice-candidate',
              candidate: event.candidate,
              to: partnerId.value
            });
          } else {
            // No partner ID yet, store the candidate for later
            pendingCandidates.push(event.candidate);
            if (DEBUG) console.log('[WebRTC] Storing ICE candidate for later. Total pending:', pendingCandidates.length);
          }
        } else {
          // ICE gathering is complete
          if (DEBUG) console.log('[WebRTC] ICE gathering complete');
          
          // If we have pending candidates and a partner ID, send them now
          if (pendingCandidates.length > 0 && partnerId.value) {
            pendingCandidates.forEach(candidate => {
              socket.value?.emit('webrtc-signal', {
                type: 'ice-candidate',
                candidate,
                to: partnerId.value
              });
            });
            if (DEBUG) console.log(`[WebRTC] Sent ${pendingCandidates.length} pending ICE candidates`);
            pendingCandidates = [];
          }
        }
      };

      // ICE gathering state change
      pc.onicegatheringstatechange = () => {
        if (DEBUG) console.log('[WebRTC] ICE gathering state changed to:', pc.iceGatheringState);
      };
      
      // Connection state change (modern browsers only)
      pc.onconnectionstatechange = () => {
        if (DEBUG) console.log('[WebRTC] Connection state changed to:', pc.connectionState);
        
        updateGlobalState(pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          // Clear any previous failure reasons
          failureReason = '';
          connectionRetryCount = 0;
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          if (pc.connectionState === 'failed' && !failureReason) {
            failureReason = 'PeerConnection failed';
          }
        }
      };
      
      // Signaling state change
      pc.onsignalingstatechange = () => {
        if (DEBUG) console.log('[WebRTC] Signaling state changed to:', pc.signalingState);
        
        if (pc.signalingState === 'stable') {
          isNegotiating = false;
        }
      };
      
      // Track events - add incoming tracks to the remote stream
      pc.ontrack = (event) => {
        if (DEBUG) console.log('[WebRTC] Track received:', event.track);
        
        // Create remote stream if needed
        if (!globalRemoteStream) {
          globalRemoteStream = new MediaStream();
          remoteStream.value = globalRemoteStream;
          console.log('[WebRTC] Created new remote stream');
        }
        
        // Add the track to the stream
        globalRemoteStream.addTrack(event.track);
        console.log(`[WebRTC] Added ${event.track.kind} track to remote stream, now has ${globalRemoteStream.getTracks().length} tracks`);
        
        // Verify tracks were added properly
        setTimeout(() => {
          if (globalRemoteStream) {
            const tracks = globalRemoteStream.getTracks();
            console.log(`[WebRTC] Remote stream has ${tracks.length} tracks after adding`);
            tracks.forEach(track => {
              console.log(`[WebRTC] Track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
              if (track.kind === 'audio' && (!track.enabled || track.muted)) {
                console.log('[WebRTC] 🔴 Found disabled or muted audio track, enabling it');
                track.enabled = true;
              }
            });
          }
        }, 500);
        
        // Log track stats
        if (DEBUG) {
          event.track.onunmute = () => {
            console.log('[WebRTC] Track unmuted:', event.track.kind);
          };
          
          event.track.onmute = () => {
            console.log('[WebRTC] Track muted:', event.track.kind);
            // Auto unmute if track gets muted for some reason
            event.track.enabled = true;
          };
          
          event.track.onended = () => {
            console.log('[WebRTC] Track ended:', event.track.kind);
          };
        }
      };
      
      // Set up connection timeout handling
      setupConnectionTimeout(pc);
      
      // Store the connection globally
    globalPeerConnection = pc;
    
    return pc;
    } catch (error) {
      console.error('[WebRTC] Error creating peer connection:', error);
      lastConnectionError = `Creation error: ${error}`;
      failureReason = 'Failed to create connection';
      updateGlobalState('failed');
      throw error;
    }
  };
  
  /**
   * Establish WebRTC connection with consistent error handling
   */
  const establishConnection = async (targetPartnerId: string | null): Promise<any> => {
    if (!targetPartnerId || !socket.value) {
      const errorMsg = 'لا يمكن إنشاء الاتصال: معرّف الشريك أو الاتصال غير متوفر';
      console.error(`[WebRTC] ${errorMsg}`);
      lastConnectionError = errorMsg;
      return { error: errorMsg };
    }

    // Save partner ID globally
    globalPartnerId.value = targetPartnerId;
    partnerId.value = targetPartnerId;
    
    try {
      // Ensure we have local stream
      if (!globalLocalStream) {
        await initializeLocalStream();
      }

      // Create fresh connection
      const pc = createPeerConnection();
      
      // Add local tracks
      if (globalLocalStream) {
        globalLocalStream.getTracks().forEach(track => {
          pc.addTrack(track, globalLocalStream!);
        });
      } else {
        throw new Error('لا يمكن الوصول للميكروفون');
      }
      
      // Update connection state
      updateGlobalState('connecting');
      
      return pc;
    } catch (error) {
      console.error('[WebRTC] Error establishing connection:', error);
      lastConnectionError = `خطأ في إنشاء الاتصال: ${error}`;
      return { error: lastConnectionError };
    }
  };
  
  /**
   * Create an offer and send it to the target peer
   */
  const createOffer = async (targetPartnerId: string | null): Promise<any> => {
    // Clear any existing connection timeout
    if ((window as any).__webrtcConnectionTimeout) {
      clearTimeout((window as any).__webrtcConnectionTimeout);
    }
    
    // Check if negotiation is already in progress
    if (isNegotiating) {
      console.warn('[WebRTC] مفاوضة جارية بالفعل، تأجيل العرض الجديد');
      
      // Try again after a short delay
      return new Promise(resolve => {
        setTimeout(async () => {
          if (!isNegotiating) {
            resolve(await createOffer(targetPartnerId));
          } else {
            resolve({ waiting: 'Negotiation in progress' });
          }
        }, 1000);
      });
    }
    
    // Mark that we are negotiating
    isNegotiating = true;
    
    try {
      // Establish connection
      const pc = await establishConnection(targetPartnerId);
      if (pc.error) return pc;
      
      // Create offer
      if (DEBUG) console.log('[WebRTC] Creating offer');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      // Set local description
      if (DEBUG) console.log('[WebRTC] Setting local description');
      await pc.setLocalDescription(offer);
      
      // Send offer using both methods for compatibility
      if (socket.value && targetPartnerId) {
        socket.value.emit('voice-offer', {
          offer: pc.localDescription,
          to: targetPartnerId
        });
        
        socket.value.emit('webrtc-signal', {
          type: 'offer',
          offer: pc.localDescription,
          to: targetPartnerId
        });
      }
      
      // Setup monitoring
      setupConnectionTimeout(pc);
      startConnectionMonitoring();
      
      if (DEBUG) console.log('[WebRTC] Offer creation complete');
      return { success: true };
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
      lastConnectionError = `Error creating offer: ${error}`;
      isNegotiating = false;
      return { error: `Failed to create offer: ${error}` };
    } finally {
      // Mark that we are done negotiating after a delay
      setTimeout(() => {
        isNegotiating = false;
      }, 2000);
    }
  };
  
  // Helper function to wait for ICE gathering to complete
  const waitForIceGatheringComplete = (pc: RTCPeerConnection): Promise<void> => {
    console.log('Waiting for ICE gathering to complete...');
    
    // إذا كانت عملية جمع ICE كاملة بالفعل، نعود مباشرة
    if (pc.iceGatheringState === 'complete') {
      console.log('ICE gathering already complete');
      return Promise.resolve();
    }
    
    // زيادة وقت الانتظار من 1000ms إلى 6000ms وإضافة عد تنازلي للمحاولات
    const maxWaitTime = 6000; // 6 seconds instead of 1s
    const checkInterval = 500;
    const maxAttempts = Math.ceil(maxWaitTime / checkInterval);
    let attempts = 0;
    
    let iceCandidatesCount = 0;
    
    return new Promise<void>((resolve) => {
      const checkState = () => {
        attempts++;
        
        if (pc.iceGatheringState === 'complete') {
          console.log(`ICE gathering complete after ${attempts} attempts`);
          resolve();
          return;
        }
        
        // عدد المرشحات المجمعة لتتبع التقدم
        if (window.__localIceCandidates && window.__localIceCandidates.length > iceCandidatesCount) {
          iceCandidatesCount = window.__localIceCandidates.length;
          console.log(`ICE candidates collected so far: ${iceCandidatesCount}`);
        }
        
        // حل الوعد إذا تم تجميع عدد كافٍ من المرشحات حتى لو لم تكتمل العملية رسميًا
        if (iceCandidatesCount >= 3 && attempts > maxAttempts / 2) {
          console.log(`Sufficient ICE candidates (${iceCandidatesCount}) collected after ${attempts} attempts`);
        resolve();
          return;
        }
        
        // حل الوعد إذا تم الوصول إلى الحد الأقصى من المحاولات
        if (attempts >= maxAttempts) {
          console.log(`Reached maximum attempts (${maxAttempts}), proceeding with ${iceCandidatesCount} ICE candidates`);
          resolve();
          return;
        }
        
        setTimeout(checkState, checkInterval);
      };
      
      // استخدام حدث لتتبع جمع ICE
      pc.addEventListener('icegatheringstatechange', () => {
        console.log('ICE gathering state changed:', pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          resolve();
        }
      });
      
      // بدء فحص الحالة
      setTimeout(checkState, 0);
    });
  };
  
  /**
   * Handle an incoming WebRTC offer
   */
  const handleOffer = async (offer: RTCSessionDescriptionInit, targetPartnerId: string): Promise<void> => {
    if (!socket.value) {
      console.error('[WebRTC] Cannot handle offer: socket not available');
      return;
    }
    
    if (DEBUG) {
      console.log('[WebRTC] Received offer from:', targetPartnerId);
      console.log('[WebRTC] Offer SDP:', offer.sdp);
    }
    
    // Store the partner ID
    globalPartnerId.value = targetPartnerId;
    partnerId.value = targetPartnerId;
    
    try {
      // Make sure we have access to the microphone
      if (!globalLocalStream) {
        if (DEBUG) console.log('[WebRTC] Initializing local stream before handling offer');
        await initializeLocalStream();
      }
      
      // إعادة تكوين أو إعادة استخدام اتصال WebRTC
      const pc = createPeerConnection();
      
      // إضافة المسارات المحلية إذا لم تكن موجودة
      if (globalLocalStream) {
        const senders = pc.getSenders();
        if (senders.length === 0) {
          if (DEBUG) console.log('[WebRTC] Adding local tracks to connection');
          globalLocalStream.getTracks().forEach(track => {
            pc.addTrack(track, globalLocalStream!);
          });
        } else {
          if (DEBUG) console.log('[WebRTC] Senders already exist, not adding tracks again');
        }
      }
      
      // تحديث حالة الاتصال
      globalConnectionState.value = 'connecting';
      connectionState.value = 'connecting';
      
      // تعيين الوصف البعيد (العرض الوارد)
      if (DEBUG) console.log('[WebRTC] Setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // إضافة أي مرشحي ICE معلقين
      if (pendingCandidates.length > 0) {
        if (DEBUG) console.log(`[WebRTC] Adding ${pendingCandidates.length} pending ICE candidates`);
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (error) {
            console.error('[WebRTC] Error adding pending ICE candidate:', error);
          }

        }
        pendingCandidates = [];
      }
      
      // إنشاء إجابة
      if (DEBUG) console.log('[WebRTC] Creating answer');
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true
      });
      
      if (DEBUG) console.log('[WebRTC] Answer SDP:', answer.sdp);
      
      // تعيين الوصف المحلي (الإجابة)
      if (DEBUG) console.log('[WebRTC] Setting local description (answer)');
      await pc.setLocalDescription(answer);
      
      // تأكد من أن المستقبلين مكوّنون لاستقبال الصوت
      pc.getTransceivers().forEach(transceiver => {
        if (transceiver.receiver.track.kind === 'audio') {
          console.log('[WebRTC] Ensuring audio transceiver is set to receive');
          if (transceiver.direction !== 'sendrecv' && transceiver.direction !== 'recvonly') {
            try {
              transceiver.direction = 'sendrecv';
            } catch (error) {
              console.error('[WebRTC] Could not update transceiver direction:', error);
            }
          }
        }
      });
      
      // انتظار جمع مرشحي ICE
      await waitForIceGatheringComplete(pc);
      
      // إرسال الإجابة إلى الشريك
      if (DEBUG) console.log('[WebRTC] Sending answer to:', targetPartnerId);
      socket.value.emit('voice-answer', {
        answer: pc.localDescription,
        to: targetPartnerId
      });
      
      // إرسال بالتنسيق البديل أيضا
      socket.value.emit('webrtc-signal', {
        type: 'answer',
        answer: pc.localDescription,
        to: targetPartnerId
      });
      
      // تعيين مؤقت للاتصال
      setupConnectionTimeout(pc);
      
      // بدء مراقبة الاتصال
      startConnectionMonitoring();
      
      if (DEBUG) console.log('[WebRTC] Offer handling and answer creation complete');
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
      lastConnectionError = `Error handling offer: ${error}`;
      
      // إعادة المحاولة بعد فترة في حالة الفشل
      setTimeout(() => {
        if (socket.value && partnerId.value) {
          console.log('[WebRTC] Re-negotiating after offer error');
          createOffer(partnerId.value);
        }
      }, 2000);
    }
  };
  
  /**
   * Handle an incoming answer
   */
  const handleAnswer = async (answer: RTCSessionDescriptionInit): Promise<void> => {
    try {
      if (!globalPeerConnection) {
        if (DEBUG) console.log('[WebRTC] Cannot handle answer: no peer connection available');
        return;
      }

      // توثيق حالة الإشارة الحالية
      const currentState = globalPeerConnection.signalingState;
      if (DEBUG) console.log(`[WebRTC] Current signaling state before handling answer: ${currentState}`);

      // التحقق من حالة الإشارة قبل تعيين الوصف البعيد
      if (currentState === 'have-local-offer') {
        if (DEBUG) console.log('[WebRTC] Setting remote description from answer');
        try {
          await globalPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          if (DEBUG) console.log('[WebRTC] Remote description set successfully, signaling state now: ' + globalPeerConnection.signalingState);
        } catch (error: any) {
          console.error('[WebRTC] Error setting remote description:', error);
          
          // إذا كان الخطأ متعلقًا بحالة غير صالحة، محاولة إصلاح الحالة
          if (error.toString().includes('InvalidStateError')) {
            console.warn('[WebRTC] Invalid state error, attempting to recover');
            
            // انتظار لحظة قبل المحاولة مرة أخرى
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // التحقق من الحالة مرة أخرى
            if (globalPeerConnection.signalingState === 'have-local-offer') {
              try {
                if (DEBUG) console.log('[WebRTC] Retrying set remote description after delay');
                await globalPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                if (DEBUG) console.log('[WebRTC] Remote description set successfully on retry');
              } catch (retryError) {
                console.error('[WebRTC] Final error setting remote description:', retryError);
                // لا نرمي الخطأ هنا لتجنب إنهاء العملية
              }
            } else {
              console.warn(`[WebRTC] Cannot set remote answer, wrong state: ${globalPeerConnection.signalingState}`);
            }
          }
        }
      } else {
        console.warn(`[WebRTC] Cannot set remote description: wrong signaling state: ${currentState}`);
        
        // إذا كنا في حالة مستقرة، قد نكون عالجنا هذه الإجابة بالفعل أو فاتنا العرض
        if (currentState === 'stable') {
          if (DEBUG) console.log('[WebRTC] Already in stable state, ignoring answer');
        } else if (currentState === 'have-remote-offer') {
          console.warn('[WebRTC] We have a remote offer but received an answer - signaling confusion');
          // يمكن إعادة تعيين الاتصال لتصحيح تسلسل الإشارات
          if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
            connectionRetryCount++;
            if (DEBUG) console.log(`[WebRTC] Resetting connection due to signaling confusion (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
            closeConnection();
            
            // إعادة إنشاء اتصال جديد بعد فترة قصيرة
            setTimeout(() => {
              if (partnerId.value) {
                createOffer(partnerId.value);
              }
            }, 2000);
          }
        }
      }
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error);
      lastConnectionError = `Error handling answer: ${error}`;
      
      // محاولة إصلاح الاتصال بدلاً من إغلاقه
      if (DEBUG) console.log('[WebRTC] Attempting to recover from answer error');
      if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
        await attemptConnectionRecovery();
      }
    }
  };
  
  /**
   * Toggle microphone mute state
   */
  const toggleMicrophone = async (): Promise<boolean> => {
    // عكس حالة كتم الصوت الحالية
    const shouldMute = !globalIsAudioMuted.value;
    
    // حفظ حالة كتم الصوت في التخزين المحلي
    const { saveMicrophoneState } = useMicrophoneState();
    saveMicrophoneState(shouldMute);
    
    // حالة كتم الصوت
    if (shouldMute) {
      if (DEBUG) console.log('[WebRTC] Muting microphone - stopping all tracks');
      
      // إيقاف مسارات الصوت إذا كانت موجودة
      if (globalLocalStream) {
        globalLocalStream.getAudioTracks().forEach(track => {
          track.enabled = false; // بدلاً من إيقاف المسار تماماً، نقوم بتعطيله فقط
          // track.stop(); - لا نوقف المسار تماماً
        });
        
        // لا نصفر المتغيرات العامة لنسمح باستعادة الميكروفون بسهولة
        // globalLocalStream = null;
        // localStream.value = null;
      }
      
      // تحديث حالة كتم الصوت
      globalIsAudioMuted.value = true;
      
      // إرسال حدث لتحديث واجهة المستخدم
      window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: true } }));
      
      return true; // عملية كتم الصوت نجحت
    } 
    // حالة إلغاء كتم الصوت
    else {
      if (DEBUG) console.log('[WebRTC] Unmuting microphone');
      
      try {
        // إذا كان لدينا تدفق صوتي بالفعل، نعيد تفعيله
        if (globalLocalStream && globalLocalStream.getAudioTracks().length > 0) {
          globalLocalStream.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          
          globalIsAudioMuted.value = false;
          
          // إرسال حدث لتحديث واجهة المستخدم
          window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: false } }));
          
          return true;
        }
        
        // إذا لم يكن لدينا تدفق صوتي، نطلب إذن جديد
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        
        // التأكد من وجود مسارات صوتية
        if (stream.getAudioTracks().length === 0) {
          throw new Error('No audio tracks available');
        }
        
        // تخزين التدفق الجديد
        globalLocalStream = stream;
        localStream.value = stream;
        
        // إضافة المسار الجديد للاتصال إذا كان موجودًا
        if (globalPeerConnection && stream) {
          try {
            const senders = globalPeerConnection.getSenders();
            const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio');
            
            if (audioSender) {
              const audioTrack = stream.getAudioTracks()[0];
              if (audioTrack) {
                audioSender.replaceTrack(audioTrack);
              }
            } else if (stream.getAudioTracks().length > 0) {
              stream.getAudioTracks().forEach(track => {
                if (globalPeerConnection) {
                  globalPeerConnection.addTrack(track, stream);
                }
              });
            }
          } catch (trackError) {
            console.error('[WebRTC] Error adding audio tracks:', trackError);
            // الاستمرار حتى مع حدوث خطأ في إضافة المسارات
          }
        }
        
        // تحديث حالة كتم الصوت - مهم!
        globalIsAudioMuted.value = false;
        
        // إرسال حدث لتحديث واجهة المستخدم
        window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: false } }));
        
        return true; // الميكروفون الآن غير مكتوم
      } catch (error) {
        console.error('[WebRTC] Error unmuting microphone:', error);
        
        // في حالة فشل إلغاء كتم الصوت، حاول مرة أخرى بخيارات أبسط
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          globalLocalStream = fallbackStream;
          localStream.value = fallbackStream;
          globalIsAudioMuted.value = false;
          
          // إرسال حدث لتحديث واجهة المستخدم
          window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: false } }));
          
          return true;
        } catch (fallbackError) {
          console.error('[WebRTC] Fallback microphone access also failed:', fallbackError);
          return false;
        }
      }
    }
  };
  
  /**
   * Close and cleanup the peer connection
   */
  const closeConnection = (): void => {
    if (DEBUG) console.log('[WebRTC] Closing connection');
    
    // Stop all activity
    stopConnectionHeartbeat();
    stopConnectionMonitoring();
    
      if (globalPeerConnection) {
        try {
        // Remove all event listeners
        globalPeerConnection.ontrack = null;
        globalPeerConnection.onicecandidate = null;
        globalPeerConnection.oniceconnectionstatechange = null;
        globalPeerConnection.onicegatheringstatechange = null;
        globalPeerConnection.onsignalingstatechange = null;
        globalPeerConnection.onconnectionstatechange = null;
        
        // Stop all transceivers if supported
        try {
          if (globalPeerConnection.getTransceivers) {
            globalPeerConnection.getTransceivers().forEach(transceiver => {
              if (transceiver.stop) {
                transceiver.stop();
              }
            });
          }
        } catch (e) {
          // Ignore errors
        }
        
        // Close the connection
          globalPeerConnection.close();
        if (DEBUG) console.log('[WebRTC] Peer connection closed');
      } catch (error) {
        console.error('[WebRTC] Error closing peer connection:', error);
      }
      
      // Reset the global reference
          globalPeerConnection = null;
    }
    
    // Clear any remote tracks
          if (globalRemoteStream) {
            globalRemoteStream.getTracks().forEach(track => {
              track.stop();
            });
      globalRemoteStream = new MediaStream();
      remoteStream.value = globalRemoteStream;
    }
    
    // Reset state
    globalConnectionState.value = 'closed';
    connectionState.value = 'closed';
    
    // Dispatch connection-closed custom event to notify all components
    window.dispatchEvent(new CustomEvent('connection-closed', { 
      detail: { timestamp: Date.now() } 
    }));
  };
  
  /**
   * Close and cleanup all media streams
   */
  const cleanup = (): void => {
    closeConnection();
    cleanupReconnectionTimer();
    
    if (globalLocalStream) {
      globalLocalStream.getTracks().forEach(track => {
        track.stop();
      });
      globalLocalStream = null;
      localStream.value = null;
    }
    
    if (globalRemoteStream) {
      globalRemoteStream.getTracks().forEach(track => {
        track.stop();
      });
      globalRemoteStream = new MediaStream();
      remoteStream.value = globalRemoteStream;
    }
    
    // Reset all state
    globalPeerConnection = null;
    peerConnection.value = null;
    globalConnectionState.value = 'closed';
    connectionState.value = 'closed';
    reconnectionAttempts = 0;
  };
  
  /**
   * إعداد معالجي أحداث الويب سوكت
   */
  function setupSocketListeners() {
    if (!socket.value) {
      if (DEBUG) console.log('[WebRTC] No socket available, cannot set up listeners');
        return;
      }
      
    if (DEBUG) console.log('[WebRTC] Setting up socket listeners');
    
    // إزالة المستمعين السابقين لمنع التكرار
    socket.value.off('webrtc-signal');
    socket.value.off('ice-candidate');
    socket.value.off('partner-disconnected');
    socket.value.off('webrtc-connection-failed');
    socket.value.off('connection-timeout');
    socket.value.off('webrtc-connection-state');
    
    // إزالة المستمعين القديمين للأحداث التي لم تعد مستخدمة
    socket.value.off('voice-offer');
    socket.value.off('voice-answer');
    
    // التعامل مع إشارة WebRTC (offer, answer)
    socket.value.on('webrtc-signal', async (data: { type: string, offer?: RTCSessionDescriptionInit, answer?: RTCSessionDescriptionInit, from: string }) => {
      if (DEBUG) console.log(`[WebRTC] Received ${data.type} signal from ${data.from}`);
      
      // حفظ معرف الشريك
      globalPartnerId.value = data.from;
      partnerId.value = data.from;
      
      // معالجة العرض
      if (data.type === 'offer' && data.offer) {
        try {
          await handleOffer(data.offer, data.from);
        } catch (error) {
          console.error('[WebRTC] Error handling offer:', error);
          lastConnectionError = `Error handling offer: ${error}`;
          
          // إعلام الخادم بفشل الاتصال
          if (socket.value) {
            socket.value.emit('webrtc-connection-failed', {
              to: data.from,
              reason: `Failed to handle offer: ${error}`
            });
          }
        }
      }
      // معالجة الإجابة
      else if (data.type === 'answer' && data.answer) {
        try {
          await handleAnswer(data.answer);
        } catch (error) {
          console.error('[WebRTC] Error handling answer:', error);
          lastConnectionError = `Error handling answer: ${error}`;
          
          // إعلام الخادم بفشل الاتصال
          if (socket.value) {
            socket.value.emit('webrtc-connection-failed', {
              to: data.from,
              reason: `Failed to handle answer: ${error}`
            });
          }
        }
      }
    });
    
    // استقبال إشارة مرشحات ICE
    socket.value.on('ice-candidate', async (data: { candidate: RTCIceCandidate, from: string }) => {
      if (DEBUG) console.log(`[WebRTC] Received ICE candidate from ${data.from}`);
      
      if (data.from !== partnerId.value) {
        if (DEBUG) console.log('[WebRTC] Ignoring ICE candidate from different partner');
          return;
        }
      
      try {
        await handleIceCandidate(data.candidate);
      } catch (error) {
        console.error('[WebRTC] Error handling ICE candidate:', error);
        lastConnectionError = `Error handling ICE candidate: ${error}`;
      }
    });
    
    // استقبال إشعار بفشل اتصال WebRTC
    socket.value.on('webrtc-connection-failed', (data: { from: string, reason: string }) => {
      if (DEBUG) console.log(`[WebRTC] Connection failed notification from ${data.from}: ${data.reason}`);
      
      // تحديث حالة الاتصال ومحاولة إعادة الاتصال
      if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
        connectionRetryCount++;
        console.log(`[WebRTC] Partner reported connection failure. Retry ${connectionRetryCount}/${MAX_CONNECTION_RETRIES}`);
        
        // إعادة بناء الاتصال
        if (data.from === partnerId.value) {
          setTimeout(() => {
            if (partnerId.value && socket.value) {
              createOffer(data.from);
            }
          }, RECONNECT_DELAY);
        }
      } else {
        globalConnectionState.value = 'failed';
        stopConnectionHeartbeat();
        lastConnectionError = `Partner reported failure: ${data.reason}`;
      }
    });
    
    // استقبال إشعار بانقطاع اتصال الشريك
    socket.value.on('partner-disconnected', (data: any = {}) => {
      if (DEBUG) console.log('[WebRTC] Partner disconnected event:', data);
      
      // إغلاق اتصال WebRTC
      closeConnection();
      
      // إيقاف كافة المراقبات والإعدادات
      stopConnectionHeartbeat();
      stopConnectionMonitoring();
      stopStatsCollection();
      
      // إعادة تعيين المعرفات
      globalPartnerId.value = null;
      partnerId.value = null;
      
      // تحديث الحالة
      globalConnectionState.value = 'closed';
      connectionState.value = 'closed';
      
      if (DEBUG) {
        if (data && data.reason) {
          console.log(`[WebRTC] Disconnection reason: ${data.reason}`);
        }
        console.log('[WebRTC] WebRTC connection fully closed due to partner disconnection');
      }
      
      // إرسال حدث لإعلام واجهة المستخدم بانقطاع الاتصال
      window.dispatchEvent(new CustomEvent('connection-state-changed', { 
        detail: { 
          state: 'disconnected',
          reason: data.reason || 'partner-left' 
        } 
      }));
    });
    
    // Handle WebRTC connection state changes from other party
    socket.value.on('webrtc-connection-state', (data: { state: string, from: string, reason: string }) => {
      if (DEBUG) console.log(`[WebRTC] Received connection state update from partner: ${data.state} (reason: ${data.reason})`);
      
      // If we received a notification that the other party's connection is broken
      if (data.state === 'failed' || data.state === 'closed' || data.state === 'disconnected') {
        // Update our own state
        if (data.state === 'failed' || data.state === 'closed') {
          updateGlobalState('failed');
          
          // إرسال حدث لإعلام واجهة المستخدم بفشل الاتصال
          window.dispatchEvent(new CustomEvent('connection-state-changed', { 
            detail: { 
              state: 'failed',
              reason: data.reason || 'connection-failed' 
            } 
          }));
          
          // Close our local connection if it's still open
          if (globalPeerConnection && globalPeerConnection.connectionState !== 'closed') {
            console.log('[WebRTC] Closing local connection due to remote state:', data.state);
            closeConnection();
          }
        } else {
          // Just log for disconnected state, might recover
          console.log('[WebRTC] Partner connection state is disconnected, waiting to see if it recovers');
          
          // إرسال حدث لإعلام واجهة المستخدم بانقطاع الاتصال المؤقت
          window.dispatchEvent(new CustomEvent('connection-state-changed', { 
            detail: { 
              state: 'disconnected',
              reason: 'network-disconnect',
              temporary: true
            } 
          }));
        }
      }
    });
    
    // Handle disconnect partner event - preserve mute state
    socket.value.on('disconnect-partner', () => {
      console.log('[WebRTC] Disconnect partner event received - preserving mic mute state');
      const currentMuteState = globalIsAudioMuted.value;
      
      // Just log the current state - we don't need to do anything else
      // as the mute state is already stored in localStorage
      if (DEBUG) console.log(`[WebRTC] Current mute state before disconnect: ${currentMuteState ? 'muted' : 'unmuted'}`);
    });
    
    // When matched with new partner, restore mic state
    socket.value.on('matched', async (data: any) => {
      console.log('[WebRTC] Matched event received - ensuring mic state is correct');
      
      // حفظ معرف الشريك الجديد
      if (data && data.partnerId) {
        partnerId.value = data.partnerId;
        globalPartnerId.value = data.partnerId;
      }
      
      // التأكد من أن حالة كتم الصوت مطبقة بشكل صحيح
      if (globalLocalStream && globalLocalStream.getAudioTracks().length > 0) {
        const { getSavedMicrophoneState } = useMicrophoneState();
        const savedMuteState = getSavedMicrophoneState();
        
        if (savedMuteState !== null) {
          if (DEBUG) console.log(`[WebRTC] Applying saved mic state to active stream: ${savedMuteState ? 'muted' : 'unmuted'}`);
          
          // تطبيق حالة كتم الصوت
          globalLocalStream.getAudioTracks().forEach(track => {
            track.enabled = !savedMuteState;
          });
          
          // تحديث المتغير العام
          globalIsAudioMuted.value = savedMuteState;
          
          // إرسال حدث لتحديث واجهة المستخدم
          window.dispatchEvent(new CustomEvent('microphone-state-changed', { detail: { isMuted: savedMuteState } }));
        }
      } else {
        // إذا لم يكن هناك تدفق صوتي، قم بإنشائه وتطبيق حالة كتم الصوت عليه
        try {
          await initializeLocalStream();
          // ملاحظة: initializeLocalStream الآن يطبق حالة كتم الصوت المحفوظة تلقائيًا
        } catch (error) {
          console.error('[WebRTC] Error initializing stream after match:', error);
        }
      }
    });

    // Add enhanced reconnection for socket events
    socket.value?.on('disconnect', () => {
      console.log('[WebRTC] Socket disconnected, cleaning up WebRTC connection');
      cleanupReconnectionTimer();
    });

    socket.value?.on('reconnect', () => {
      console.log('[WebRTC] Socket reconnected, attempting to recover WebRTC connection');
      if (globalPartnerId.value && reconnectionTimer === null) {
        attemptReconnection(globalPartnerId.value);
      }
    });
  }
  
  // Setup the socket listeners when this hook is used
  setupSocketListeners();
  
  // Clean up resources when component is unmounted
  onUnmounted(() => {
    cleanupReconnectionTimer();
  });
  
  /**
   * Start heartbeat to keep connection alive and monitor health
   */
  function startConnectionHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    // Start sending heartbeats
    heartbeatInterval = window.setInterval(() => {
      if (globalPeerConnection && 
          (globalConnectionState.value === 'connected' || 
           globalConnectionState.value === 'connecting')) {
        
        // Create data channel as heartbeat to keep connection alive
        try {
          const channel = globalPeerConnection.createDataChannel(`heartbeat_${Date.now()}`);
          
          // Close channel after a short time
          setTimeout(() => {
            try {
              channel.close();
            } catch (e) {
              // Ignore errors on closing
            }
          }, 1000);
          
          if (DEBUG) console.log('[WebRTC] Heartbeat sent to keep connection alive');
          
          // If connection is stuck in connecting state for too long, send diagnostic report
          if (globalConnectionState.value === 'connecting' && connectionRetryCount > 3) {
            console.log('[WebRTC] Connection stuck in connecting state. Diagnostic report:');
            console.log(getConnectionDiagnosticReport());
          }
        } catch (e) {
          // Ignore errors creating data channel if connection is already closed
        }
        
        // Check tracks and fix any issues using our unified function
        diagnoseAndFixConnection();
      } else {
        stopConnectionHeartbeat();
      }
    }, HEARTBEAT_INTERVAL) as unknown as number;
  }

  function stopConnectionHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  /**
   * التحقق من حالة المسارات وإصلاح المشاكل المحتملة
   */
  function checkAndFixTracks() {
    if (!globalPeerConnection || !globalRemoteStream) {
      if (DEBUG) console.log('[WebRTC] Cannot fix tracks: missing connection or stream');
      return false;
    }
    
    if (DEBUG) console.log('[WebRTC] Checking and fixing tracks');
    
    // التحقق من المرسلين (المسارات المحلية)
    const senders = globalPeerConnection.getSenders();
    if (senders.length === 0 && globalLocalStream) {
      if (DEBUG) console.log('[WebRTC] No senders found, re-adding local tracks');
      
      globalLocalStream.getTracks().forEach((track: MediaStreamTrack) => {
        globalPeerConnection?.addTrack(track, globalLocalStream!);
      });
    } else if (senders.length > 0 && globalLocalStream) {
      if (DEBUG) console.log(`[WebRTC] Found ${senders.length} senders, checking state`);
      
      // التحقق من أن المرسلين يستخدمون المسارات المحلية الحالية
      const localTracks = globalLocalStream.getTracks();
      senders.forEach((sender) => {
        if (sender.track && sender.track.readyState !== 'live') {
          const matchingLocalTrack = localTracks.find(track => track.kind === sender.track?.kind);
          if (matchingLocalTrack) {
            if (DEBUG) console.log(`[WebRTC] Replacing inactive track with active one`);
            sender.replaceTrack(matchingLocalTrack);
          }
        }
      });
    }
    
    // التحقق من المستقبلين (المسارات البعيدة)
    const receivers = globalPeerConnection.getReceivers();
    if (receivers.length > 0) {
      if (DEBUG) console.log(`[WebRTC] Found ${receivers.length} receivers`);
      
      let hasAudioReceiver = false;
      receivers.forEach((receiver) => {
        if (receiver.track && receiver.track.kind === 'audio') {
          hasAudioReceiver = true;
          
          // التأكد من أن المسار موجود في التدفق البعيد
          const trackInStream = globalRemoteStream?.getTracks().some(t => t.id === receiver.track?.id);
          if (!trackInStream && globalRemoteStream) {
            if (DEBUG) console.log('[WebRTC] Adding missing track to remote stream');
            globalRemoteStream.addTrack(receiver.track);
          }
        }
      });
      
      if (!hasAudioReceiver) {
        if (DEBUG) console.log('[WebRTC] No audio receivers found!');
      }
    }
    
    // تحديث معلومات التشخيص
    updateDebugInfo();
    
    // فحص وإصلاح مشاكل الاتصال الصوتي
    diagnoseAndFixAudioIssues();
  }
  
  /**
   * فحص وإصلاح مشاكل الاتصال الصوتي
   * تستخدم هذه الوظيفة للتحقق من مسارات الصوت وإصلاح المشاكل الشائعة
   */
  function diagnoseAndFixAudioIssues() {
    if (!globalPeerConnection) {
      console.warn('[AudioFix] No peer connection available');
      return false;
    }
    
    // تحقق من وجود مسارات محلية
    if (!globalLocalStream || !globalLocalStream.getTracks().length) {
      console.warn('[AudioFix] Local stream missing or has no tracks');
      
      // محاولة إعادة إنشاء مسار الصوت المحلي
      initializeLocalStream()
        .then(stream => {
          // تحديث التدفق العالمي
          globalLocalStream = stream;
          
          // استبدال المسارات في الاتصال الحالي
          if (globalPeerConnection) {
            const senders = globalPeerConnection.getSenders();
            senders.forEach(sender => {
              if (sender.track && sender.track.kind === 'audio' && stream.getAudioTracks().length > 0) {
                sender.replaceTrack(stream.getAudioTracks()[0])
                  .then(() => console.log('[AudioFix] Successfully replaced audio track'))
                  .catch(err => console.error('[AudioFix] Error replacing track:', err));
              }
            });
          }
        })
        .catch(err => console.error('[AudioFix] Failed to reinitialize local stream:', err));
      return true;
    }
    
    // تحقق من حالة المسارات المحلية
    const localAudioTracks = globalLocalStream.getAudioTracks();
    
    if (!localAudioTracks.length) {
      console.warn('[AudioFix] No audio tracks in local stream');
      
      // محاولة طلب الوصول للميكروفون مجددًا
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            // إضافة مسار الصوت للتدفق الحالي
            globalLocalStream?.addTrack(audioTrack);
            
            // إضافة المسار الجديد للاتصال إن وجد
            if (globalPeerConnection) {
              globalPeerConnection.addTrack(audioTrack, globalLocalStream!);
              console.log('[AudioFix] Added new audio track to connection');
            }
          }
        })
        .catch(err => console.error('[AudioFix] Could not get user media:', err));
      return true;
    }
    
    // تحقق من حالة تمكين المسارات المحلية
    let hasFixedLocalTracks = false;
    localAudioTracks.forEach(track => {
      if (!track.enabled && !globalIsAudioMuted.value) {
        console.log('[AudioFix] Fixing disabled local audio track');
          track.enabled = true;
        hasFixedLocalTracks = true;
      }
      
      // تحقق من حالة المسار وإعادة تشغيله إذا كان متوقفًا
      if (track.readyState === 'ended') {
        console.warn('[AudioFix] Local audio track in ended state, requesting new track');
        
        // طلب مسار جديد
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(stream => {
            const newTrack = stream.getAudioTracks()[0];
            if (newTrack) {
              // استبدال المسار القديم بالجديد
              const senders = globalPeerConnection?.getSenders();
              senders?.forEach(sender => {
                if (sender.track && sender.track.kind === 'audio') {
                  sender.replaceTrack(newTrack)
                    .then(() => console.log('[AudioFix] Successfully replaced ended audio track'))
                    .catch(err => console.error('[AudioFix] Error replacing ended track:', err));
                }
              });
            }
          })
          .catch(err => console.error('[AudioFix] Could not get replacement track:', err));
        
        hasFixedLocalTracks = true;
      }
    });
    
    // تحقق من المسارات البعيدة
    if (!globalRemoteStream || !globalRemoteStream.getTracks().length) {
      console.warn('[AudioFix] Remote stream missing or has no tracks');
      
      // تحقق مما إذا كانت هناك مسارات بعيدة لم تتم إضافتها للتدفق
      const receivers = globalPeerConnection.getReceivers();
      const remoteTracks = receivers
        .filter(receiver => receiver.track && receiver.track.kind === 'audio')
        .map(receiver => receiver.track);
      
      if (remoteTracks.length > 0) {
        console.log('[AudioFix] Found remote tracks in receivers, adding to remote stream');
        
        // إنشاء تدفق بعيد جديد إذا لم يكن موجودًا
        if (!globalRemoteStream) {
          globalRemoteStream = new MediaStream();
        }
        
        // إضافة المسارات للتدفق البعيد
        remoteTracks.forEach(track => {
          if (!globalRemoteStream?.getTracks().includes(track)) {
            globalRemoteStream?.addTrack(track);
            console.log('[AudioFix] Added missing remote track to stream');
          }
        });
        
        return true;
      }
      
      // إرسال إشعار للطرف الآخر بمشكلة في الصوت
      if (globalPartnerId.value) {
        socket.value?.emit('audio-troubleshoot-request', {
          to: globalPartnerId.value
        });
        console.log('[AudioFix] Sent audio troubleshoot request to partner');
      }
    }
    
    // تحقق من حالة تدفق الصوت للمسارات البعيدة
    if (globalRemoteStream) {
      const remoteAudioTracks = globalRemoteStream.getAudioTracks();
      
      let hasFixedRemoteTracks = false;
      remoteAudioTracks.forEach(track => {
        if (!track.enabled) {
          console.log('[AudioFix] Fixing disabled remote audio track');
          track.enabled = true;
          hasFixedRemoteTracks = true;
        }
      });
      
      if (hasFixedRemoteTracks) {
        return true;
      }
    }
    
    // فحص إحصائيات الاتصال للمشاكل الأخرى
    globalPeerConnection.getStats()
      .then(stats => {
        let audioLevelDetected = false;
        let packetsReceived = false;
        
        stats.forEach(report => {
          // تحقق من مستويات الصوت
          if (report.type === 'track' && report.kind === 'audio') {
            if (report.audioLevel && report.audioLevel > 0) {
              audioLevelDetected = true;
            }
          }
          
          // تحقق من استلام الحزم
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            if (report.packetsReceived && report.packetsReceived > 0) {
              packetsReceived = true;
            }
          }
        });
        
        if (!packetsReceived) {
          console.warn('[AudioFix] No audio packets being received');
          
          // قد تكون هناك مشكلة في خوادم TURN/STUN
          // محاولة التبديل إلى تكوين TURN فقط
          if (rtcConfiguration.value.iceTransportPolicy !== 'relay') {
            console.log('[AudioFix] Switching to TURN-only configuration');
            rtcConfiguration.value = turnOnlyRtcConfiguration;
            
            // إشعار الطرف الآخر بتغيير التكوين
            if (globalPartnerId.value) {
              socket.value?.emit('ice-config-change', {
                to: globalPartnerId.value,
                config: 'turn-only'
              });
            }
            
            // قد نحتاج لإعادة تأسيس الاتصال
            return true;
          }
        }
      })
      .catch(err => console.error('[AudioFix] Error getting connection stats:', err));
    
    return hasFixedLocalTracks;
  }
  
  // استعادة الاتصال بعد انقطاع
  async function attemptConnectionRecovery() {
    if (!globalPeerConnection || !partnerId.value) {
        return;
      }
    
    if (DEBUG) console.log('[WebRTC] Attempting connection recovery');
    
    try {
      // آلية سريعة لإعادة استخدام حالة المفاوضة وتسريع الاتصال
      isRestartingIce = true;
      
      // تبديل تكوين الخادم لتسريع الاتصال
      if (currentRtcConfig === standardRtcConfiguration) {
        currentRtcConfig = fastRtcConfiguration;
        console.log('[WebRTC] Switching to fast configuration for quicker connection');
      } else if (connectionRetryCount > 5) {
        // إذا فشلت عدة محاولات، استخدم تكوين TURN فقط
        currentRtcConfig = turnOnlyRtcConfiguration;
        console.log('[WebRTC] Switching to TURN-only configuration');
      }
      
      // إعادة تشغيل ICE بشكل مباشر
      if (globalPeerConnection.restartIce) {
        globalPeerConnection.restartIce();
        
        // إنشاء عرض جديد مع تمكين إعادة تشغيل ICE
        const offer = await globalPeerConnection.createOffer({ 
          iceRestart: true,
          offerToReceiveAudio: true
        });
        
        await globalPeerConnection.setLocalDescription(offer);
        
        if (socket.value) {
          // إرسال العرض فوراً دون انتظار
          socket.value.emit('offer', {
            offer: globalPeerConnection.localDescription,
            to: partnerId.value
          });
          
          // أيضا إرسال بالتنسيق الجديد
          socket.value.emit('webrtc-signal', {
            type: 'offer',
            offer: globalPeerConnection.localDescription,
            to: partnerId.value
          });
        }
      }
      
      // إعادة تعيين علم إعادة التشغيل بعد فترة قصيرة
      setTimeout(() => {
        isRestartingIce = false;
      }, 500);
      
    } catch (error) {
      console.error('[WebRTC] Recovery attempt failed:', error);
      isRestartingIce = false;
      
      // في حالة الفشل، إعادة بدء الاتصال من البداية
      if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
        setTimeout(() => {
          closeConnection();
          if (partnerId.value) {
            createOffer(partnerId.value);
          }
        }, 200);
      }
    }
  }
  
  // إتاحة معلومات التشخيص للواجهة عبر كائن عام
  function updateDebugInfo() {
    if (typeof window !== 'undefined') {
      (window as any).__webrtc_debug = {
        connectionState: globalConnectionState.value,
        connectionRetryCount,
        lastConnectionError,
        failureReason,
        isNegotiating,
        isRestartingIce,
        pendingCandidates: pendingCandidates.length,
        hasLocalTracks: globalLocalStream ? globalLocalStream.getAudioTracks().length > 0 : false,
        hasRemoteTracks: globalRemoteStream ? globalRemoteStream.getAudioTracks().length > 0 : false
      };
    }
  }

  // تحديث معلومات التشخيص عند تغيير الحالة
  watch(() => globalConnectionState.value, () => {
    updateDebugInfo();
  });
  
  /**
   * Function to improve connection reliability by monitoring and fixing issues
   */
  function startConnectionMonitoring() {
    if (connectionMonitorInterval) {
      clearInterval(connectionMonitorInterval);
    }
    
    // Track ICE candidates for diagnostics
    if (typeof window !== 'undefined') {
      (window as any).__localIceCandidates = [];
      (window as any).__remoteIceCandidates = [];
      (window as any).__iceCandidatePairs = [];
    }
    
    // Add listener for local ICE candidates
    if (globalPeerConnection) {
      globalPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (DEBUG) console.log('[WebRTC] ICE candidate generated:', event.candidate.candidate);
          
          // Save candidate for diagnostics
          if (typeof window !== 'undefined') {
            (window as any).__localIceCandidates = (window as any).__localIceCandidates || [];
            (window as any).__localIceCandidates.push({
              candidate: event.candidate.candidate,
              timestamp: Date.now()
            });
          }
          
          // Send candidate to peer
          if (socket.value && globalPartnerId.value) {
            socket.value.emit('ice-candidate', {
              candidate: event.candidate,
              to: globalPartnerId.value
            });
          }
        }
      };
    }
    
    connectionMonitorInterval = window.setInterval(() => {
      if (!globalPeerConnection || 
          (globalConnectionState.value !== 'connecting' && 
           globalConnectionState.value !== 'connected')) {
        stopConnectionMonitoring();
        return;
      }
      
      try {
        // Run our combined diagnostics and fix function
        diagnoseAndFixConnection();
        
        // Collect stats for monitoring
        getConnectionStats().then(stats => {
          if (stats && stats.iceCandidatePairs) {
            if (typeof window !== 'undefined') {
              (window as any).__iceCandidatePairs = stats.iceCandidatePairs;
            }
          }
        });
      } catch (error) {
        console.error('[WebRTC] Error monitoring connection:', error);
      }
    }, CONNECTION_MONITOR_INTERVAL) as unknown as number;
  }

  // إيقاف مراقبة الاتصال
  function stopConnectionMonitoring() {
    if (connectionMonitorInterval) {
      clearInterval(connectionMonitorInterval);
      connectionMonitorInterval = null;
    }
  }

  // التحقق من صحة الاتصال بناءً على الإحصائيات
  function checkConnectionHealth(stats: any) {
    if (!stats || stats.error) return;
    
    // فحص مسارات الصوت
    const hasAudioIssues = !stats.media || stats.media.length === 0 || 
                           !stats.media.some((m: any) => m.kind === 'audio' && m.audioLevel > 0);
    
    // فحص أزواج المرشحين
    const hasCandidatePairIssues = !stats.selectedCandidatePair || 
                                  stats.selectedCandidatePair.state !== 'succeeded';
    
    if (hasAudioIssues || hasCandidatePairIssues) {
      if (DEBUG) console.log('[WebRTC] Connection health issues detected, trying to fix...');
      
      // إعادة التحقق من المسارات
      checkAndFixTracks();
      
      // إذا استمرت المشاكل، محاولة إعادة الاتصال
      if (globalConnectionState.value === 'connected' && connectionRetryCount < MAX_CONNECTION_RETRIES) {
        connectionRetryCount++;
        if (DEBUG) console.log(`[WebRTC] Attempting connection improvement (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
        
        // استخدام طريقة أكثر لطفًا لتحسين الاتصال
        if (globalPeerConnection && globalPeerConnection.getTransceivers) {
          globalPeerConnection.getTransceivers().forEach(transceiver => {
            if (transceiver.sender && transceiver.sender.track && transceiver.sender.track.kind === 'audio') {
              transceiver.sender.setParameters({
                ...transceiver.sender.getParameters(),
                degradationPreference: 'maintain-framerate'
              });
            }
          });
        }
      }
    }
  }
  
  // Add a new function to explicitly handle connection timeout
  function setupConnectionTimeout(pc: RTCPeerConnection): void {
    if (!partnerId.value) return;
    
    // Clear any existing connection timeout
    if ((window as any).__webrtcConnectionTimeout) {
      clearTimeout((window as any).__webrtcConnectionTimeout);
    }
    
    // تقليل وقت الانتظار لتسريع عملية التبديل بين التكوينات
    const quickTimeout = 5000; // 5 ثواني فقط لتجربة التكوين الأول
    
    // Set a quick first timeout to try fast configuration quickly
    (window as any).__webrtcConnectionTimeout = setTimeout(() => {
      if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
        if (DEBUG) console.log(`[WebRTC] Connection not established after ${quickTimeout/1000} seconds, trying fast config`);
        
        // التبديل مباشرة إلى التكوين السريع لتسريع الاتصال
        currentRtcConfig = fastRtcConfiguration;
        
        if (partnerId.value && !isNegotiating) {
          // محاولة سريعة باستخدام الإعداد الجديد
          createOffer(partnerId.value);
        }
        
        // Set a second timeout for TURN-only config
        (window as any).__webrtcConnectionTimeout = setTimeout(() => {
          if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
            if (DEBUG) console.log(`[WebRTC] Connection still not established, trying TURN-only config`);
        
        // جمع معلومات تشخيصية إضافية
        const candidateInfo = {
          localCandidates: (window as any).__localIceCandidates?.length || 0,
          remoteCandidates: (window as any).__remoteIceCandidates?.length || 0,
          iceCandidatePairsCount: (window as any).__iceCandidatePairs?.length || 0
        };
        
        console.log('[WebRTC] Connection diagnostic info:', JSON.stringify(candidateInfo));
            
            // تغيير التكوين إلى خوادم TURN فقط للاتصال في الحالات الصعبة
            currentRtcConfig = turnOnlyRtcConfiguration;
            
            // إغلاق الاتصال الحالي وبدء اتصال جديد بالتكوين الجديد
          closeConnection();
          
            if (partnerId.value) {
              setTimeout(() => {
              createOffer(partnerId.value);
              }, 200);
            }
        }
        }, 5000); // 5 ثواني إضافية للتكوين TURN
      }
    }, quickTimeout);
  }
  
  /**
   * @returns Diagnostic report with connection info
   */
  function getConnectionDiagnosticReport(): string {
    const peerConn = globalPeerConnection;
    const report = [];
    
    report.push(`حالة الاتصال: ${peerConn?.connectionState || 'غير متصل'}`);
    report.push(`حالة الإشارة: ${peerConn?.signalingState || 'غير متصل'}`);
    report.push(`حالة اتصال ICE: ${peerConn?.iceConnectionState || 'غير متصل'}`);
    report.push(`حالة تجميع ICE: ${peerConn?.iceGatheringState || 'غير متصل'}`);
    report.push(`محاولات إعادة الاتصال: ${connectionRetryCount}/${MAX_CONNECTION_RETRIES}`);
    report.push(`آخر خطأ: ${lastConnectionError || failureReason || 'لا يوجد'}`);
    report.push(`مسارات الصوت المحلية: ${globalLocalStream?.getAudioTracks().length || 0}`);
    report.push(`مسارات الصوت البعيدة: ${globalRemoteStream?.getAudioTracks().length || 0}`);
    report.push(`مرشحات ICE المحلية: ${(window as any).__localIceCandidates?.length || 0}`);
    report.push(`مرشحات ICE البعيدة: ${(window as any).__remoteIceCandidates?.length || 0}`);
    report.push(`جاري التفاوض: ${isNegotiating}`);
    report.push(`جاري إعادة تشغيل ICE: ${isRestartingIce}`);
    
    return report.join('\n');
  }
  
  /**
   * Handle an ICE candidate received from the peer
   */
  const handleIceCandidate = async (candidate: RTCIceCandidate): Promise<void> => {
    try {
      if (!globalPeerConnection) {
        console.warn('[WebRTC] Received ICE candidate but no peer connection exists');
        // نحفظ المرشح لوقت لاحق - مفيد عندما تصل المرشحات ICE قبل إنشاء الاتصال
        pendingCandidates.push(candidate);
        return;
      }
      
      // احتفظ بالمرشح لأغراض التشخيص
      if (!(window as any).__remoteIceCandidates) {
        (window as any).__remoteIceCandidates = [];
      }
      (window as any).__remoteIceCandidates.push(candidate);
      
      // تسجيل معلومات إضافية حول المرشح لتسهيل استكشاف الأخطاء وإصلاحها
      if (DEBUG) {
        console.log(`[WebRTC] Processing ICE candidate: type=${candidate.type}, protocol=${candidate.protocol}, address=${candidate.address || 'hidden'}, port=${candidate.port || 'unknown'}`);
      }
      
      // استخدم وعود للتعامل مع إضافة المرشح
      await globalPeerConnection.addIceCandidate(candidate);
      
      // تتبع أزواج المرشحين المتطابقة للتشخيص عند اكتمال الاتصال
      if (globalPeerConnection.connectionState === 'connected') {
        try {
          const stats = await globalPeerConnection.getStats();
          const candidatePairs: any[] = [];
          
          stats.forEach(report => {
            if (report.type === 'candidate-pair') {
              candidatePairs.push({
                id: report.id,
                state: report.state,
                nominated: report.nominated,
                selected: report.selected
              });
            }
          });
          
          // حفظ المعلومات عن أزواج المرشحين للتشخيص
          (window as any).__iceCandidatePairs = candidatePairs;
          
          if (DEBUG) {
            console.log('[WebRTC] Updated candidate pairs:', candidatePairs);
          }
        } catch (error) {
          console.error('[WebRTC] Error collecting candidate pair stats:', error);
        }
      }
      
      if (DEBUG) {
        console.log('[WebRTC] Successfully added ICE candidate');
      }
    } catch (error) {
      // لا نريد فشل الاتصال بسبب عدم القدرة على إضافة مرشح واحد
      console.error('[WebRTC] Error adding received ICE candidate:', error);
      // لكن نوثق الخطأ للتشخيص
      failureReason = `Error adding ICE candidate: ${error}`;
    }
  };
  
  /**
   * بدء تفاوض جديد على الاتصال WebRTC
   */
  function startNegotiation(): void {
    if (!globalPeerConnection || !partnerId.value || isNegotiating) {
      if (DEBUG) console.log('[WebRTC] Cannot start negotiation: missing connection, partner ID, or already negotiating');
      return;
    }
    
    if (DEBUG) console.log('[WebRTC] Starting new negotiation');
    isNegotiating = true;
    
    try {
      // بدء تفاوض جديد بإنشاء عرض
      globalPeerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      })
      .then(offer => {
        if (!globalPeerConnection) return;
        return globalPeerConnection.setLocalDescription(offer);
      })
      .then(() => {
        if (!globalPeerConnection || !socket.value || !partnerId.value) return;
        
        // إرسال العرض الجديد
        socket.value.emit('voice-offer', {
          offer: globalPeerConnection.localDescription,
          to: partnerId.value
        });
        
        if (DEBUG) console.log('[WebRTC] Sent renegotiation offer');
      })
      .catch(error => {
        console.error('[WebRTC] Error during negotiation:', error);
      })
      .finally(() => {
        // إعادة تعيين العلم بعد فترة
        setTimeout(() => {
          isNegotiating = false;
        }, 2000);
      });
    } catch (error) {
      console.error('[WebRTC] Failed to start negotiation:', error);
      isNegotiating = false;
    }
  }
  
  // إضافة وظيفة لمعلومات التشخيص
  const diagnosticReport = {
    connectionState: globalConnectionState.value,
    iceCandidatesGenerated: pendingCandidates.length,
    localStreamActive: !!globalLocalStream && globalLocalStream.active,
    remoteStreamActive: !!globalRemoteStream && globalRemoteStream.active,
    localTracks: globalLocalStream ? globalLocalStream.getAudioTracks().length : 0,
    remoteTracks: globalRemoteStream ? globalRemoteStream.getAudioTracks().length : 0,
    connectionRetries: connectionRetryCount,
    lastError: lastConnectionError || failureReason || '',
    isAudioMuted: globalIsAudioMuted.value,
    forceReconnect: () => {
      if (globalPeerConnection && globalConnectionState.value !== 'new') {
        attemptConnectionRecovery();
        return true;
      }
      return false;
    }
  };
  
  /**
   * Enhanced function to restore microphone state properly
   */
  const restoreMicrophoneState = async (): Promise<void> => {
    if (!globalLocalStream) {
      if (DEBUG) console.log('[WebRTC] No local stream to restore microphone state on');
      return;
    }

    const { getSavedMicrophoneState } = useMicrophoneState();
    const savedMuteState = getSavedMicrophoneState();
    
    if (savedMuteState === null) {
      if (DEBUG) console.log('[WebRTC] No saved microphone state found');
      return;
    }
    
    if (DEBUG) console.log(`[WebRTC] Restoring saved microphone state: ${savedMuteState ? 'muted' : 'unmuted'}`);
    
    // Directly apply mute state to all audio tracks
    if (globalLocalStream && globalLocalStream.getAudioTracks().length > 0) {
      globalLocalStream.getAudioTracks().forEach(track => {
        if (DEBUG) console.log(`[WebRTC] Setting track '${track.label}' enabled = ${!savedMuteState}`);
        track.enabled = !savedMuteState;
      });
      
      // Update global state
      globalIsAudioMuted.value = savedMuteState;
      
      // Dispatch event to update UI
      window.dispatchEvent(new CustomEvent('microphone-state-changed', { 
        detail: { isMuted: savedMuteState } 
      }));
    }
  };
  
  /**
   * Initialize stream and restore mic state after creating peer connection
   */
  const initializeConnection = async (partnerId: string | null = null): Promise<void> => {
    console.log(`[WebRTC] Initializing connection with partner ${partnerId || 'unknown'}`);
    
    try {
      // تهيئة وضبط المتغيرات العالمية
      globalPartnerId.value = partnerId;
      reconnectionAttempts = 0; // إعادة ضبط عدد محاولات إعادة الاتصال
      
      // 1. إنشاء تدفق الصوت المحلي إذا لم يكن موجودًا
      if (!globalLocalStream) {
    await initializeLocalStream();
      }
      
      // 2. استعادة حالة الميكروفون (كتم/تشغيل)
    await restoreMicrophoneState();
      
      // 3. إنهاء أي اتصال قائم
      if (globalPeerConnection) {
        closeConnection();
      }
      
      // 4. إنشاء اتصال نظير جديد
    createPeerConnection();
      
      // 5. بدء مراقبة الاتصال
      startConnectionMonitoring();
      
      // 6. تعيين مهلة للاتصال
      if (globalPeerConnection) {
        setupConnectionTimeout(globalPeerConnection);
      }
      
      // 7. إعلام الطرف الآخر بالاستعداد للمكالمة إذا تم تحديد معرف الشريك
    if (partnerId) {
        socket.value?.emit('ready-for-call', { to: partnerId });
      }
      
      console.log('[WebRTC] Connection initialized successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to initialize connection:', error);
      
      // محاولة تشخيص وإصلاح المشاكل
      diagnoseAndFixConnection();
      
      // إعادة رفع الخطأ للتعامل معه في المستوى الأعلى
      throw error;
    }
  };
  
  /**
   * Improve handling of automatic reconnection for WebRTC
   */
  function attemptReconnection(partnerId: string | null) {
    // قطع الاتصال الحالي قبل محاولة إعادة الاتصال
    closeConnection();
    
    // زيادة عدد محاولات إعادة الاتصال
    reconnectionAttempts++;
    
    // حساب التأخير باستخدام التأخير التصاعدي (exponential backoff) 
    // للحد الأدنى 1 ثانية والحد الأقصى 30 ثانية
    const delay = Math.min(
      INITIAL_RECONNECTION_DELAY * Math.pow(1.5, reconnectionAttempts - 1),
      30000
    );
    
    console.log(`[WebRTC] Attempting reconnection ${reconnectionAttempts}/${MAX_RECONNECTION_ATTEMPTS} after ${delay}ms`);
    
    // إلغاء أي مؤقت سابق
    cleanupReconnectionTimer();
    
    // إعادة الاتصال بعد التأخير
    reconnectionTimer = window.setTimeout(async () => {
      reconnectionTimer = null;
      
      if (reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
        console.log(`[WebRTC] Reached maximum reconnection attempts (${MAX_RECONNECTION_ATTEMPTS})`);
        updateGlobalState('failed');
        // إعلام المستخدم بالفشل النهائي
        socket.value?.emit('webrtc-connection-state', {
          state: 'failed',
          to: partnerId,
          details: { attempts: reconnectionAttempts }
        });
        
        // اتخاذ إجراء آخر - مثل الرجوع إلى قائمة الانتظار
        socket.value?.emit('return-to-queue', { reason: 'connection-failed' });
        return;
      }
      
      // محاولة إعادة الاتصال
      try {
        // بدء التفاوض من جديد
        await initializeConnection(partnerId);
        
        if (partnerId) {
          // إعلام الطرف الآخر بمحاولة إعادة الاتصال
          socket.value?.emit('webrtc-reconnect', { 
            to: partnerId,
            details: { attempts: reconnectionAttempts }
          });
          
          // بدء التفاوض من جديد
          startNegotiation();
        }
      } catch (error) {
        console.error('[WebRTC] Reconnection attempt failed:', error);
        
        // محاولة إعادة الاتصال مرة أخرى إذا لم نصل للحد الأقصى
        if (reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
          attemptReconnection(partnerId);
        } else {
          updateGlobalState('failed');
        }
      }
    }, delay);
  }
  
  /**
   * Clean up reconnection timer
   */
  function cleanupReconnectionTimer() {
    if (reconnectionTimer !== null) {
      clearTimeout(reconnectionTimer);
      reconnectionTimer = null;
    }
  }
  
  /**
   * Comprehensive diagnosis and fixing of WebRTC connection issues
   */
  function diagnoseAndFixConnection(): boolean {
    if (DEBUG) console.log('[WebRTC] 🔍 Diagnosing connection issues');
    
    if (!globalPeerConnection) {
      console.log('[WebRTC] 🔴 No connection exists');
      return false;
    }
    
    // Log connection states
    if (DEBUG) {
      console.log(`[WebRTC] Connection state: ${globalPeerConnection.connectionState}`);
      console.log(`[WebRTC] ICE connection state: ${globalPeerConnection.iceConnectionState}`);
      console.log(`[WebRTC] Signaling state: ${globalPeerConnection.signalingState}`);
    }
    
    // Check local stream
    if (!globalLocalStream || globalLocalStream.getAudioTracks().length === 0) {
      console.log('[WebRTC] 🔴 No local audio stream');
      
      // Try to recover local stream
      try {
        initializeLocalStream().catch((e: Error) => console.error('[WebRTC] Failed to reinitialize local stream:', e));
      } catch (e) {
        console.error('[WebRTC] Error initializing stream:', e);
      }
      return false;
    }
    
    // Check remote stream and fix if needed
    if (!globalRemoteStream || globalRemoteStream.getAudioTracks().length === 0) {
      console.log('[WebRTC] 🔴 No remote audio stream');
      
      // Fix remote stream by adding tracks from receivers
      const receivers = globalPeerConnection.getReceivers();
      const audioReceivers = receivers.filter(r => r.track && r.track.kind === 'audio');
      
      if (audioReceivers.length > 0) {
        if (!globalRemoteStream) globalRemoteStream = new MediaStream();
        
        audioReceivers.forEach(receiver => {
          if (receiver.track) {
            console.log('[WebRTC] Adding track from receiver to remote stream:', receiver.track.id);
            globalRemoteStream!.addTrack(receiver.track);
          }
        });
        
        // Update ref for components
        remoteStream.value = globalRemoteStream;
      }
      
      // If still no remote tracks, request renegotiation
      if (!globalRemoteStream || globalRemoteStream.getAudioTracks().length === 0) {
        if (!isNegotiating && globalPartnerId.value) {
          startNegotiation();
        }
        return false;
      }
    }
    
    // Ensure audio elements use the remote stream
    setTimeout(() => {
      const audioElements = document.querySelectorAll('audio');
      if (audioElements.length > 0 && globalRemoteStream) {
        console.log(`[WebRTC] Found ${audioElements.length} audio elements, ensuring they use remote stream`);
        Array.from(audioElements).forEach((audioEl, i) => {
          if (audioEl.srcObject !== globalRemoteStream) {
            console.log(`[WebRTC] Audio element ${i} not using correct stream, updating`);
            audioEl.srcObject = globalRemoteStream;
            audioEl.muted = false;
            audioEl.volume = 1.0;
            
            // Try to play audio
            audioEl.play().catch(e => console.log('[WebRTC] Error playing audio:', e));
          }
        });
      }
    }, 100);
    
    // Check all tracks are enabled
    const allTracksEnabled = [...(globalLocalStream?.getTracks() || []), ...(globalRemoteStream?.getTracks() || [])]
      .every(track => track.kind !== 'audio' || (track.kind === 'audio' && track.enabled));
    
    if (!allTracksEnabled) {
      console.log('[WebRTC] 🟠 Found disabled tracks, enabling them');
      
      // Enable all audio tracks except if user explicitly muted
      globalRemoteStream?.getAudioTracks().forEach(track => { track.enabled = true; });
      
      if (!globalIsAudioMuted.value) {
        globalLocalStream?.getAudioTracks().forEach(track => { track.enabled = true; });
      }
    }
    
    return true;
  }
  
  // Export the API
  return {
    socket,
    peerConnection,
    remoteStream,
    localStream,
    connectionState,
    isAudioMuted,
    partnerId,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleMicrophone,
    closeConnection,
    initializeLocalStream,
    cleanup,
    diagnosticReport,
    restoreMicrophoneState,
    initializeConnection,
    diagnoseAndFixConnection,
    startNegotiation,
    attemptReconnection
  };
}

// Fix for signaling state check
function isSignalingStateStable(pc: RTCPeerConnection): boolean {
  return pc.signalingState === 'stable';
}

// التحقق من إمكانية تعيين الوصف المحلي
function canSetLocalDescription(pc: RTCPeerConnection): boolean {
  return pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer';
}

// Function to update the global connection state in a centralized way
function updateGlobalState(state: string): void {
  // Only update if state actually changed
  if (globalConnectionState.value !== state) {
    if (DEBUG) console.log(`[WebRTC] Connection state changing from ${globalConnectionState.value} to ${state}`);
    globalConnectionState.value = state;
    
    // Additional state-specific actions
    if (state === 'connected' || state === 'completed') {
      // Reset failure tracking when we connect successfully
      failureReason = '';
      lastConnectionError = '';
      connectionRetryCount = 0;
      
      // Log success for debugging
      console.log('[WebRTC] Connection established successfully');
    } 
    else if (state === 'failed' || state === 'disconnected') {
      console.warn(`[WebRTC] Connection ${state}: ${failureReason || 'Unknown reason'}`);
      
      // Track failures
      if (state === 'failed') {
        connectionRetryCount++;
        console.log(`[WebRTC] Connection failure count: ${connectionRetryCount}/${MAX_CONNECTION_RETRIES}`);
      }
    }
  }
}
