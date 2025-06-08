/**
 * تكوينات WebRTC المحسنة
 * 
 * يحتوي هذا الملف على تكوينات مختلفة لـ WebRTC تم تحسينها 
 * لتعمل في ظروف مختلفة من الشبكات
 */

// خوادم TURN مدفوعة وموثوقة (يتطلب تكوين حسابات صالحة)
const TURN_CREDENTIAL_EXPIRY = 86400; // 24 hours
const TURN_USERNAME = `${Date.now() + TURN_CREDENTIAL_EXPIRY}:spacechat`;
const TURN_PASSWORD = 'openrelayproject'; // يجب تغييرها لاحقًا إلى معلومات اعتماد حقيقية

// التكوين القياسي مع مجموعة متوازنة من خوادم STUN/TURN
export const standardRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // خوادم TURN موثوقة للتغلب على NAT
    {
      urls: [
        'turns:global.relay.metered.ca:443', // TURN over TLS
        'turn:global.relay.metered.ca:443?transport=tcp', // TURN over TCP
        'turn:global.relay.metered.ca:80?transport=tcp', // TURN over TCP port 80
        'turn:global.relay.metered.ca:80' // TURN over UDP port 80
      ],
      username: TURN_USERNAME,
      credential: TURN_PASSWORD
    },
    // خوادم TURN موثوقة بديلة
    {
      urls: [
        'turn:relay.metered.ca:80', // TURN over UDP
        'turn:relay.metered.ca:443', // TURN over TCP
        'turns:relay.metered.ca:443' // TURN over TLS
      ],
      username: 'dbc12a',
      credential: 'c84ded89b281ae42'
    },
    // خوادم Twilio كخيار ثالث
    {
      urls: [
        'turn:global.turn.twilio.com:3478?transport=tcp',
        'turn:global.turn.twilio.com:3478?transport=udp',
        'turns:global.turn.twilio.com:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    // خوادم STUN عامة
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }, // خادم Cloudflare STUN
    { urls: 'stun:openrelay.metered.ca:80' }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// تكوين TURN فقط للشبكات الصعبة والجدران النارية المقيدة
export const turnOnlyRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // خيار TURN أول
    {
      urls: [
        'turns:global.relay.metered.ca:443', // TURN over TLS (الأكثر نجاحًا خلف جدران الحماية)
        'turn:global.relay.metered.ca:443?transport=tcp', // TURN over TCP
        'turn:global.relay.metered.ca:80?transport=tcp', // TURN على المنفذ 80
        'turns:relay.metered.ca:443' // نسخة بديلة
      ],
      username: TURN_USERNAME,
      credential: TURN_PASSWORD
    },
    // بديل آخر
    {
      urls: [
        'turn:relay.metered.ca:443?transport=tcp',
        'turns:relay.metered.ca:443'
      ],
      username: 'dbc12a',
      credential: 'c84ded89b281ae42'
    },
    // خيار Twilio كنسخة احتياطية
    {
      urls: [
        'turns:global.turn.twilio.com:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
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
    { urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun.cloudflare.com:3478'
      ]
    },
    {
      urls: [
        'turn:relay.metered.ca:443?transport=tcp',
      ],
      username: 'dbc12a',
      credential: 'c84ded89b281ae42'
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