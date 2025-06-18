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
    __testIceCandidates?: RTCIceCandidate[];
  }
}

interface ConnectionPreferences {
  vibe?: string;
  language?: string;
  preferSameLanguage?: boolean;
}

// Initialize with TURN-only config as default for better compatibility
let currentRtcConfig: RTCConfiguration = turnOnlyRtcConfiguration;

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
const CONNECTION_TIMEOUT = 30000; // زيادة من 10 إلى 30 ثانية للسماح بوقت كافي للاتصال عبر TURN
const RECONNECT_DELAY = 800; // 800ms delay for reconnect

// Add an automatic reconnection system with exponential backoff
let reconnectionTimer: number | null = null;
let reconnectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10; // زيادة من 5 إلى 10
const INITIAL_RECONNECTION_DELAY = 1000; // 1 second

// Track if TURN was required for previous connections
let lastConnectionRequiredTurn = localStorage.getItem('last_conn_required_turn') === 'true';
let networkTypeChecked = false;
let isLikelyDifferentNetwork = false;
let lastNegotiationTime = 0; // تتبع وقت آخر عملية تفاوض

// إضافة متغير للتحكم في آلية polite/impolite
let isPolite = false; // سيتم تعيينه بناءً على معرف المستخدم

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
    
    // Send to server - don't wait for response
    fetch('/api/webrtc-diagnostics', {
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
 * التحقق من وجود مرشحات ICE من النوع relay (TURN)
 * هذا مهم للتأكد من أن اتصالات TURN تعمل بشكل صحيح
 * @param pc كائن RTCPeerConnection للتحقق منه
 */
async function checkForTurnCandidates(pc: RTCPeerConnection): Promise<boolean> {
  if (!pc) return false;
  
  try {
    // الحصول على إحصائيات الاتصال
    const stats = await pc.getStats();
    let hasRelayCandidate = false;
    
    // البحث عن مرشحات من النوع relay
    stats.forEach(stat => {
      if (stat.type === 'local-candidate' || stat.type === 'remote-candidate') {
        if (stat.candidateType === 'relay') {
          console.log(`[WebRTC] ✅ Found ${stat.type} relay candidate:`, stat);
          hasRelayCandidate = true;
        } else if (DEBUG) {
          console.log(`[WebRTC] Found ${stat.type} ${stat.candidateType} candidate:`, stat);
        }
      }
    });
    
    // إعلام المستخدم إذا لم تكن هناك مرشحات relay
    if (!hasRelayCandidate) {
      console.warn('[WebRTC] ⚠️ No relay candidates found. TURN servers may not be working properly.');
      console.log('[WebRTC] 🔍 ICE Servers configuration:', rtcConfiguration.value.iceServers);
    } else {
      console.log('[WebRTC] ✅ TURN servers are working properly.');
    }
    
    return hasRelayCandidate;
  } catch (error) {
    console.error('[WebRTC] Error checking for relay candidates:', error);
    return false;
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
      // استخدام القيمة المخزنة من detectNetworkType() التي تم استدعاؤها مسبقًا
      if (networkTypeChecked) {
        console.log('[WebRTC] Using cached network detection result:', isLikelyDifferentNetwork ? 'Different networks likely' : 'Same network likely');
      }
      
      // تحديد التكوين المناسب بناءً على حالة الشبكة
      let config;
      
      // استخدام تكوين TURN-only في الحالات التالية:
      // 1. إذا كان الاتصال السابق تطلب TURN
      // 2. إذا كان اكتشاف الشبكة يشير إلى أن المستخدمين على شبكات مختلفة
      if (lastConnectionRequiredTurn || isLikelyDifferentNetwork) {
        console.log('[WebRTC] Using TURN-only configuration due to network detection or previous connection patterns');
        config = turnOnlyRtcConfiguration;
      } else {
        // استخدم التكوين العادي الذي يحاول استخدام STUN أولاً
        console.log('[WebRTC] Using standard ICE configuration (STUN + TURN)');
        config = rtcConfiguration.value;
      }
      
      // Create a new RTCPeerConnection with our configuration
      const pc = new RTCPeerConnection(config);
      
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
        
        // التحقق من مرشحات TURN عند اكتمال جمع المرشحات
        if (pc.iceGatheringState === 'complete') {
          setTimeout(async () => {
            const hasTurnCandidates = await checkForTurnCandidates(pc);
            
            // إذا لم يتم العثور على مرشحات TURN، قم بتغيير التكوين وإعادة المحاولة
            if (!hasTurnCandidates && rtcConfiguration.value !== turnOnlyRtcConfiguration && connectionRetryCount > 1) {
              console.log('[WebRTC] 🔄 No TURN candidates found, switching to TURN-only configuration');
              rtcConfiguration.value = turnOnlyRtcConfiguration;
              
              // حاول إعادة الاتصال إذا كان لدينا هوية الشريك
              if (globalPartnerId.value) {
                setTimeout(() => {
                  if (globalPeerConnection?.connectionState !== 'connected') {
                    console.log('[WebRTC] 🔄 Reconnecting with TURN-only configuration');
                    closeConnection();
                    initializeConnection(globalPartnerId.value).then(startNegotiation);
                  }
                }, 2000);
              }
            }
          }, 1000);
        }
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
   * Handle an incoming WebRTC offer with polite/impolite negotiation
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
    
    // تحديد ما إذا كنا polite أو impolite بناءً على معرفات المستخدمين
    // المستخدم ذو المعرف الأصغر سيكون "polite" ويتنازل عند حدوث تضارب
    if (userId.value && targetPartnerId) {
      isPolite = userId.value < targetPartnerId;
      console.log(`[WebRTC] This peer is ${isPolite ? 'polite' : 'impolite'} in negotiation`);
    }
    
    try {
      // Make sure we have access to the microphone
      if (!globalLocalStream) {
        if (DEBUG) console.log('[WebRTC] Initializing local stream before handling offer');
        await initializeLocalStream();
      }
      
      // التعامل مع حالة تضارب العروض (glare) - عندما يرسل كلا الطرفين عرضًا في نفس الوقت
      const hasCollision = globalPeerConnection && 
                          (isNegotiating || 
                           globalPeerConnection.signalingState !== 'stable');
                           
      if (hasCollision) {
        if (DEBUG) console.log(`[WebRTC] Signaling collision detected! Signaling state: ${globalPeerConnection?.signalingState}`);
        
        // إذا كنا "impolite"، نتجاهل العرض الوارد
        if (!isPolite) {
          console.log('[WebRTC] Impolite peer ignoring incoming offer due to collision');
          return;
        }
        
        // إذا كنا "polite"، نتنازل ونقبل العرض الوارد
        console.log('[WebRTC] Polite peer backing off and accepting incoming offer');
        
        // إلغاء أي عرض محلي قيد التقدم
        if (globalPeerConnection) {
          await Promise.all([
            globalPeerConnection.setLocalDescription({type: "rollback"}),
            new Promise(resolve => setTimeout(resolve, 500)) // تأخير قصير للاستقرار
          ]);
          
          console.log('[WebRTC] Local offer rolled back, ready to accept remote offer');
        }
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
   * Handle an incoming answer with improved state handling
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

      // التعامل مع الإجابة بطريقة أكثر مرونة
      if (currentState === 'have-local-offer') {
        // الحالة المثالية: لدينا عرض محلي وتلقينا إجابة
        if (DEBUG) console.log('[WebRTC] Setting remote description from answer');
        try {
          await globalPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          if (DEBUG) console.log('[WebRTC] Remote description set successfully, signaling state now: ' + globalPeerConnection.signalingState);
          
          // إعادة تعيين علم التفاوض
          isNegotiating = false;
          
          // تحقق من مرشحات ICE المتراكمة وأضفها
          if (pendingCandidates.length > 0) {
            console.log(`[WebRTC] Adding ${pendingCandidates.length} pending ICE candidates after answer`);
            for (const candidate of pendingCandidates) {
              try {
                await globalPeerConnection.addIceCandidate(candidate);
              } catch (err) {
                console.warn('[WebRTC] Error adding pending ICE candidate:', err);
              }
            }
            pendingCandidates = [];
          }
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
                isNegotiating = false;
              } catch (retryError) {
                console.error('[WebRTC] Final error setting remote description:', retryError);
                // لا نرمي الخطأ هنا لتجنب إنهاء العملية
              }
            } else {
              console.warn(`[WebRTC] Cannot set remote answer, wrong state: ${globalPeerConnection.signalingState}`);
            }
          }
        }
      } else if (currentState === 'stable') {
        // قد نكون عالجنا هذه الإجابة بالفعل
        console.log('[WebRTC] Already in stable state, checking connection status');
        
        // تحقق من حالة الاتصال
        if (globalConnectionState.value !== 'connected' && 
            globalPeerConnection.connectionState !== 'connected' &&
            globalPeerConnection.iceConnectionState !== 'connected') {
          
          console.log('[WebRTC] In stable state but connection not established, trying to improve connection');
          
          // إذا كان الاتصال غير مستقر، حاول تحسينه بإعادة التفاوض
          setTimeout(() => {
            if (globalPeerConnection && partnerId.value) {
              console.log('[WebRTC] Initiating ICE restart to improve connection');
              isRestartingIce = true;
              rtcConfiguration.value = turnOnlyRtcConfiguration; // استخدام TURN فقط
              startNegotiation();
            }
          }, 1000);
        } else {
          console.log('[WebRTC] Connection seems established, ignoring redundant answer');
        }
        
        // إعادة تعيين علم التفاوض في جميع الحالات
        isNegotiating = false;
      } else if (currentState === 'have-remote-offer') {
        // هذه حالة غير متوقعة - لدينا عرض بعيد ولكن تلقينا إجابة
        console.warn('[WebRTC] Unexpected state: have-remote-offer while receiving answer');
        
        // استخدام آلية polite/impolite للتعامل مع التضارب
        if (isPolite) {
          // المستخدم المهذب يتنازل ويقبل الإجابة حتى في حالة التضارب
          console.log('[WebRTC] Polite peer trying to handle answer despite state conflict');
          
          try {
            // محاولة إعادة تعيين الاتصال بشكل نظيف
            if (partnerId.value) {
              // إغلاق الاتصال الحالي
              closeConnection();
              
              // إعادة إنشاء اتصال جديد بعد فترة قصيرة
              setTimeout(async () => {
                if (partnerId.value) {
                  await initializeConnection(partnerId.value);
                  // إرسال إشارة للطرف الآخر لبدء التفاوض
                  socket.value?.emit('webrtc-reconnect', { to: partnerId.value });
                }
              }, 1500);
            }
          } catch (error) {
            console.error('[WebRTC] Error during polite recovery:', error);
          }
        } else {
          // المستخدم غير المهذب يصر على عرضه
          console.log('[WebRTC] Impolite peer ignoring answer in have-remote-offer state');
          
          // إرسال عرض جديد بعد فترة قصيرة
          setTimeout(() => {
            if (partnerId.value) {
              startNegotiation();
            }
          }, 2000);
        }
      } else {
        // حالات أخرى غير متوقعة
        console.warn(`[WebRTC] Unexpected signaling state: ${currentState}, trying to recover`);
        
        // محاولة استعادة الاتصال
        if (connectionRetryCount < MAX_CONNECTION_RETRIES) {
          connectionRetryCount++;
          console.log(`[WebRTC] Attempting recovery (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
          
          // التبديل إلى وضع TURN فقط
          rtcConfiguration.value = turnOnlyRtcConfiguration;
          
          // إعادة إنشاء الاتصال بعد تأخير
          setTimeout(async () => {
            if (partnerId.value) {
              await initializeConnection(partnerId.value);
              startNegotiation();
            }
          }, 2000);
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
      
      // إعادة تعيين علم التفاوض في حالة الخطأ
      isNegotiating = false;
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
    socket.value.off('webrtc-reconnect');
    socket.value.off('webrtc-force-turn');
    socket.value.off('webrtc-negotiation-needed');
    socket.value.off('webrtc-ready-to-negotiate');
    
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
    
    // استقبال إشعارات التفاوض من الطرف الآخر
    socket.value.on('webrtc-negotiation-needed', (data: { from: string, state: string }) => {
      console.log(`[WebRTC] Received negotiation state "${data.state}" from partner:`, data.from);
      
      // التحقق من أن الإشعار من الشريك الحالي
      if (data.from === partnerId.value) {
        switch (data.state) {
          case 'creating-offer':
            // الطرف الآخر يقوم بإنشاء عرض، لذا علينا الانتظار
            console.log('[WebRTC] Partner is creating offer, we should wait');
            isNegotiating = true;
            break;
            
          case 'waiting-for-stable':
            // الطرف الآخر ينتظر استقرار الحالة
            console.log('[WebRTC] Partner is waiting for stable state');
            break;
            
          case 'in-progress':
            // الطرف الآخر في وضع التفاوض
            console.log('[WebRTC] Partner is already negotiating');
            break;
            
          case 'ready':
            // الطرف الآخر جاهز للتفاوض
            console.log('[WebRTC] Partner is ready to negotiate');
            // إذا لم نكن في وضع التفاوض، يمكننا البدء
            if (!isNegotiating && globalPeerConnection?.signalingState === 'stable') {
              setTimeout(() => {
                startNegotiation();
              }, 500);
            }
            break;
        }
      }
    });
    
    // استقبال إشعارات الاستعداد للتفاوض
    socket.value.on('webrtc-ready-to-negotiate', (data: { from: string }) => {
      console.log('[WebRTC] Partner is ready to negotiate:', data.from);
      
      // التحقق من أن الإشعار من الشريك الحالي
      if (data.from === partnerId.value) {
        // إرسال إشعار بأننا جاهزون أيضًا
        if (socket.value) {
          socket.value.emit('webrtc-negotiation-needed', { 
            to: data.from,
            state: 'ready'
          });
        }
        
        // إذا كنا polite، نبدأ التفاوض
        if (isPolite && !isNegotiating && globalPeerConnection?.signalingState === 'stable') {
          setTimeout(() => {
            startNegotiation();
          }, 1000);
        }
      }
    });
    
    // معالجة طلبات إعادة الاتصال من الطرف الآخر
    socket.value.on('webrtc-reconnect', (data: { from: string, details?: any }) => {
      console.log('[WebRTC] Received reconnect request from partner:', data.from);
      
      // التحقق من أن الطلب من الشريك الحالي
      if (data.from === partnerId.value) {
        // التبديل إلى وضع TURN-only للتغلب على مشاكل NAT
        rtcConfiguration.value = turnOnlyRtcConfiguration;
        
        // إعادة بدء التفاوض باستخدام TURN
        if (globalPeerConnection && globalPeerConnection.connectionState !== 'connected') {
          console.log('[WebRTC] Restarting negotiation with TURN-only mode due to partner request');
          
          // إعادة تعيين الاتصال بالكامل
          closeConnection();
          setTimeout(() => {
            initializeConnection(data.from).then(() => {
              // بدء التفاوض بعد تهيئة الاتصال
              startNegotiation();
            });
          }, 1000);
        }
      }
    });
    
    // معالجة طلبات فرض استخدام TURN
    socket.value.on('webrtc-force-turn', (data: { from: string }) => {
      console.log('[WebRTC] Received force TURN mode request from:', data.from);
      
      // تحديث علم استخدام TURN
      lastConnectionRequiredTurn = true;
      localStorage.setItem('last_conn_required_turn', 'true');
      
      // التبديل إلى وضع TURN-only
      rtcConfiguration.value = turnOnlyRtcConfiguration;
      
      // إذا كان الاتصال غير مستقر، إعادة بدء التفاوض
      if (globalPeerConnection && 
          (globalPeerConnection.connectionState === 'connecting' || 
           globalPeerConnection.connectionState === 'new' ||
           globalConnectionState.value !== 'connected')) {
        
        console.log('[WebRTC] Switching to TURN-only mode and restarting connection');
        
        // إعادة بدء الاتصال بالكامل
        closeConnection();
        setTimeout(() => {
          if (partnerId.value) {
            initializeConnection(partnerId.value).then(startNegotiation);
          }
        }, 1500);
      }
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
    
    // زيادة وقت الانتظار الأولي للسماح بمزيد من الوقت لإنشاء الاتصال
    const initialTimeout = 10000; // 10 ثواني لتجربة التكوين الأول (زيادة من 5 ثواني)
    
    // Set an initial timeout to try fast configuration
    (window as any).__webrtcConnectionTimeout = setTimeout(() => {
      if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
        if (DEBUG) console.log(`[WebRTC] Connection not established after ${initialTimeout/1000} seconds, trying fast config`);
        
        // التبديل مباشرة إلى التكوين السريع لتسريع الاتصال
        currentRtcConfig = fastRtcConfiguration;
        
        if (partnerId.value && !isNegotiating) {
          // محاولة سريعة باستخدام الإعداد الجديد
          createOffer(partnerId.value);
        }
        
        // Set a second timeout for TURN-only config with increased timeout
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
              }, 500); // زيادة التأخير من 200 إلى 500 مللي ثانية
            }
            
            // إضافة مهلة نهائية طويلة للتأكد من إتاحة وقت كافٍ للاتصال عبر TURN
            (window as any).__webrtcConnectionTimeout = setTimeout(() => {
              if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
                console.log('[WebRTC] ⚠️ Connection still not established after final timeout');
                // جمع معلومات تشخيصية نهائية
                console.log('[WebRTC] Final diagnostic report:', getConnectionDiagnosticReport());
                
                // إخطار المستخدم بمشكلة الاتصال
                updateGlobalState('failed');
              }
            }, 15000); // 15 ثانية إضافية كمهلة نهائية
        }
        }, 10000); // زيادة من 5 إلى 10 ثواني للتكوين TURN
      }
    }, initialTimeout);
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
   * معالجة مرشح ICE من النظير البعيد مع تحسينات للتعامل مع حالات الإشارة المختلفة
   */
  const handleIceCandidate = async (candidate: RTCIceCandidate): Promise<void> => {
    if (!globalPeerConnection) {
      if (DEBUG) console.log('[WebRTC] Received ICE candidate but no peer connection exists');
      
      // تخزين المرشح للاستخدام لاحقًا عند إنشاء الاتصال
      pendingCandidates.push(candidate);
      if (DEBUG) console.log('[WebRTC] Storing ICE candidate for later use when connection is created');
      return;
    }
      
    try {
      if (DEBUG) console.log('[WebRTC] Adding received ICE candidate:', candidate.candidate);
      
      // Store remote candidates for diagnostics
      if (!(window as any).__remoteIceCandidates) {
        (window as any).__remoteIceCandidates = [];
      }
      (window as any).__remoteIceCandidates.push(candidate);
      
      // التحقق من حالة الإشارة قبل إضافة المرشح
      const signalingState = globalPeerConnection.signalingState;
      
      // التحقق من أن الوصف المحلي والبعيد موجودان قبل إضافة المرشحين
      if (!globalPeerConnection.remoteDescription || !globalPeerConnection.localDescription) {
        if (DEBUG) console.log(`[WebRTC] Delaying ICE candidate addition until descriptions are set. Current state: ${signalingState}`);
        
        // تخزين المرشح للإضافة لاحقًا بعد ضبط الوصف
        setTimeout(async () => {
          if (globalPeerConnection && globalPeerConnection.remoteDescription) {
            if (DEBUG) console.log('[WebRTC] Adding delayed ICE candidate after timeout');
            try {
              await globalPeerConnection.addIceCandidate(candidate);
            } catch (error) {
              console.error('[WebRTC] Error adding delayed ICE candidate:', error);
              
              // محاولة ثانية بعد تأخير أطول
              setTimeout(async () => {
                if (globalPeerConnection && globalPeerConnection.remoteDescription) {
                  try {
                    await globalPeerConnection.addIceCandidate(candidate);
                    if (DEBUG) console.log('[WebRTC] Successfully added ICE candidate on second retry');
                  } catch (secondRetryError) {
                    // تجاهل الخطأ في المحاولة الثانية
                  }
                }
              }, 3000);
            }
          }
        }, 1500); // زيادة التأخير من 1000 إلى 1500
        
        return;
      }
      
      // تحسين للتعامل مع حالة "stable" - قد تكون هذه مرشحات متأخرة من اتصال سابق
      if (signalingState === 'stable' && isLikelyDifferentNetwork) {
        // في حالة الشبكات المختلفة، نحتاج للتأكد من أن المرشح صالح للاتصال الحالي
        const candidateStr = candidate.candidate.toLowerCase();
        
        // إذا كان المرشح من نوع relay (TURN)، نضيفه دائمًا لأنه مهم للشبكات المختلفة
        if (candidateStr.includes('typ relay')) {
          console.log('[WebRTC] Adding important relay candidate even in stable state');
          
          try {
            await globalPeerConnection.addIceCandidate(candidate);
            if (DEBUG) console.log('[WebRTC] Successfully added relay ICE candidate in stable state');
            
            // تحديث علم استخدام TURN
            lastConnectionRequiredTurn = true;
            localStorage.setItem('last_conn_required_turn', 'true');
          } catch (relayError) {
            // تجاهل الخطأ - قد يكون الاتصال في حالة لا تسمح بإضافة المرشح
          }
        }
        
        return;
      }
      
      // محاولة إضافة المرشح
      await globalPeerConnection.addIceCandidate(candidate);
      
      // تحديث علم TURN إذا كان المرشح من نوع relay
      if (candidate.candidate.toLowerCase().includes('typ relay')) {
        lastConnectionRequiredTurn = true;
        localStorage.setItem('last_conn_required_turn', 'true');
      }
      
      if (DEBUG) console.log('[WebRTC] Successfully added ICE candidate');
    } catch (error) {
      console.error('[WebRTC] Error adding ICE candidate:', error);
      lastConnectionError = `Error adding ICE candidate: ${error}`;
      
      // محاولة ثانية بعد تأخير
      setTimeout(async () => {
        if (globalPeerConnection && globalPeerConnection.remoteDescription) {
          if (DEBUG) console.log('[WebRTC] Retrying to add ICE candidate after error');
          try {
            await globalPeerConnection.addIceCandidate(candidate);
            if (DEBUG) console.log('[WebRTC] Successfully added ICE candidate on retry');
          } catch (retryError) {
            console.error('[WebRTC] Error adding ICE candidate on retry:', retryError);
          }
        }
      }, 2000);
    }
  };
  
  // تم حذف التعريفات المكررة
  
  /**
   * بدء تفاوض جديد على الاتصال WebRTC مع تحسينات للتعامل مع حالات التزامن
   */
  function startNegotiation(): void {
    if (!globalPeerConnection || !partnerId.value) {
      if (DEBUG) console.log('[WebRTC] Cannot start negotiation: missing connection or partner ID');
      return;
    }
    
    // إذا كان التفاوض جاريًا، نتحقق من المدة التي مرت
    if (isNegotiating) {
      // إذا كان التفاوض مستمرًا لفترة طويلة، نفترض أنه قد تعطل ونعيد ضبطه
      if (Date.now() - lastNegotiationTime > 10000) { // 10 ثواني
        console.log('[WebRTC] Negotiation seems stuck, resetting negotiation state');
        isNegotiating = false;
      } else {
        if (DEBUG) console.log('[WebRTC] Already negotiating, skipping new negotiation');
        
        // إرسال إشعار للطرف الآخر بأننا في وضع التفاوض
        if (socket.value && partnerId.value) {
          socket.value.emit('webrtc-negotiation-needed', { 
            to: partnerId.value,
            state: 'in-progress'
          });
        }
        
        return;
      }
    }
    
    if (DEBUG) console.log('[WebRTC] Starting new negotiation');
    isNegotiating = true;
    lastNegotiationTime = Date.now();
    
    // التحقق من حالة الإشارة قبل البدء
    const signalingState = globalPeerConnection.signalingState;
    
    // تنفيذ آلية polite/impolite للتعامل مع تضارب التفاوض
    const hasGlare = signalingState !== 'stable';
    
    if (hasGlare) {
      if (!isPolite) {
        // المستخدم غير المهذب يتجاهل طلبات التفاوض المتزامنة
        console.log(`[WebRTC] Impolite peer detected glare, waiting for signaling state to stabilize: ${signalingState}`);
        
        // إرسال إشعار للطرف الآخر بأننا ننتظر
        if (socket.value && partnerId.value) {
          socket.value.emit('webrtc-negotiation-needed', { 
            to: partnerId.value,
            state: 'waiting-for-stable'
          });
        }
        
        // انتظار فترة قبل إعادة المحاولة
        setTimeout(() => {
          isNegotiating = false;
          if (globalPeerConnection?.signalingState === 'stable') {
            console.log('[WebRTC] Signaling state now stable, can proceed with negotiation');
            startNegotiation();
          }
        }, 2000);
        
        return;
      } else {
        // المستخدم المهذب يتنازل ويعيد ضبط الحالة المحلية
        console.log(`[WebRTC] Polite peer detected glare, rolling back local description`);
        
        try {
          // إعادة ضبط الوصف المحلي إذا كان هناك تضارب
          if (signalingState === 'have-local-offer') {
            globalPeerConnection.setLocalDescription({type: 'rollback'})
              .then(() => {
                console.log('[WebRTC] Successfully rolled back local description');
                // الآن يمكننا المتابعة بعد إعادة الضبط
                setTimeout(() => {
                  if (globalPeerConnection?.signalingState === 'stable') {
                    startNegotiation();
                  }
                }, 1000);
              })
              .catch(err => {
                console.error('[WebRTC] Error rolling back:', err);
                isNegotiating = false;
              });
            return;
          }
        } catch (error: any) {
          console.error('[WebRTC] Error during rollback:', error);
          isNegotiating = false;
          return;
        }
      }
    }
    
    // استخدام TURN-only افتراضيًا للحصول على أفضل توافقية
    console.log('[WebRTC] Using TURN-only configuration for negotiation');
    rtcConfiguration.value = turnOnlyRtcConfiguration;
    
    try {
      // إرسال إشعار للطرف الآخر بأننا نبدأ التفاوض
      if (socket.value && partnerId.value) {
        socket.value.emit('webrtc-negotiation-needed', { 
          to: partnerId.value,
          state: 'creating-offer'
        });
      }
      
      // انتظار لجمع مرشحات ICE قبل إنشاء العرض
      setTimeout(async () => {
        try {
          if (!globalPeerConnection) return;
          
          // بدء تفاوض جديد بإنشاء عرض
          const offer = await globalPeerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
            iceRestart: isRestartingIce // إعادة تشغيل ICE إذا كنا في وضع إعادة التشغيل
          });
          
          // تسجيل SDP للتشخيص
          if (DEBUG) console.log('[WebRTC] Local offer SDP:', offer.sdp);
          
          // التحقق من حالة الإشارة مرة أخرى قبل تعيين الوصف المحلي
          if (!globalPeerConnection || globalPeerConnection.signalingState !== 'stable') {
            console.warn(`[WebRTC] Signaling state changed during offer creation: ${globalPeerConnection?.signalingState}`);
            
            // إذا كنا مهذبين، نتنازل
            if (isPolite) {
              isNegotiating = false;
              return;
            }
          }
          
          // تعيين الوصف المحلي
          await globalPeerConnection.setLocalDescription(offer);
          console.log('[WebRTC] Local description set successfully');
          
          // انتظار قصير لجمع المزيد من مرشحات ICE قبل إرسال العرض
          await new Promise(resolve => setTimeout(resolve, 500));
          
          if (!globalPeerConnection || !socket.value || !partnerId.value) return;
          
          // إرسال العرض الجديد
          socket.value.emit('webrtc-signal', {
            type: 'offer',
            offer: globalPeerConnection.localDescription,
            to: partnerId.value
          });
          
          console.log('[WebRTC] Sent negotiation offer');
          
          // بدء مراقبة الاتصال
          startConnectionMonitoring();
          
          // إعادة تعيين علم إعادة تشغيل ICE
          isRestartingIce = false;
        } catch (error) {
          console.error('[WebRTC] Error creating/sending offer:', error);
          
          // محاولة إصلاح الخطأ
          if (error.toString().includes('InvalidStateError')) {
            console.log('[WebRTC] Invalid state during offer creation, resetting connection');
            
            if (partnerId.value) {
              closeConnection();
              setTimeout(() => {
                initializeConnection(partnerId.value);
              }, 1500);
            }
          }
          
          isNegotiating = false;
        }
      }, 500); // انتظار قصير لجمع مرشحات ICE قبل إنشاء العرض
    } catch (error) {
      console.error('[WebRTC] Failed to start negotiation:', error);
      isNegotiating = false;
    } finally {
      // إعادة تعيين العلم بعد فترة
      setTimeout(() => {
        if (isNegotiating) {
          console.log('[WebRTC] Negotiation timeout, resetting negotiation state');
          isNegotiating = false;
        }
      }, 10000); // زيادة المهلة لضمان اكتمال التفاوض
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
      
      // 0. التحقق من حالة الشبكة قبل إنشاء الاتصال إذا لم يتم التحقق بعد
      if (!networkTypeChecked) {
        isLikelyDifferentNetwork = await detectNetworkType();
        networkTypeChecked = true;
        console.log('[WebRTC] Network detection result:', isLikelyDifferentNetwork ? 'Different networks likely' : 'Same network likely');
        
        // إذا كان من المحتمل أن تكون الشبكات مختلفة، إرسال إشعار للطرف الآخر لاستخدام TURN
        if (isLikelyDifferentNetwork && partnerId && socket.value) {
          console.log('[WebRTC] Sending force TURN mode request to partner due to different networks');
          socket.value.emit('webrtc-force-turn', { to: partnerId });
          
          // استخدام وضع TURN-only مباشرة
          rtcConfiguration.value = turnOnlyRtcConfiguration;
        }
      }
      
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
      
      // 4. إنشاء اتصال نظير جديد - استخدام الوظيفة المحسنة التي تختار التكوين المناسب
      globalPeerConnection = createPeerConnection();
      
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
    
    // تحويل الاتصال إلى وضع TURN-only إذا كان يواجه مشاكل
    if ((globalPeerConnection.iceConnectionState === 'checking' && connectionRetryCount > 3) || 
        globalPeerConnection.iceConnectionState === 'failed' || 
        globalConnectionState.value === 'failed' ||
        (connectionRetryCount > 3 && globalPeerConnection.connectionState !== 'connected')) {
      
      console.log('[WebRTC] 🔄 Switching to TURN-only mode for better connectivity');
      
      // استخدام إعدادات TURN-only
      rtcConfiguration.value = turnOnlyRtcConfiguration;
      
      // إعادة ضبط الاتصال
      closeConnection();
      
      // محاولة إعادة الاتصال بإعدادات TURN-only
      if (globalPartnerId.value) {
        console.log('[WebRTC] 🔄 Attempting reconnection with TURN-only mode');
        setTimeout(() => {
          initializeConnection(globalPartnerId.value)
            .then(() => {
              console.log('[WebRTC] 🟢 Reconnected with TURN-only mode');
              startNegotiation();
            })
            .catch(err => {
              console.error('[WebRTC] 🔴 Failed to reconnect with TURN-only mode:', err);
            });
        }, 1000);
      }
      
      return true;
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

/**
 * وظيفة محسنة للكشف إذا كان المستخدمان على نفس الشبكة أو شبكات مختلفة
 * هذا يساعد على تحديد الحاجة لاستخدام خوادم TURN مبكراً
 */
async function detectNetworkType(): Promise<boolean> {
  try {
    // إنشاء اتصال مؤقت لجمع مرشحات ICE
    const pc = new RTCPeerConnection(standardRtcConfiguration);
    
    // إنشاء قناة بيانات لتحفيز جمع ICE
    pc.createDataChannel('network-detection');
    
    // تخزين مرشحات ICE للتحليل
    const candidates: RTCIceCandidate[] = [];
    
    // الاستماع لمرشحات ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidates.push(event.candidate);
        
        // تسجيل المرشحات للتشخيص
        console.log(`[NetworkDetection] ICE candidate: ${event.candidate.candidate}`);
      }
    };
    
    // إنشاء عرض لبدء جمع ICE
    await pc.createOffer().then(offer => pc.setLocalDescription(offer));
    
    // انتظار اكتمال جمع ICE أو انتهاء المهلة
    await new Promise<void>((resolve) => {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          console.log('[NetworkDetection] ICE gathering complete');
          resolve();
        } else if (candidates.length >= 8) {
          // لدينا عدد كافٍ من المرشحات لاتخاذ قرار
          console.log('[NetworkDetection] Collected enough candidates');
          resolve();
        } else {
          setTimeout(checkState, 500);
        }
      };
      
      // بدء فحص الحالة
      checkState();
      
      // انتهاء المهلة بعد 8 ثوانٍ (زيادة من 5 إلى 8 ثوانٍ)
      setTimeout(() => {
        console.log('[NetworkDetection] Timeout reached, proceeding with analysis');
        resolve();
      }, 8000);
    });
    
    // تنظيف
    pc.close();
    
    // تخزين للتصحيح
    window.__testIceCandidates = candidates;
    
    // تحليل المرشحات بشكل أكثر تفصيلاً
    let hasHost = false;
    let hasPrivateIPv4 = false;
    let hasPublicIPv4 = false;
    let hasServerReflexive = false;
    let hasRelay = false;
    let natTypes = new Set<string>();
    
    // تعبيرات منتظمة للتعرف على أنواع العناوين
    const privateIpRegex = /192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\./;
    const publicIpRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
    
    for (const candidate of candidates) {
      if (candidate.candidate) {
        const candidateStr = candidate.candidate.toLowerCase();
        
        // تحديد نوع المرشح
        if (candidateStr.includes(' host ')) {
          hasHost = true;
          
          // فحص ما إذا كان عنوان IP خاص
          if (privateIpRegex.test(candidateStr)) {
            hasPrivateIPv4 = true;
          } else if (publicIpRegex.test(candidateStr) && 
                    !privateIpRegex.test(candidateStr) && 
                    !candidateStr.includes('127.0.0.1')) {
            hasPublicIPv4 = true;
          }
        } else if (candidateStr.includes(' srflx ')) {
          // مرشحات server reflexive تشير إلى وجود NAT
          hasServerReflexive = true;
          natTypes.add('srflx');
          
          // استخراج عنوان IP العام
          const ipMatch = candidateStr.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
          if (ipMatch && !privateIpRegex.test(ipMatch[0])) {
            hasPublicIPv4 = true;
          }
        } else if (candidateStr.includes(' relay ')) {
          // مرشحات relay تشير إلى استخدام TURN
          hasRelay = true;
          natTypes.add('relay');
        } else if (candidateStr.includes(' prflx ')) {
          // مرشحات peer reflexive تشير إلى NAT أكثر تعقيداً
          natTypes.add('prflx');
        }
      }
    }
    
    // تحليل النتائج
    console.log(`[NetworkDetection] Analysis: hasHost=${hasHost}, hasPrivateIPv4=${hasPrivateIPv4}, hasPublicIPv4=${hasPublicIPv4}, hasServerReflexive=${hasServerReflexive}, hasRelay=${hasRelay}, natTypes=${Array.from(natTypes).join(',')}`);
    
    // الاستنتاج:
    // 1. إذا كان لدينا مرشحات srflx فقط، فمن المحتمل أن نكون خلف NAT بسيط
    // 2. إذا كان لدينا مرشحات prflx أو عدة أنواع من NAT، فمن المحتمل أن نكون خلف NAT معقد
    // 3. إذا كان لدينا مرشحات relay فقط، فمن المحتمل أن نكون خلف جدار حماية مقيد
    
    // عوامل تشير إلى احتمالية الحاجة إلى TURN:
    // - وجود NAT معقد (prflx)
    // - عدم وجود مرشحات host على الإطلاق
    // - وجود مرشحات relay فقط
    
    const needsTurn = (
      natTypes.has('prflx') || 
      !hasHost || 
      (hasRelay && !hasServerReflexive && !hasHost) ||
      (hasPrivateIPv4 && hasPublicIPv4) ||
      lastConnectionRequiredTurn
    );
    
    console.log(`[NetworkDetection] Conclusion: ${needsTurn ? 'Different networks likely, TURN recommended' : 'Same network likely, direct connection possible'}`);
    
    // تخزين النتيجة للاستخدام المستقبلي
    if (needsTurn) {
      localStorage.setItem('last_conn_required_turn', 'true');
    }
    
    return needsTurn;
  } catch (error: any) {
    console.error('[WebRTC] Error detecting network type:', error);
    // الافتراض أننا بحاجة إلى TURN للسلامة
    return true;
  }
}

/**
 * اختبار خوادم TURN للتأكد من أنها تعمل بشكل صحيح
 * يقوم بإنشاء اتصال وهمي للتحقق من قدرة الاتصال بخوادم TURN
 */
async function testTurnServers(): Promise<boolean> {
  console.log('[WebRTC] Testing TURN servers...');
  
  try {
    // إنشاء اتصال وهمي باستخدام تكوين TURN فقط
    const pc = new RTCPeerConnection(turnOnlyRtcConfiguration);
    let hasTurnCandidate = false;
    
    // الاستماع لمرشحات ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // تخزين في متغير عام للتشخيص
        if (!(window as any).__testIceCandidates) {
          (window as any).__testIceCandidates = [];
        }
        (window as any).__testIceCandidates.push(event.candidate);
        
        // التحقق إذا كان المرشح من نوع relay (TURN)
        if (event.candidate.candidate.includes('typ relay')) {
          console.log('[WebRTC] ✅ TURN test successful - found relay candidate');
          hasTurnCandidate = true;
        }
      }
    };
    
    // إضافة مسار صوتي وهمي لتحفيز جمع ICE
    pc.addTransceiver('audio');
    
    // إنشاء عرض محلي للبدء في جمع ICE
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // الانتظار فترة كافية لجمع المرشحات (3 ثواني)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // إغلاق الاتصال الوهمي
    pc.close();
    
    console.log('[WebRTC] TURN test result:', hasTurnCandidate ? 'Success' : 'Failed');
    return hasTurnCandidate;
  } catch (error) {
    console.error('[WebRTC] Error testing TURN servers:', error);
    return false;
  }
}
