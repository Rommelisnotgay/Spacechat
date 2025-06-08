import { ref, onUnmounted, shallowRef, watch, computed } from 'vue';
import { useSocket } from './socket';
import { Socket } from 'socket.io-client';
import { 
  standardRtcConfiguration, 
  fastRtcConfiguration, 
  turnOnlyRtcConfiguration, 
  localRtcConfiguration
} from './rtc-configurations';

interface ConnectionPreferences {
  vibe?: string;
  language?: string;
  preferSameLanguage?: boolean;
}

// Use standard configuration by default
let currentRtcConfig: RTCConfiguration = standardRtcConfiguration;
const rtcConfiguration = currentRtcConfig;

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
const MAX_CONNECTION_RETRIES = 15; // Increased number of attempts from 10 to 15
let pendingCandidates: RTCIceCandidate[] = []; // List of pending ICE candidates

// Adding stability variables
let heartbeatInterval: number | null = null;
let trackCheckInterval: number | null = null;
let connectionMonitorInterval: number | null = null;
const HEARTBEAT_INTERVAL = 5000; // Increased from 3000 to 5000
const TRACK_CHECK_INTERVAL = 5000; // Increased from 3000 to 5000
const CONNECTION_MONITOR_INTERVAL = 8000; // Increased from 5000 to 8000
const CONNECTION_STABILITY_THRESHOLD = 15000; // Increased from 10000 to 15000 seconds before considering the connection stable

