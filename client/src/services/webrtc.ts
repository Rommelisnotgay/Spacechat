import { ref, onUnmounted, shallowRef, watch, computed } from 'vue';
import { useSocket } from './socket';
import { Socket } from 'socket.io-client';

interface ConnectionPreferences {
  vibe?: string;
  language?: string;
  preferSameLanguage?: boolean;
}

// Create a more complete configuration with TURN servers for better compatibility
const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    // TURN servers first for better NAT traversal
    {
      urls: [
        'turn:relay.metered.ca:443?transport=tcp',
        'turn:relay.metered.ca:443',
        'turn:relay.metered.ca:80'
      ],
      username: 'e7d68233d99b711f726f5f4d',
      credential: 'tYJEzRe2K5L7A0kO'
    },
    {
      urls: [
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:443', 
        'turn:openrelay.metered.ca:80'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: [
        'turn:turn.anyfirewall.com:443?transport=tcp'
      ],
      username: 'webrtc',
      credential: 'webrtc'
    },
    // STUN servers last
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

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
const MAX_CONNECTION_RETRIES = 10; // Increased number of attempts
let pendingCandidates: RTCIceCandidate[] = []; // List of pending ICE candidates

// Adding stability variables
let heartbeatInterval: number | null = null;
let trackCheckInterval: number | null = null;
let connectionMonitorInterval: number | null = null;
const HEARTBEAT_INTERVAL = 3000; // Reduced heartbeat interval
const TRACK_CHECK_INTERVAL = 3000; // 3 seconds
const CONNECTION_MONITOR_INTERVAL = 5000; // 5 seconds
const CONNECTION_STABILITY_THRESHOLD = 10000; // 10 seconds before considering the connection stable

// Add constants for connection timeouts
const CONNECTION_TIMEOUT = 8000; // Reduced timeout to 8 seconds
const RECONNECT_DELAY = 500; // Reduced delay before reconnection

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
    return 'No peer connection has been established.';
  }
  
  // Check for specific issues
  if (failureReason) {
    return `Connection failed: ${failureReason}`;
  }
  
  if (lastConnectionError) {
    return `Last error: ${lastConnectionError}`;
  }
  
  if (!globalLocalStream || globalLocalStream.getAudioTracks().length === 0) {
    return 'No local audio tracks available. Microphone may not be accessible.';
  }
  
  if (!globalRemoteStream || globalRemoteStream.getAudioTracks().length === 0) {
    return 'No remote audio tracks received. Partner may not have microphone access.';
  }
  
  const state = globalPeerConnection.connectionState || globalPeerConnection.iceConnectionState;
  
  switch (state) {
    case 'new':
      return 'Connection is being set up but has not started yet.';
    case 'connecting':
      return 'Connection is in progress. This may take time depending on network conditions.';
    case 'connected':
      if (peerConnectionStats?.selectedCandidatePair?.state !== 'succeeded') {
        return 'Connected but ICE negotiation not complete. Audio may be delayed.';
      }
      return 'Connection appears to be working. If no audio, check browser audio settings.';
    case 'disconnected':
      return 'Connection temporarily disconnected. This may resolve itself.';
    case 'failed':
      return 'Connection failed. Likely causes: firewall, VPN, or network issues.';
    case 'closed':
      return 'Connection was closed.';
    default:
      return `Unknown connection state: ${state}`;
  }
}

