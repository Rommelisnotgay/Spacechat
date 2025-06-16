import { Server, Socket } from 'socket.io';
import { userService } from '../services/userService';

// Rate limiting and timeout constants
const MIN_RECONNECT_INTERVAL = 500; // زمن الانتظار بين محاولات إعادة الاتصال بالمللي ثانية
const INACTIVE_CONNECTION_TIMEOUT = 300000; // 5 دقائق لمهلة الاتصال غير النشط
const MAX_OFFER_RATE = 20; // الحد الأقصى لعدد العروض في الدقيقة
const MAX_ICE_CANDIDATES = 100; // الحد الأقصى لعدد مرشحات ICE المسموح بها في الدقيقة

// تتبع معدلات الإشارات
const offerRates = new Map<string, number[]>();
const iceCandidateRates = new Map<string, number[]>();

// قائمة بآخر الإشارات المرسلة للتأكد من عدم تكرار الرسائل
const lastSignals = new Map<string, Map<string, { type: string, timestamp: number }>>();

// تخزين وإدارة الاتصالات المنتظرة
const pendingConnections = new Map<string, Set<string>>();

export const setupSignalingEvents = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;
  
  // تحديث وقت نشاط المستخدم
  const updateUserActivity = (userId: string) => {
    userService.updateLastSeen(userId);
  };

  /**
   * التحقق من معدل العروض للتأكد من عدم تجاوز الحد المسموح
   */
  const checkOfferRateLimit = (userId: string): boolean => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (!offerRates.has(userId)) {
      offerRates.set(userId, [now]);
      return true;
    }
    
    const userOfferTimes = offerRates.get(userId)!;
    // تنظيف القائمة من القيم القديمة
    const recentOffers = userOfferTimes.filter(time => time > oneMinuteAgo);
    offerRates.set(userId, recentOffers);
    
    return recentOffers.length <= MAX_OFFER_RATE;
  };
  
  /**
   * تحقق من معدل مرشحات ICE
   */
  const checkIceCandidateRateLimit = (userId: string): boolean => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (!iceCandidateRates.has(userId)) {
      iceCandidateRates.set(userId, [now]);
      return true;
    }
    
    const userCandidateTimes = iceCandidateRates.get(userId)!;
    // تنظيف القائمة من القيم القديمة
    const recentCandidates = userCandidateTimes.filter(time => time > oneMinuteAgo);
    iceCandidateRates.set(userId, recentCandidates);
    
    // تحديث القائمة بالوقت الحالي
    if (recentCandidates.length <= MAX_ICE_CANDIDATES) {
      recentCandidates.push(now);
      return true;
    }
    
    return false;
  };
  
  /**
   * التحقق من تقييد معدل الطلبات للمستخدم المستهدف
   */
  const isRateLimited = (targetId: string): boolean => {
    const targetInfo = userService.getUserInfo(targetId);
    if (!targetInfo) return true; // اعتبر الطلب محدودًا إذا لم يكن المستخدم موجودًا
    
    const now = Date.now();
    const lastActivity = userService.getLastActivity(targetId);
    
    if (!lastActivity) return true; // إذا لم يكن هناك نشاط مسجل
    
    // مقدار الوقت منذ آخر نشاط
    const timeSinceLastActivity = now - lastActivity;
    
    // ضمان وجود حد أدنى من الوقت بين طلبات الاتصال
    return timeSinceLastActivity < MIN_RECONNECT_INTERVAL;
  };
  
  /**
   * تحقق من اتصال المستخدم المستهدف
   */
  const isTargetConnected = (targetId: string): boolean => {
    const targetInfo = userService.getUserInfo(targetId);
    if (!targetInfo) return false;
    
    const targetSocket = io.sockets.sockets.get(targetInfo.socketId);
    return !!targetSocket && targetSocket.connected;
  };
  
  /**
   * تسجيل إشارة لمستخدم لتجنب التكرار
   */
  const recordSignal = (from: string, to: string, type: string): boolean => {
    const now = Date.now();
    
    if (!lastSignals.has(from)) {
      lastSignals.set(from, new Map<string, { type: string, timestamp: number }>());
    }
    
    const userSignals = lastSignals.get(from)!;
    const signalKey = `${to}-${type}`;
    const lastSignal = userSignals.get(signalKey);
    
    // تجنب تكرار نفس النوع من الإشارات في فترة قصيرة
    if (lastSignal && lastSignal.type === type && now - lastSignal.timestamp < 300) {
      return false; // لا ترسل إشارات متكررة في فترة قصيرة جدًا
    }
    
    userSignals.set(signalKey, { type, timestamp: now });
    return true;
  };
  
  // إضافة اتصال قيد الانتظار
  const addPendingConnection = (from: string, to: string) => {
    if (!pendingConnections.has(from)) {
      pendingConnections.set(from, new Set<string>());
    }
    pendingConnections.get(from)!.add(to);
    
    // أيضًا إضافة الاتصال في الاتجاه الآخر
    if (!pendingConnections.has(to)) {
      pendingConnections.set(to, new Set<string>());
    }
    pendingConnections.get(to)!.add(from);
  };
  
  // إزالة اتصال من قائمة الانتظار
  const removePendingConnection = (from: string, to: string) => {
    if (pendingConnections.has(from)) {
      pendingConnections.get(from)!.delete(to);
    }
    if (pendingConnections.has(to)) {
      pendingConnections.get(to)!.delete(from);
    }
  };
  
  // تحقق مما إذا كان هناك اتصال قيد الانتظار
  const hasPendingConnection = (from: string, to: string): boolean => {
    return pendingConnections.has(from) && pendingConnections.get(from)!.has(to);
  };
  
  // مناولة إشارات WebRTC
  socket.on('webrtc-signal', (data: { type: string, offer?: RTCSessionDescriptionInit, answer?: RTCSessionDescriptionInit, to: string }, callback?: (response: {success: boolean, message?: string}) => void) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    
    if (!targetUserInfo) {
      console.log(`Target user ${data.to} not found for WebRTC signal`);
      if (callback) {
        callback({ success: false, message: 'Target user not found' });
      } else {
        socket.emit('signaling-error', { 
          type: data.type, 
          message: 'Target user not found',
          to: data.to
        });
      }
      return;
    }
    
    if (!isTargetConnected(data.to)) {
      console.log(`Target user ${data.to} is no longer connected for WebRTC signal`);
      if (callback) {
        callback({ success: false, message: 'Target user disconnected' });
      } else {
        socket.emit('signaling-error', { 
          type: data.type, 
          message: 'Target user disconnected',
          to: data.to
        });
      }
      return;
    }
    
    // تحقق من معدل العروض للحد من إساءة الاستخدام
    if (data.type === 'offer') {
      if (!checkOfferRateLimit(userId)) {
        console.log(`Rate limit exceeded for ${userId} sending offers`);
        if (callback) {
          callback({ success: false, message: 'Rate limit exceeded' });
        } else {
          socket.emit('signaling-error', { 
            type: data.type, 
            message: 'Rate limit exceeded',
            to: data.to
          });
        }
        return;
      }
      
      // تسجيل الاتصال قيد الانتظار
      addPendingConnection(userId, data.to);
    }
    
    // إذا كانت الإجابة، أزل الاتصال من قائمة الانتظار
    if (data.type === 'answer') {
      removePendingConnection(userId, data.to);
    }
    
    // تجنب تكرار الإشارات المتطابقة
    if (!recordSignal(userId, data.to, data.type)) {
      if (callback) {
        callback({ success: true, message: 'Duplicate signal ignored' });
      }
      return;
    }
    
    // إرسال الإشارة للمستخدم المستهدف
    io.to(targetUserInfo.socketId).emit('webrtc-signal', {
      type: data.type,
      offer: data.offer,
      answer: data.answer,
      from: userId
    });
    
    console.log(`WebRTC ${data.type} forwarded from ${userId} to ${data.to}`);
    if (callback) {
      callback({ success: true });
    }
  });
  
  // مناولة مرشحات ICE
  socket.on('webrtc-ice', (data: { candidate: RTCIceCandidateInit, to: string }, callback?: (response: {success: boolean, message?: string}) => void) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    
    if (!targetUserInfo) {
      console.log(`Target user ${data.to} not found for ICE candidate`);
      if (callback) {
        callback({ success: false, message: 'Target user not found' });
      }
      return;
    }
    
    if (!isTargetConnected(data.to)) {
      console.log(`Target user ${data.to} is no longer connected for ICE candidate`);
      if (callback) {
        callback({ success: false, message: 'Target user disconnected' });
      }
      return;
    }
    
    // تحقق من معدل إرسال المرشحات
    if (!checkIceCandidateRateLimit(userId)) {
      console.log(`ICE candidate rate limit exceeded for ${userId}`);
      if (callback) {
        callback({ success: false, message: 'Rate limit exceeded' });
      }
      return;
    }
    
    // إرسال مرشح ICE للمستخدم المستهدف
    io.to(targetUserInfo.socketId).emit('webrtc-ice', {
      candidate: data.candidate,
      from: userId
    });
    
    if (callback) {
      callback({ success: true });
    }
  });
  
  // مناولة تغيير حالة الاتصال
  socket.on('webrtc-connection-state', (data: { state: string, to: string }) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    
    if (!targetUserInfo) {
      return; // Target user not found, silently ignore
    }
    
    // إذا كانت الحالة "connected" أو "completed"، أزل من قائمة الانتظار
    if (data.state === 'connected' || data.state === 'completed') {
      removePendingConnection(userId, data.to);
    }
    
    io.to(targetUserInfo.socketId).emit('webrtc-connection-state', {
      state: data.state,
      from: userId
    });
    
    console.log(`WebRTC connection state "${data.state}" from ${userId} to ${data.to}`);
  });
  
  // طلب استكشاف أخطاء الصوت
  socket.on('audio-troubleshoot-request', (data: { to: string }) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    if (!targetUserInfo) return;
    
    io.to(targetUserInfo.socketId).emit('audio-troubleshoot-request', {
      from: userId
    });
    
    console.log(`Audio troubleshoot request from ${userId} to ${data.to}`);
  });
  
  // تغيير تكوين ICE
  socket.on('ice-config-change', (data: { to: string, config: string }) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    if (!targetUserInfo) return;
    
    io.to(targetUserInfo.socketId).emit('ice-config-change', {
      from: userId,
      config: data.config
    });
    
    console.log(`ICE config change (${data.config}) from ${userId} to ${data.to}`);
  });
  
  // استعداد للمكالمة
  socket.on('ready-for-call', (data: { to: string }) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    
    if (!targetUserInfo) {
      console.log(`Target user ${data.to} not found for ready-for-call`);
      return;
    }
    
    if (!isTargetConnected(data.to)) {
      console.log(`Target user ${data.to} is no longer connected for ready-for-call`);
      return;
    }
    
    io.to(targetUserInfo.socketId).emit('ready-for-call', {
      from: userId
    });
    
    console.log(`Ready for call signal from ${userId} to ${data.to}`);
  });
  
  // إعادة اتصال Socket
  socket.on('socket-reconnect', (data: { prevSocketId: string }) => {
    updateUserActivity(userId);
    console.log(`Socket reconnect: ${userId} (previous socket: ${data.prevSocketId})`);
  });
  
  // طلب إعادة اتصال WebRTC
  socket.on('webrtc-reconnect', (data: { to: string, details?: any }) => {
    updateUserActivity(userId);
    
    const targetUserInfo = userService.getUserInfo(data.to);
    if (!targetUserInfo) return;
    
    io.to(targetUserInfo.socketId).emit('webrtc-reconnect', {
      from: userId,
      details: data.details
    });
    
    console.log(`WebRTC reconnect request from ${userId} to ${data.to}`);
  });
  
  // تنظيف عند فصل المستخدم
  socket.on('disconnect', () => {
    // إزالة الاتصالات قيد الانتظار
    if (pendingConnections.has(userId)) {
      for (const targetId of pendingConnections.get(userId)!) {
        const targetInfo = userService.getUserInfo(targetId);
        if (targetInfo) {
          io.to(targetInfo.socketId).emit('webrtc-connection-state', {
            state: 'disconnected',
            from: userId
          });
        }
      }
      pendingConnections.delete(userId);
    }
    
    // تنظيف معدلات العروض والمرشحات
    offerRates.delete(userId);
    iceCandidateRates.delete(userId);
    lastSignals.delete(userId);
  });
};