// Add constants for connection timeouts
const CONNECTION_TIMEOUT = 15000; // Increased from 8000 to 15000
const RECONNECT_DELAY = 1000; // Increased from 500 to 1000

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
    return 'لا يوجد اتصال نظير إلى نظير. جرب تحديث الصفحة أو افحص إعدادات المتصفح.';
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
  
  // Check candidate types to diagnose NAT/firewall issues
  const candidateInfo = {
    localCandidates: (window as any).__localIceCandidates?.length || 0,
    remoteCandidates: (window as any).__remoteIceCandidates?.length || 0,
    hasLocalRelay: false,
    hasRemoteRelay: false,
    hasLocalServerReflexive: false,
    hasRemoteServerReflexive: false
  };
  
  // Check if we have TURN candidates (relay) which are critical for NAT traversal
  if ((window as any).__localIceCandidates) {
    for (const candidate of (window as any).__localIceCandidates) {
      if (candidate.candidate.includes('typ relay')) {
        candidateInfo.hasLocalRelay = true;
      }
      if (candidate.candidate.includes('typ srflx')) {
        candidateInfo.hasLocalServerReflexive = true;
      }
    }
  }
  
  if ((window as any).__remoteIceCandidates) {
    for (const candidate of (window as any).__remoteIceCandidates) {
      if (candidate.candidate.includes('typ relay')) {
        candidateInfo.hasRemoteRelay = true;
      }
      if (candidate.candidate.includes('typ srflx')) {
        candidateInfo.hasRemoteServerReflexive = true;
      }
    }
  }
  
  // Provide specific diagnostic based on connection state and candidates
  switch (state) {
    case 'new':
      return 'الاتصال قيد الإعداد. يرجى الانتظار...';
    case 'connecting':
      // Provide more specific info about the connection attempt
      if (candidateInfo.localCandidates === 0) {
        return 'لم يتم توليد مرشحات ICE المحلية. قد تكون هناك مشكلة في الاتصال بالإنترنت أو إعدادات جدار الحماية.';
      }
      
      if (!candidateInfo.hasLocalRelay && !candidateInfo.hasLocalServerReflexive) {
        return 'لم يتم توليد مرشحات STUN/TURN. تأكد من أن منفذ UDP 19302 غير محظور في جدار الحماية.';
      }
      
      if (candidateInfo.localCandidates > 0 && candidateInfo.remoteCandidates === 0) {
        return 'تم توليد مرشحات ICE المحلية ولكن لم يتم استلام مرشحات من الطرف الآخر بعد. تأكد من وجود الطرف الآخر على الاتصال.';
      }
      
      return 'يتم إنشاء الاتصال. قد يستغرق هذا بعض الوقت حسب إعدادات الشبكة.';
    case 'connected':
      return 'تم الاتصال بنجاح! إذا كنت لا تسمع الطرف الآخر، تأكد من تشغيل الصوت في متصفحك.';
    case 'disconnected':
      return 'انقطع الاتصال مؤقتًا. جار محاولة إعادة الاتصال...';
    case 'failed':
      // More detailed failure diagnosis
      if (!candidateInfo.hasLocalRelay && !candidateInfo.hasRemoteRelay) {
        return 'فشل الاتصال. لم يتم استخدام خوادم TURN. هذا يشير إلى مشكلة في جدار الحماية أو تكوين NAT. حاول الاتصال من شبكة أخرى.';
      }
      
      if (candidateInfo.hasLocalRelay && candidateInfo.hasRemoteRelay) {
        return 'فشل الاتصال رغم وجود مرشحات TURN. قد يكون هناك مشكلة في الشبكة أو تعطل في خدمة TURN.';
      }
      
      return 'فشل الاتصال. يرجى تحديث الصفحة أو إعادة تشغيل الاتصال.';
    case 'closed':
      return 'تم إغلاق الاتصال. يمكنك تحديث الصفحة للمحاولة مرة أخرى.';
    default:
      return `حالة الاتصال غير معروفة: ${state}. يرجى إعادة تحميل الصفحة.`;
  }
}

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
      // Create a new RTCPeerConnection with our configuration
    const pc = new RTCPeerConnection(rtcConfiguration);
    
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
          
          updateGlobalState('connected');
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
          if (pc.iceConnectionState === 'failed') {
            failureReason = 'ICE connection failed';
            console.error('[WebRTC] ICE Connection failed');
          }
          
          if (pc.iceConnectionState !== 'closed') {
            // Attempt recovery if we're not explicitly closed
            // Don't attempt recovery if we're already trying to restart
            if (!isRestartingIce && connectionRetryCount < MAX_CONNECTION_RETRIES) {
              console.log(`[WebRTC] Attempting ICE restart, attempt ${connectionRetryCount + 1} of ${MAX_CONNECTION_RETRIES}`);
              attemptConnectionRecovery();
            } else if (connectionRetryCount >= MAX_CONNECTION_RETRIES) {
              console.error('[WebRTC] Max connection retry attempts reached, giving up');
              updateGlobalState('failed');
              
              // Force a new connection instead of trying to recover this one
              connectionRetryCount = 0;
              failureReason = 'Max retries reached, connection failed';
              closeConnection();
            }
        } else {
            updateGlobalState('closed');
          }
        }

        // Update unified state variable
        globalConnectionState.value = pc.iceConnectionState;
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
        }
        
        // Add the track to the stream
        globalRemoteStream.addTrack(event.track);
        
        // Log track stats
        if (DEBUG) {
          event.track.onunmute = () => {
            console.log('[WebRTC] Track unmuted:', event.track.kind);
          };
          
          event.track.onmute = () => {
            console.log('[WebRTC] Track muted:', event.track.kind);
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
      
      // استخدام Trickle ICE بدلاً من انتظار اكتمال التجميع
      // سيتم إرسال العرض فورًا وإرسال مرشحات ICE لاحقًا عند توليدها
      if (socket.value && targetPartnerId) {
        if (DEBUG) console.log('[WebRTC] Sending immediate offer using Trickle ICE');
        
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
      
      // تقليل وقت الانتظار من 2000 إلى 1000 مللي ثانية
      // سيتم المتابعة حتى لو لم تكتمل عملية التجميع
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        if (DEBUG) console.log('[WebRTC] ICE gathering timed out, but continuing anyway');
        resolve();
      }, 1000);
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
      
      // Store remote candidates for diagnostics
      if (!(window as any).__remoteIceCandidates) {
        (window as any).__remoteIceCandidates = [];
      }
      (window as any).__remoteIceCandidates.push(candidate);
      
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