// متغير عام لتخزين إعدادات الاتصال الحالية
let currentRtcConfig: RTCConfiguration = {
  iceTransportPolicy: 'all', 
  iceCandidatePoolSize: 10,
  iceServers: [
    // خوادم TURN مجانية - وضعها أولاً لإعطائها الأولوية
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    // خوادم TURN مجانية أخرى
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443'
      ],
      username: 'e7d68233d99b711f726f5f4d',
      credential: 'tYJEzRe2K5L7A0kO'
    },
    // خوادم TURN مجانية إضافية
    {
      urls: [
        'turn:turn.anyfirewall.com:443?transport=tcp'
      ],
      username: 'webrtc',
      credential: 'webrtc'
    },
    // خوادم STUN - بعد خوادم TURN
    { 
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ]
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// إعدادات خوادم STUN فقط للاتصالات السريعة
const fastRtcConfiguration: RTCConfiguration = {
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ]
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// إعدادات TURN فقط لحالات الشبكات المحمية - الآن مع خوادم TURN المجانية فقط
const turnOnlyRtcConfiguration: RTCConfiguration = {
  iceTransportPolicy: 'relay', // إجبار استخدام خوادم TURN فقط
  iceCandidatePoolSize: 10,
  iceServers: [
    // خوادم TURN مجانية
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    // خوادم TURN إضافية للتنوع
    {
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443'
      ],
      username: 'e7d68233d99b711f726f5f4d',
      credential: 'tYJEzRe2K5L7A0kO'
    },
    // خوادم TURN إضافية مجانية
    {
      urls: [
        'turn:turn.anyfirewall.com:443?transport=tcp'
      ],
      username: 'webrtc',
      credential: 'webrtc'
    },
    // خوادم TURN إضافية
    {
      urls: [
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// إعدادات خوادم STUN/TURN مختلطة
const standardRtcConfiguration: RTCConfiguration = {
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
  iceServers: [
    // خوادم STUN مجانية من Google
    { 
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    },
    // خوادم TURN مجانية
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

/**
 * WebRTC service for audio calls
 */
export function useWebRTC() {
  const { socket, userId } = useSocket();
  
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
    try {
      if (globalLocalStream) {
        if (DEBUG) console.log('[WebRTC] Using existing local stream');
        
        // Check if audio tracks are still active
        const audioTracks = globalLocalStream.getAudioTracks();
        if (audioTracks.length === 0 || !audioTracks[0].enabled) {
          if (DEBUG) console.log('[WebRTC] Existing stream has no active audio tracks, requesting new stream');
          // If no active audio tracks, get a new stream
          globalLocalStream.getTracks().forEach(track => track.stop());
          globalLocalStream = null;
        } else {
          return globalLocalStream;
        }
      }
      
      if (DEBUG) console.log('[WebRTC] Requesting access to microphone with specific constraints');
      
      // Try with more specific audio constraints for better quality
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
        },
        video: false
      });
      
      // Double check that we got audio tracks
      if (stream.getAudioTracks().length === 0) {
        console.error('[WebRTC] No audio tracks found in stream');
        throw new Error('No audio tracks available');
      }
      
      if (DEBUG) {
        console.log('[WebRTC] Local stream acquired successfully');
        console.log('[WebRTC] Audio tracks:', stream.getAudioTracks().length);
        const tracks = stream.getAudioTracks();
        tracks.forEach(track => {
          console.log(`[WebRTC] Track: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
          console.log('[WebRTC] Track settings:', JSON.stringify(track.getSettings()));
        });
      }
      
      // Ensure all tracks are enabled
      stream.getTracks().forEach(track => {
        track.enabled = true;
      });
      
      globalLocalStream = stream;
      localStream.value = stream;
      return stream;
    } catch (error) {
      console.error('[WebRTC] Error accessing microphone:', error);
      
      // Try with simpler constraints as fallback
      try {
        if (DEBUG) console.log('[WebRTC] Trying fallback with simpler constraints');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        if (stream.getAudioTracks().length === 0) {
          throw new Error('No audio tracks available');
        }
        
        globalLocalStream = stream;
        localStream.value = stream;
        return stream;
      } catch (fallbackError) {
        console.error('[WebRTC] Fallback also failed:', fallbackError);
        throw new Error('Could not access microphone. Please check permissions.');
      }
    }
  };
  
  /**
   * إنشاء اتصال RTCPeerConnection جديد مع تحسينات الاستقرار
   */
  const createPeerConnection = (): RTCPeerConnection => {
    if (globalPeerConnection && globalPeerConnection.connectionState !== 'closed' && 
        globalPeerConnection.connectionState !== 'failed' && 
        globalPeerConnection.connectionState !== 'disconnected') {
      if (DEBUG) console.log('[WebRTC] Reusing existing peer connection');
      return globalPeerConnection;
    }
    
    // البدء مباشرة بخوادم TURN لتسريع الاتصال والتغلب على مشاكل NAT
    if (DEBUG) console.log('[WebRTC] Creating new peer connection with TURN servers');
    
    // إغلاق أي اتصال موجود
    if (globalPeerConnection) {
      closeConnection();
    }
    
    // إنشاء اتصال جديد مع إعطاء الأولوية لخوادم TURN
    const pc = new RTCPeerConnection(rtcConfiguration);
    
    // Create a new stream for remote audio
    if (!globalRemoteStream) {
      globalRemoteStream = new MediaStream();
      remoteStream.value = globalRemoteStream;
    }
    
    // Set up connection timeout
    setupConnectionTimeout(pc);
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
      if (DEBUG) console.log('[WebRTC] Track received:', event.track.kind);
      
      // Add the track to the remote stream
      if (event.track.kind === 'audio') {
        if (DEBUG) console.log('[WebRTC] Adding remote audio track to stream');
        if (!globalRemoteStream) {
          globalRemoteStream = new MediaStream();
        }
        globalRemoteStream.addTrack(event.track);
        remoteStream.value = globalRemoteStream;
        
        // تفعيل المسار الصوتي
        event.track.enabled = true;
      }
    };
      
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (DEBUG) console.log('[WebRTC] Connection state changed:', pc.connectionState);
      
      // مهم: لا تقم بتغيير حالة الاتصال من "متصل" إلى "جاري الاتصال" إذا كان الصوت يعمل بالفعل
      if (pc.connectionState === 'connecting' && globalConnectionState.value === 'connected') {
        // تحقق من وجود مسارات صوتية تعمل
        const hasWorkingAudioTracks = globalRemoteStream && 
                                    globalRemoteStream.getAudioTracks().length > 0 &&
                                    globalRemoteStream.getAudioTracks().some(track => track.enabled);
        
        if (hasWorkingAudioTracks) {
          if (DEBUG) console.log('[WebRTC] Ignoring state change to "connecting" because audio is working');
          return; // لا تغير الحالة إذا كان الصوت يعمل
        }
      }
      
      // خاص بحالة matched: لا تغير إلى connecting بعد أن نكون matched
      if (pc.connectionState === 'connecting' && globalConnectionState.value === 'matched') {
        if (DEBUG) console.log('[WebRTC] Still in negotiation phase, keeping matched state');
        return; // الإبقاء على حالة matched خلال مرحلة التفاوض
      }
      
      // تحديث الحالة فقط إذا لم تكن تجاهلناها أعلاه
      globalConnectionState.value = pc.connectionState || 'new';
      connectionState.value = pc.connectionState || 'new';
      
      // Handle specific states
      if (pc.connectionState === 'connected') {
        if (DEBUG) console.log('[WebRTC] Connection established');
        connectionRetryCount = 0; // Reset retry count on successful connection
        startConnectionMonitoring(); // Start monitoring connection quality
        
        // تأكد من وجود المسارات الصوتية وتحسين وقت استجابة الاتصال
        setTimeout(() => {
          // فحص المسارات وإصلاحها إذا لزم الأمر
          checkAndFixTracks();
          
          // التأكد من أن الصوت يعمل قبل تحديث الحالة
          const audioIsWorking = globalRemoteStream && 
                               globalRemoteStream.getAudioTracks().length > 0 &&
                               globalRemoteStream.getAudioTracks().some(track => track.readyState === 'live');
          
          if (DEBUG) console.log(`[WebRTC] Audio tracks working: ${audioIsWorking}`);
          
          // تحقق مرة أخرى بعد لحظة لضمان استقرار الاتصال
          setTimeout(() => {
            if (pc.connectionState === 'connected') {
              checkAndFixTracks();
              
              // إذا كنا في حالة matched، حدث فوراً إلى حالة connected
              if (globalConnectionState.value === 'matched') {
                if (DEBUG) console.log('[WebRTC] Updating state from matched to connected');
                globalConnectionState.value = 'connected';
                connectionState.value = 'connected';
              }
            }
          }, 1000);
        }, 300);
        
        // Start the heartbeat to keep the connection alive
        startConnectionHeartbeat();
      } else if (pc.connectionState === 'failed') {
        failureReason = 'Connection failed';
        
        // Try to recover automatically
        if (connectionRetryCount < MAX_CONNECTION_RETRIES && !isRestartingIce) {
          connectionRetryCount++;
          console.log(`[WebRTC] Connection failed, attempting recovery (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
          attemptConnectionRecovery();
        } else {
          console.error('[WebRTC] Connection failed and max retries reached');
        }
      } else if (pc.connectionState === 'disconnected') {
        // عند فقدان الاتصال، لا تغير الحالة فورًا إذا كان الصوت لا يزال يعمل
        const audioStillWorking = globalRemoteStream && 
                               globalRemoteStream.getAudioTracks().length > 0 &&
                               globalRemoteStream.getAudioTracks().some(track => track.readyState === 'live');
        
        if (audioStillWorking) {
          if (DEBUG) console.log('[WebRTC] Connection reported as disconnected but audio still works, not changing state');
          
          // محاولة استعادة الاتصال في الخلفية بدون تغيير الحالة المرئية
          if (!isRestartingIce && connectionRetryCount < MAX_CONNECTION_RETRIES) {
            connectionRetryCount++;
            console.log(`[WebRTC] Silent connection recovery (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
            
            // تأخير قصير قبل محاولة الإصلاح
            setTimeout(() => {
              // لنفحص مرة أخرى إذا كان الاتصال لا يزال مقطوعًا
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                if (DEBUG) console.log('[WebRTC] Attempting silent recovery');
                attemptConnectionRecovery();
              }
            }, 1000);
          }
          
          return; // لا تغير الحالة المرئية
        }
        
        // When disconnected and audio not working, wait a moment before trying to recover
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' && !isRestartingIce && connectionRetryCount < MAX_CONNECTION_RETRIES) {
            connectionRetryCount++;
            console.log(`[WebRTC] Connection disconnected, attempting recovery (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
            attemptConnectionRecovery();
          }
        }, 1000); // تقليل وقت الانتظار
      } else if (pc.connectionState === 'closed') {
        stopConnectionHeartbeat();
        stopConnectionMonitoring();
      }
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      if (DEBUG) console.log('[WebRTC] ICE connection state changed:', pc.iceConnectionState);
      
      // Handle specific ICE states
      if (pc.iceConnectionState === 'failed') {
        failureReason = 'ICE connection failed';
        if (!isRestartingIce && connectionRetryCount < MAX_CONNECTION_RETRIES) {
          connectionRetryCount++;
          console.log(`[WebRTC] ICE connection failed, attempting restart (${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
          
          // Restart ICE
          isRestartingIce = true;
          
          // تجربة إعادة تشغيل ICE بعد فترة قصيرة
          setTimeout(async () => {
            if (pc.connectionState !== 'closed') {
              try {
                if (DEBUG) console.log('[WebRTC] Attempting ICE restart');
                
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                
                if (socket.value && partnerId.value) {
                  socket.value.emit('voice-offer', {
                    offer: pc.localDescription,
                    to: partnerId.value
                  });
                }
                
                // Reset the ICE restart flag after some time
                setTimeout(() => {
                  isRestartingIce = false;
                }, 5000);
              } catch (error) {
                console.error('[WebRTC] ICE restart failed:', error);
                isRestartingIce = false;
              }
            } else {
              isRestartingIce = false;
            }
          }, 1000);
        }
      } else if (pc.iceConnectionState === 'connected') {
        // عند الاتصال الناجح، نتحقق من وجود مسارات صوتية
        checkAndFixTracks();
      }
    };
    
    // Handle ICE candidate generation
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        if (DEBUG) console.log('[WebRTC] ICE gathering complete');
        return;
      }
      
      if (DEBUG) console.log('[WebRTC] ICE candidate generated:', event.candidate.candidate);
      
      // Send the ICE candidate to the remote peer if we have a socket and partner
      if (socket.value && partnerId.value) {
        if (DEBUG) console.log('[WebRTC] Sending ICE candidate to partner');
        socket.value.emit('ice-candidate', {
          candidate: event.candidate,
          to: partnerId.value
        });
      }
    };
    
    // Handle ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      if (DEBUG) console.log('[WebRTC] ICE gathering state changed:', pc.iceGatheringState);
    };
    
    // Handle signaling state changes
    pc.onsignalingstatechange = () => {
      if (DEBUG) console.log('[WebRTC] Signaling state changed:', pc.signalingState);
      
      // If signaling state is stable, reset negotiating flag
      if (pc.signalingState === 'stable') {
        isNegotiating = false;
      }
    };
    
    // Update global reference
    globalPeerConnection = pc;
    peerConnection.value = pc;
    
    return pc;
  };
  
  /**
   * Create an offer and send it to the target peer
   */
  const createOffer = async (targetPartnerId: string | null): Promise<any> => {
    // Clear any existing connection timeout
    if ((window as any).__webrtcConnectionTimeout) {
      clearTimeout((window as any).__webrtcConnectionTimeout);
    }
    
    if (!targetPartnerId) {
      const errorMsg = 'Cannot create offer: No target partner ID provided';
      console.error(`[WebRTC] ${errorMsg}`);
      lastConnectionError = errorMsg;
      return { error: errorMsg };
    }
    
    if (!socket.value) {
      const errorMsg = 'Cannot create offer: socket not available';
      console.error(`[WebRTC] ${errorMsg}`);
      lastConnectionError = errorMsg;
      return { error: errorMsg };
    }
    
    // Make sure we have access to the microphone before creating an offer
    if (!globalLocalStream) {
      try {
        if (DEBUG) console.log('[WebRTC] Initializing local stream before creating offer');
        await initializeLocalStream();
      } catch (error) {
        console.error('[WebRTC] Failed to initialize local stream:', error);
        lastConnectionError = `Failed to access microphone: ${error}`;
        return { error: `Failed to access microphone: ${error}` };
      }
    }
    
    if (DEBUG) console.log(`[WebRTC] Creating offer for partner: ${targetPartnerId}`);
    
    // تحقق من وجود تفاوض جارٍ
    if (isNegotiating) {
      console.warn('[WebRTC] Negotiation already in progress, deferring new offer');
      
      // إعادة المحاولة بعد تأخير قصير
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
    globalPartnerId.value = targetPartnerId;
    partnerId.value = targetPartnerId;
    
    try {
      // Store the partner ID
      if (DEBUG) console.log(`[WebRTC] Setting partner ID: ${targetPartnerId}`);
      
      // إعادة تكوين WebRTC للتأكد من أن الاتصال نظيف
      const pc = createPeerConnection();
      
      // إضافة المسارات المحلية
      if (globalLocalStream) {
        if (DEBUG) {
          console.log('[WebRTC] Adding local tracks to connection');
          console.log(`[WebRTC] Local stream has ${globalLocalStream.getTracks().length} tracks`);
        }
        
        // إعادة تعيين المرسلين إذا كانوا موجودين بالفعل
        const localMediaStream: MediaStream = globalLocalStream;
        if (pc.getSenders().length > 0) {
          if (DEBUG) console.log('[WebRTC] Replacing existing senders');
          let i = 0;
          localMediaStream.getTracks().forEach((track: MediaStreamTrack) => {
            if (pc.getSenders()[i]) {
              pc.getSenders()[i].replaceTrack(track);
              i++;
            } else {
              pc.addTrack(track, localMediaStream);
            }
          });
        } else {
          // إضافة المسارات عادية إذا لم تكن موجودة
          localMediaStream.getTracks().forEach((track: MediaStreamTrack) => {
            pc.addTrack(track, localMediaStream);
          });
        }
      } else {
        console.error('[WebRTC] No local stream to add tracks from');
        // حاول الحصول على تدفق محلي مرة أخرى
        await initializeLocalStream();
        if (globalLocalStream) {
          const localMediaStream: MediaStream = globalLocalStream;
          localMediaStream.getTracks().forEach((track: MediaStreamTrack) => {
            pc.addTrack(track, localMediaStream);
          });
        }
      }
      
      // تحديث حالة الاتصال
      globalConnectionState.value = 'connecting';
      connectionState.value = 'connecting';
      
      // إنشاء عرض مع الخيارات المناسبة
      if (DEBUG) console.log('[WebRTC] Creating offer');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      // تعيين الوصف المحلي
      if (DEBUG) console.log('[WebRTC] Setting local description');
      await pc.setLocalDescription(offer);
      
      // إنتظار اكتمال جمع مرشحات ICE
      if (DEBUG) console.log('[WebRTC] Waiting for ICE gathering to complete');
      await waitForIceGatheringComplete(pc);
      
      // إرسال العرض إلى الشريك
      if (socket.value && targetPartnerId) {
        if (DEBUG) console.log('[WebRTC] Sending offer to partner');
        
        // للتوافق مع الخادم الحالي
        socket.value.emit('voice-offer', {
          offer: pc.localDescription,
          to: targetPartnerId
        });
        
        // إضافة إرسال بالتنسيق الجديد
        socket.value.emit('webrtc-signal', {
          type: 'offer',
          offer: pc.localDescription,
          to: targetPartnerId
        });
      }
      
      // إعداد مؤقت للتحقق من نجاح الاتصال
      setupConnectionTimeout(pc);
      
      // بدء مراقبة الاتصال
      startConnectionMonitoring();
      
      if (DEBUG) console.log('[WebRTC] Offer creation complete');
      return { success: true };
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
      lastConnectionError = `Error creating offer: ${error}`;
      isNegotiating = false;
      return { error: `Failed to create offer: ${error}` };
    } finally {
      // Mark that we are done negotiating
      setTimeout(() => {
        isNegotiating = false;
      }, 2000);
    }
  };
  
  // Helper function to wait for ICE gathering to complete
  const waitForIceGatheringComplete = (pc: RTCPeerConnection): Promise<void> => {
    if (pc.iceGatheringState === 'complete') {
      if (DEBUG) console.log('[WebRTC] ICE gathering already complete');
      return Promise.resolve();
    }
    
    return new Promise<void>((resolve) => {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      
      pc.addEventListener('icegatheringstatechange', checkState);
      
      // Set a timeout to resolve anyway after a reasonable time
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        if (DEBUG) console.log('[WebRTC] ICE gathering timed out, but continuing anyway');
        resolve();
      }, 2000);
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
    
    // حالة كتم الصوت
    if (shouldMute) {
      if (DEBUG) console.log('[WebRTC] Muting microphone - stopping all tracks');
      
      // إيقاف مسارات الصوت إذا كانت موجودة
      if (globalLocalStream) {
        globalLocalStream.getAudioTracks().forEach(track => {
          track.stop();
        });
        
        // تصفير المتغيرات العامة
        globalLocalStream = null;
        localStream.value = null;
      }
      
      // تحديث حالة كتم الصوت
      globalIsAudioMuted.value = true;
      
      return false; // الميكروفون الآن مكتوم
    } 
    // حالة إلغاء كتم الصوت
    else {
      if (DEBUG) console.log('[WebRTC] Unmuting microphone - requesting new permission');
      
      try {
        // إلغاء أي stream موجود
        if (globalLocalStream) {
          globalLocalStream.getTracks().forEach(track => track.stop());
          globalLocalStream = null;
          localStream.value = null;
        }
        
        // إجبار المتصفح على طلب إذن جديد
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
        
        return true; // الميكروفون الآن غير مكتوم
      } catch (error) {
        console.error('[WebRTC] Error unmuting microphone:', error);
        
        // في حالة فشل إلغاء كتم الصوت، حاول مرة أخرى بخيارات أبسط
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          globalLocalStream = fallbackStream;
          localStream.value = fallbackStream;
          globalIsAudioMuted.value = false;
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
  };
  
  /**
   * Close and cleanup all media streams
   */
  const cleanup = (): void => {
    if (DEBUG) console.log('[WebRTC] Full cleanup initiated');
    closeConnection();
    
    if (globalLocalStream) {
      if (DEBUG) console.log('[WebRTC] Stopping local stream tracks');
      globalLocalStream.getTracks().forEach(track => {
        track.stop();
      });
      globalLocalStream = null;
      localStream.value = null;
    }
    
    if (DEBUG) console.log('[WebRTC] Cleanup complete');
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

    // معالجة أحداث voice-offer و voice-answer القديمة
    socket.value.off('voice-offer');
    socket.value.off('voice-answer');
    
    socket.value.on('voice-offer', async (data: any) => {
      if (DEBUG) console.log('[WebRTC] Received legacy voice-offer:', data);
      // تحويل إلى صيغة webrtc-signal الجديدة
      await handleOffer(data.offer, data.from);
    });
    
    socket.value.on('voice-answer', async (data: any) => {
      if (DEBUG) console.log('[WebRTC] Received legacy voice-answer:', data);
      // تحويل إلى صيغة الإجابة الجديدة
      await handleAnswer(data.answer);
    });
    
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
    
    // إضافة معالج انقطاع الاتصال
    socket.value.on('partner-disconnected', () => {
      if (DEBUG) console.log('[WebRTC] Partner disconnected');
      
      // إغلاق الاتصال
      closeConnection();
      
      // إعادة ضبط المتغيرات
      globalPartnerId.value = null;
      partnerId.value = null;
      globalConnectionState.value = 'closed';
      isNegotiating = false;
      isRestartingIce = false;
      connectionRetryCount = 0;
    });
  }
  
  // Setup the socket listeners when this hook is used
  setupSocketListeners();
  
  // Clean up resources when component is unmounted
  onUnmounted(() => {
    // We don't close connections here anymore to maintain call during component changes
    // Instead, we just remove our local references
    peerConnection.value = null;
    localStream.value = null;
    remoteStream.value = null;
  });
  
  // دالة لإرسال نبضات اتصال للحفاظ على استقرار الاتصال
  function startConnectionHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    // بدء إرسال نبضات للحفاظ على الاتصال نشطًا
    heartbeatInterval = window.setInterval(() => {
      if (globalPeerConnection && 
          (globalConnectionState.value === 'connected' || 
           globalConnectionState.value === 'connecting')) {
        
        // إنشاء قناة بيانات جديدة كنبضة لإبقاء الاتصال نشطًا
        try {
          const channel = globalPeerConnection.createDataChannel(`heartbeat_${Date.now()}`);
          
          // إغلاق القناة بعد فترة قصيرة
          setTimeout(() => {
            try {
              channel.close();
            } catch (e) {
              // تجاهل أي خطأ عند الإغلاق
            }
          }, 1000);
          
          if (DEBUG) console.log('[WebRTC] Heartbeat sent to keep connection alive');
          
          // إذا كان الاتصال في حالة "جاري الاتصال" لفترة طويلة، إرسال إشعار تشخيصي
          if (globalConnectionState.value === 'connecting' && connectionRetryCount > 3) {
            console.log('[WebRTC] Connection stuck in connecting state. Diagnostic report:');
            console.log(getConnectionDiagnosticReport());
          }
        } catch (e) {
          // تجاهل أخطاء إنشاء قناة البيانات إذا كان الاتصال مغلقًا بالفعل
        }
        
        // التحقق من حالة المسارات
        checkAndFixTracks();
      } else {
        stopConnectionHeartbeat();
      }
    }, HEARTBEAT_INTERVAL) as unknown as number;
  }

  // إيقاف نبضات الاتصال
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
    if (!globalPeerConnection || !globalLocalStream) {
      if (DEBUG) console.log('[WebRTC] No peer connection or local stream to check tracks');
      return;
    }
    
    if (DEBUG) console.log('[WebRTC] Checking audio tracks');
    
    // تحقق من حالة الاتصال
    if (DEBUG) console.log(`[WebRTC] Connection state: ${globalPeerConnection.connectionState}, ICE state: ${globalPeerConnection.iceConnectionState}`);
    
    // التحقق من المسارات المحلية
    const localAudioTracks = globalLocalStream.getAudioTracks();
    if (localAudioTracks.length === 0) {
      if (DEBUG) console.log('[WebRTC] No local audio tracks found, initializing new stream');
      
      // إذا لم تكن هناك مسارات صوتية محلية، نحاول الحصول على تدفق جديد
      initializeLocalStream().then(stream => {
        if (globalPeerConnection && globalPeerConnection.connectionState !== 'closed') {
          // إضافة المسارات إلى الاتصال
          stream.getAudioTracks().forEach(track => {
            if (DEBUG) console.log('[WebRTC] Adding new local track to connection');
            try {
              globalPeerConnection!.addTrack(track, stream);
            } catch (e) {
              // قد يكون السبب أن المسار موجود بالفعل
              console.warn('[WebRTC] Error adding track, might already exist:', e);
            }
          });
          
          // بدء تفاوض جديد لتفعيل المسارات
          if (globalPeerConnection.connectionState === 'connected' && !isNegotiating) {
            if (DEBUG) console.log('[WebRTC] Starting negotiation for new local tracks');
            startNegotiation();
          }
        }
      }).catch(error => {
        console.error('[WebRTC] Failed to initialize new stream:', error);
      });
    } else {
      // التأكد من أن المسارات المحلية مفعلة
      let fixedTracks = false;
      localAudioTracks.forEach(track => {
        if (!track.enabled) {
          if (DEBUG) console.log(`[WebRTC] Enabling local track: ${track.label}`);
          track.enabled = true;
          fixedTracks = true;
        }
        
        if (track.readyState !== 'live') {
          if (DEBUG) console.log(`[WebRTC] Local track ${track.label} not live, state: ${track.readyState}`);
          fixedTracks = true;
        }
      });
      
      // تحديث الحالة
      if (localAudioTracks.some(track => !track.enabled)) {
        globalIsAudioMuted.value = true;
      } else {
        globalIsAudioMuted.value = false;
      }
      
      // إذا تم إصلاح المسارات، نحاول بدء تفاوض جديد
      if (fixedTracks && globalPeerConnection.connectionState === 'connected' && !isNegotiating) {
        if (DEBUG) console.log('[WebRTC] Fixed local tracks, starting negotiation');
        startNegotiation();
      }
    }
    
    // التحقق من المسارات البعيدة
    if (globalRemoteStream) {
      const remoteAudioTracks = globalRemoteStream.getAudioTracks();
      
      if (remoteAudioTracks.length === 0) {
        if (DEBUG) console.log('[WebRTC] No remote audio tracks found, checking receivers');
        
        // التحقق من المستقبلات
        const receivers = globalPeerConnection.getReceivers();
        const audioReceivers = receivers.filter(receiver => 
          receiver.track && 
          receiver.track.kind === 'audio' && 
          receiver.track.readyState === 'live'
        );
        
        if (audioReceivers.length > 0) {
          if (DEBUG) console.log(`[WebRTC] Found ${audioReceivers.length} audio receivers not in stream, adding tracks`);
          
          // إضافة المسارات من المستقبلات إلى التدفق البعيد
          audioReceivers.forEach(receiver => {
            if (receiver.track && !globalRemoteStream!.getTracks().includes(receiver.track)) {
              if (DEBUG) console.log(`[WebRTC] Adding track ${receiver.track.id} to remote stream`);
              try {
                globalRemoteStream!.addTrack(receiver.track);
              } catch (e) {
                console.warn('[WebRTC] Error adding remote track:', e);
              }
            }
          });
          
          // تحديث المكونات بالتدفق الجديد
          remoteStream.value = globalRemoteStream;
          if (DEBUG) console.log('[WebRTC] Updated remote stream with receiver tracks');
        } else if (globalConnectionState.value === 'connected' && !isNegotiating) {
          // لا توجد مسارات في المستقبلات، نحتاج إلى إعادة التفاوض
          if (DEBUG) console.log('[WebRTC] No audio receivers found but connected, trying to renegotiate');
          startNegotiation();
        }
      } else {
        // التأكد من أن المسارات البعيدة مفعلة
        let fixedRemoteTracks = false;
        remoteAudioTracks.forEach(track => {
          if (!track.enabled) {
            if (DEBUG) console.log(`[WebRTC] Enabling remote track: ${track.label}`);
            track.enabled = true;
            fixedRemoteTracks = true;
          }
          
          if (track.readyState !== 'live') {
            if (DEBUG) console.log(`[WebRTC] Remote track ${track.label} not live, state: ${track.readyState}`);
            fixedRemoteTracks = true;
          }
        });
        
        // إذا تم إصلاح المسارات البعيدة، نحدث المكونات
        if (fixedRemoteTracks) {
          remoteStream.value = globalRemoteStream;
          if (DEBUG) console.log('[WebRTC] Updated remote stream after fixing tracks');
        }
      }
    } else if (globalPeerConnection.getReceivers().length > 0) {
      // إذا كان هناك مستقبلات ولكن لا يوجد تدفق بعيد، إنشاء واحد جديد
      if (DEBUG) console.log('[WebRTC] No remote stream but receivers exist, creating new stream');
      
      globalRemoteStream = new MediaStream();
      remoteStream.value = globalRemoteStream;
      
      // إضافة المسارات من المستقبلات
      let addedTracks = false;
      globalPeerConnection.getReceivers().forEach(receiver => {
        if (receiver.track && receiver.track.kind === 'audio') {
          if (DEBUG) console.log(`[WebRTC] Adding track ${receiver.track.id} from receiver to new remote stream`);
          try {
            globalRemoteStream!.addTrack(receiver.track);
            addedTracks = true;
          } catch (e) {
            console.warn('[WebRTC] Error adding track from receiver:', e);
          }
        }
      });
      
      // تحديث المكونات بالتدفق الجديد إذا تم إضافة مسارات
      if (addedTracks) {
        remoteStream.value = globalRemoteStream;
        if (DEBUG) console.log('[WebRTC] Updated components with new remote stream');
      }
    }
    
    // تحديث معلومات التشخيص
    updateDebugInfo();
  }
  
  // استعادة الاتصال بعد انقطاع
  async function attemptConnectionRecovery() {
    if (!globalPeerConnection || !partnerId.value) {
        return;
      }
    
    if (DEBUG) console.log('[WebRTC] Attempting connection recovery');
    
    try {
      // إعادة تشغيل ICE
      if (globalPeerConnection.restartIce) {
        globalPeerConnection.restartIce();
        
        // إعادة تفاوض على الاتصال
        const offer = await globalPeerConnection.createOffer({ iceRestart: true });
        await globalPeerConnection.setLocalDescription(offer);
        
        if (socket.value) {
          socket.value.emit('offer', {
            offer: globalPeerConnection.localDescription,
            to: partnerId.value
          });
        }
      }
    } catch (error) {
      console.error('[WebRTC] Recovery attempt failed:', error);
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
  
  // دالة لمراقبة جودة الاتصال
  function startConnectionMonitoring() {
    if (connectionMonitorInterval) {
      clearInterval(connectionMonitorInterval);
    }
    
    // تتبع مرشحات ICE المحلية والبعيدة للتشخيص
    if (typeof window !== 'undefined') {
      (window as any).__localIceCandidates = [];
      (window as any).__remoteIceCandidates = [];
      (window as any).__iceCandidatePairs = [];
    }
    
    // إضافة مستمع لمرشحات ICE المحلية
    if (globalPeerConnection) {
      globalPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (DEBUG) console.log('[WebRTC] ICE candidate generated:', event.candidate.candidate);
          
          // حفظ المرشح للتشخيص
          if (typeof window !== 'undefined') {
            (window as any).__localIceCandidates = (window as any).__localIceCandidates || [];
            (window as any).__localIceCandidates.push({
              candidate: event.candidate.candidate,
              timestamp: Date.now()
            });
          }
          
          // إرسال المرشح للطرف الآخر
          if (socket.value && partnerId.value) {
            if (DEBUG) console.log('[WebRTC] Sending ICE candidate to partner');
            socket.value.emit('ice-candidate', {
              candidate: event.candidate,
              to: partnerId.value
            });
          }
        }
      };
    }
    
    connectionMonitorInterval = window.setInterval(async () => {
      if (!globalPeerConnection || globalConnectionState.value !== 'connecting' && globalConnectionState.value !== 'connected') {
        stopConnectionMonitoring();
        return;
      }
      
      try {
        // جمع إحصائيات الاتصال
        const stats = await getConnectionStats();
        
        // تتبع أزواج المرشحات ICE
        if (stats && stats.iceCandidatePairs) {
          if (typeof window !== 'undefined') {
            (window as any).__iceCandidatePairs = stats.iceCandidatePairs;
          }
        }
        
        // تحقق من جودة الاتصال
        checkConnectionHealth(stats);
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
    
    // Set a new timeout
    (window as any).__webrtcConnectionTimeout = setTimeout(() => {
      if (pc.connectionState === 'connecting' || pc.connectionState === 'new') {
        if (DEBUG) console.log(`[WebRTC] Connection attempt timed out after ${CONNECTION_TIMEOUT/1000} seconds`);
        
        // جمع معلومات تشخيصية إضافية
        const candidateInfo = {
          localCandidates: (window as any).__localIceCandidates?.length || 0,
          remoteCandidates: (window as any).__remoteIceCandidates?.length || 0,
          iceCandidatePairsCount: (window as any).__iceCandidatePairs?.length || 0
        };
        
        console.log('[WebRTC] Connection diagnostic info:', JSON.stringify(candidateInfo));
        lastConnectionError = `Connection timed out. Local candidates: ${candidateInfo.localCandidates}, Remote: ${candidateInfo.remoteCandidates}`;
        
        // التحقق إذا تم توليد أي مرشحات ICE محلية
        if (candidateInfo.localCandidates === 0) {
          console.error('[WebRTC] No local ICE candidates generated, could be a network/firewall issue');
          lastConnectionError += '. No local candidates - check firewall settings';
        }
        
        // محاولة استخدام خوادم TURN إذا فشلت STUN أو العكس
        if (partnerId.value) {
          if (DEBUG) console.log('[WebRTC] Restarting connection with different servers');
          
          // إغلاق الاتصال الحالي
          closeConnection();
          
          // إنشاء اتصال جديد باستخدام إعدادات مختلفة
          setTimeout(() => {
            if (partnerId.value) {
              // تبديل بين إعدادات الاتصال المختلفة بناءً على المحاولة السابقة
              if (currentRtcConfig === standardRtcConfiguration || currentRtcConfig === fastRtcConfiguration) {
                if (DEBUG) console.log('[WebRTC] Switching to TURN-only configuration');
                currentRtcConfig = turnOnlyRtcConfiguration;
              } else {
                if (DEBUG) console.log('[WebRTC] Switching to standard configuration');
                currentRtcConfig = standardRtcConfiguration;
              }
              createOffer(partnerId.value);
            }
          }, RECONNECT_DELAY);
        }
      }
    }, CONNECTION_TIMEOUT);
  }
  
  // دالة للحصول على تقرير تشخيصي شامل
  function getConnectionDiagnosticReport(): string {
    const peerConn = globalPeerConnection;
    const report = [];
    
    report.push(`Connection State: ${peerConn?.connectionState || 'none'}`);
    report.push(`Signaling State: ${peerConn?.signalingState || 'none'}`);
    report.push(`ICE Connection State: ${peerConn?.iceConnectionState || 'none'}`);
    report.push(`ICE Gathering State: ${peerConn?.iceGatheringState || 'none'}`);
    report.push(`Reconnection Attempts: ${connectionRetryCount}/${MAX_CONNECTION_RETRIES}`);
    report.push(`Last Error: ${lastConnectionError || 'none'}`);
    report.push(`Local Audio Tracks: ${globalLocalStream?.getAudioTracks().length || 0}`);
    report.push(`Remote Audio Tracks: ${globalRemoteStream?.getAudioTracks().length || 0}`);
    report.push(`Local Candidates: ${(window as any).__localIceCandidates?.length || 0}`);
    report.push(`Remote Candidates: ${(window as any).__remoteIceCandidates?.length || 0}`);
    report.push(`Is Negotiating: ${isNegotiating}`);
    report.push(`Is Restarting ICE: ${isRestartingIce}`);
    
    return report.join('\n');
  }
  
  /**
   * معالجة مرشح ICE من النظير البعيد
   */
  const handleIceCandidate = async (candidate: RTCIceCandidate): Promise<void> => {
    if (!globalPeerConnection) {
      if (DEBUG) console.log('[WebRTC] Received ICE candidate but no peer connection exists');
        return;
      }
      
      try {
      if (DEBUG) console.log('[WebRTC] Adding received ICE candidate:', candidate.candidate);
      
      // التحقق من أن الوصف المحلي موجود قبل إضافة المرشحين
      if (!globalPeerConnection.remoteDescription || !globalPeerConnection.localDescription) {
        if (DEBUG) console.log('[WebRTC] Delaying ICE candidate addition until descriptions are set');
        
        // تخزين المرشح للإضافة لاحقًا بعد ضبط الوصف
        setTimeout(async () => {
          if (globalPeerConnection && globalPeerConnection.remoteDescription) {
            if (DEBUG) console.log('[WebRTC] Adding delayed ICE candidate after timeout');
            try {
              await globalPeerConnection.addIceCandidate(candidate);
      } catch (error) {
              console.error('[WebRTC] Error adding delayed ICE candidate:', error);
            }
          }
        }, 1000);
        
        return;
      }
      
      // محاولة إضافة المرشح
      await globalPeerConnection.addIceCandidate(candidate);
      
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
    diagnosticReport
  };
}

// Fix for signaling state check
function isSignalingStateStable(pc: RTCPeerConnection): boolean {
  return pc.signalingState === 'stable';
}

// إضافة دالة للتحقق من إمكانية تعيين الوصف المحلي
function canSetLocalDescription(pc: RTCPeerConnection): boolean {
  return pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer';
}
