/**
 * تكوينات WebRTC المحسنة
 * 
 * يحتوي هذا الملف على تكوينات مختلفة لـ WebRTC تم تحسينها 
 * لتعمل في ظروف مختلفة من الشبكات
 */

// التكوين القياسي مع مجموعة متوازنة من خوادم STUN/TURN
export const standardRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // TURN servers first for better NAT traversal
    {
      urls: [
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:443', 
        'turn:openrelay.metered.ca:80',
        'turn:global.turn.twilio.com:3478?transport=tcp',
        'turn:global.turn.twilio.com:3478?transport=udp'
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
    // Free Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Additional free STUN servers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voiparound.com:3478' },
    { urls: 'stun:stun.callwithus.com:3478' }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// تكوين TURN فقط للشبكات الصعبة والجدران النارية المقيدة
export const turnOnlyRtcConfiguration: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:443'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: [
        'turn:global.turn.twilio.com:443?transport=tcp'
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
    }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'relay', // إجبار استخدام خوادم TURN فقط
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// تكوين سريع الاتصال مع عدد أقل من الخوادم للاتصال السريع
export const fastRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 5,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// تكوين محسن للاتصالات المحلية
export const localRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 3,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
}; 