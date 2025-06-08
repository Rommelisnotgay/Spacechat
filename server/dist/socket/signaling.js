"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSignalingEvents = void 0;
// Rate limiting and timeout constants
const MIN_RECONNECT_INTERVAL = 0; // Temporarily removing request rate limiting for troubleshooting
const INACTIVE_CONNECTION_TIMEOUT = 300000; // Increased timeout to 5 minutes instead of 1 minute
const MAX_OFFER_RATE = 20; // Increased maximum offers per minute from 10 to 20
// Track offer rates
const offerRates = new Map();
const setupSignalingEvents = (io, socket, activeUsers) => {
    const userId = socket.data.userId;
    // Update user's activity timestamp
    const updateUserActivity = (userId) => {
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            activeUsers.set(userId, {
                ...userInfo,
                lastActivity: Date.now()
            });
        }
    };
    /**
     * التحقق من معدل العروض للتأكد من عدم تجاوز الحد المسموح
     */
    const checkOfferRateLimit = (userId) => {
        // تعطيل تقييد المعدل مؤقتًا لتشخيص المشكلة
        return true; // السماح بجميع العروض بدون تقييد
    };
    /**
     * التحقق من تقييد معدل الطلبات للمستخدم المستهدف
     */
    const isRateLimited = (targetId) => {
        // تعطيل تقييد المعدل مؤقتًا لتشخيص المشكلة
        return false; // لا تقييد للمعدل
    };
    const isTargetConnected = (targetId) => {
        const targetInfo = activeUsers.get(targetId);
        if (!targetInfo)
            return false;
        const targetSocket = io.sockets.sockets.get(targetInfo.socketId);
        return !!targetSocket && targetSocket.connected;
    };
    // Check for and clean up inactive connections
    const cleanupInactiveConnections = () => {
        const now = Date.now();
        activeUsers.forEach((userInfo, id) => {
            // تخطي التنظيف إذا كان المستخدم في عملية توصيل نشطة
            if (userInfo.negotiating) {
                console.log(`Skipping cleanup for user ${id} because they are currently negotiating`);
                return;
            }
            if (userInfo.lastActivity && now - userInfo.lastActivity > INACTIVE_CONNECTION_TIMEOUT) {
                // User has been inactive for too long
                const socket = io.sockets.sockets.get(userInfo.socketId);
                if (socket && socket.connected) {
                    console.log(`Cleaning up inactive user ${id} - last active ${Math.floor((now - userInfo.lastActivity) / 1000)} seconds ago`);
                    // Notify any partners
                    if (userInfo.partnerIds && userInfo.partnerIds.length > 0) {
                        userInfo.partnerIds.forEach(partnerId => {
                            const partnerInfo = activeUsers.get(partnerId);
                            if (partnerInfo) {
                                io.to(partnerInfo.socketId).emit('partner-disconnected', {
                                    from: id,
                                    reason: 'inactivity'
                                });
                                // تحديث قائمة شركاء المستخدم المتصل
                                const updatedPartnerIds = (partnerInfo.partnerIds || []).filter(pid => pid !== id);
                                activeUsers.set(partnerId, {
                                    ...partnerInfo,
                                    partnerIds: updatedPartnerIds
                                });
                            }
                        });
                    }
                    // إرسال إشعار للمستخدم نفسه قبل إزالته
                    socket.emit('connection-timeout', {
                        message: 'Your connection timed out due to inactivity'
                    });
                }
                // إزالة المستخدم من القائمة النشطة بعد إرسال الإشعارات
                activeUsers.delete(id);
            }
        });
    };
    // Set up periodic cleanup
    const cleanupInterval = setInterval(cleanupInactiveConnections, 30000);
    // Make sure cleanup interval is cleared when socket disconnects
    socket.on('disconnect', () => {
        clearInterval(cleanupInterval);
    });
    socket.on('webrtc-signal', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = activeUsers.get(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for WebRTC signal`);
            socket.emit('signaling-error', {
                type: data.type,
                message: 'Target user not found',
                to: data.to
            });
            return;
        }
        // تعطيل تقييد المعدل مؤقتًا
        /*
        if (data.type === 'offer' && isRateLimited(data.to)) {
          console.log(`Rate limited WebRTC offer from ${userId} to ${data.to}`);
          socket.emit('signaling-error', {
            type: data.type,
            message: 'Rate limited',
            to: data.to
          });
          return;
        }
        */
        if (!isTargetConnected(data.to)) {
            console.log(`Target user ${data.to} is no longer connected for WebRTC signal`);
            socket.emit('signaling-error', {
                type: data.type,
                message: 'Target user disconnected',
                to: data.to
            });
            return;
        }
        // Update connection state
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            // Track this partner connection
            const partnerIds = userInfo.partnerIds || [];
            if (!partnerIds.includes(data.to)) {
                partnerIds.push(data.to);
            }
            // تحديث lastOfferTime فقط للعروض وليس لجميع الإشارات
            if (data.type === 'offer') {
                activeUsers.set(userId, {
                    ...userInfo,
                    lastOfferTime: Date.now(),
                    negotiating: true,
                    partnerIds
                });
            }
            else if (data.type === 'answer') {
                // ضبط حالة التفاوض إلى false عند استلام إجابة
                activeUsers.set(userId, {
                    ...userInfo,
                    negotiating: false,
                    partnerIds
                });
                console.log(`WebRTC negotiation completed for user ${userId}`);
            }
            else {
                activeUsers.set(userId, {
                    ...userInfo,
                    negotiating: true,
                    partnerIds
                });
            }
        }
        // Update target user's partner list too
        if (targetUserInfo) {
            const targetPartnerIds = targetUserInfo.partnerIds || [];
            if (!targetPartnerIds.includes(userId)) {
                targetPartnerIds.push(userId);
            }
            // تحديث حالة التفاوض للمستخدم المستهدف عند استلام الإجابة
            if (data.type === 'answer') {
                activeUsers.set(data.to, {
                    ...targetUserInfo,
                    negotiating: false,
                    partnerIds: targetPartnerIds,
                    lastActivity: Date.now()
                });
            }
            else {
                activeUsers.set(data.to, {
                    ...targetUserInfo,
                    partnerIds: targetPartnerIds,
                    lastActivity: Date.now()
                });
            }
        }
        // إرسال الإشارة للمستخدم المستهدف
        io.to(targetUserInfo.socketId).emit('webrtc-signal', {
            type: data.type,
            offer: data.offer,
            answer: data.answer,
            from: userId
        });
        console.log(`WebRTC signal (${data.type}) from ${userId} to ${data.to}`);
        // تقليل المدة الزمنية لإعادة ضبط حالة التفاوض
        if (data.type === 'offer') {
            setTimeout(() => {
                const currentUserInfo = activeUsers.get(userId);
                if (currentUserInfo && currentUserInfo.negotiating) {
                    console.log(`Resetting negotiation flag for user ${userId} after timeout`);
                    activeUsers.set(userId, {
                        ...currentUserInfo,
                        negotiating: false
                    });
                }
            }, 5000); // تقليل المدة من 10000 إلى 5000
        }
    });
    socket.on('answer', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = activeUsers.get(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for answer`);
            socket.emit('signaling-error', {
                type: 'answer',
                message: 'Target user not found',
                to: data.to
            });
            return;
        }
        if (!isTargetConnected(data.to)) {
            console.log(`Target user ${data.to} is no longer connected`);
            socket.emit('signaling-error', {
                type: 'answer',
                message: 'Target user disconnected',
                to: data.to
            });
            return;
        }
        io.to(targetUserInfo.socketId).emit('answer', {
            answer: data.answer,
            from: userId
        });
        console.log(`WebRTC answer from ${userId} to ${data.to}`);
        // Update user state
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            activeUsers.set(userId, {
                ...userInfo,
                negotiating: false
            });
        }
    });
    socket.on('ice-candidate', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = activeUsers.get(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for ICE candidate`);
            return;
        }
        if (!isTargetConnected(data.to)) {
            console.log(`Target user ${data.to} is no longer connected for ICE candidate`);
            return;
        }
        // تحديث نشاط المستخدم المستهدف
        updateUserActivity(data.to);
        // تسجيل معلومات مرشح ICE للتشخيص (فقط للمرشحات المهمة)
        const candidateStr = data.candidate.candidate.toLowerCase();
        if (candidateStr.includes('relay') || candidateStr.includes('srflx')) {
            console.log(`ICE candidate from ${userId} to ${data.to}: ${candidateStr.split(' ')[7]}`);
        }
        io.to(targetUserInfo.socketId).emit('ice-candidate', {
            candidate: data.candidate,
            from: userId
        });
    });
    socket.on('disconnect-from-partner', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = activeUsers.get(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for disconnection`);
            return;
        }
        console.log(`User ${userId} disconnected from partner ${data.to}`);
        // Update user's connection state
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            // Remove the partner from the list
            const partnerIds = userInfo.partnerIds || [];
            const updatedPartnerIds = partnerIds.filter(id => id !== data.to);
            activeUsers.set(userId, {
                ...userInfo,
                negotiating: false,
                lastOfferTime: 0,
                partnerIds: updatedPartnerIds
            });
        }
        // Update target's partner list too
        if (targetUserInfo) {
            const targetPartnerIds = targetUserInfo.partnerIds || [];
            const updatedTargetPartnerIds = targetPartnerIds.filter(id => id !== userId);
            activeUsers.set(data.to, {
                ...targetUserInfo,
                partnerIds: updatedTargetPartnerIds
            });
        }
        io.to(targetUserInfo.socketId).emit('partner-disconnected', {
            from: userId
        });
    });
    // إضافة معالج للإشعار عن فشل توصيل WebRTC
    socket.on('webrtc-connection-failed', (data) => {
        updateUserActivity(userId);
        console.log(`WebRTC connection failed from ${userId} to ${data.to}. Reason: ${data.reason}`);
        // تحديث حالة التفاوض للمستخدم
        const userInfo = activeUsers.get(userId);
        if (userInfo) {
            activeUsers.set(userId, {
                ...userInfo,
                negotiating: false
            });
        }
        // إبلاغ المستخدم المستهدف بفشل الاتصال إذا كان متصلاً
        const targetUserInfo = activeUsers.get(data.to);
        if (targetUserInfo && isTargetConnected(data.to)) {
            io.to(targetUserInfo.socketId).emit('webrtc-connection-failed', {
                from: userId,
                reason: data.reason
            });
        }
    });
    // Set initial activity timestamp
    updateUserActivity(userId);
};
exports.setupSignalingEvents = setupSignalingEvents;
