"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSignalingEvents = void 0;
const userService_1 = require("../services/userService");
// Rate limiting and timeout constants
const MIN_RECONNECT_INTERVAL = 0; // Temporarily removing request rate limiting for troubleshooting
const INACTIVE_CONNECTION_TIMEOUT = 300000; // Increased timeout to 5 minutes instead of 1 minute
const MAX_OFFER_RATE = 20; // Increased maximum offers per minute from 10 to 20
// Track offer rates
const offerRates = new Map();
const setupSignalingEvents = (io, socket) => {
    const userId = socket.data.userId;
    // Update user's activity timestamp
    const updateUserActivity = (userId) => {
        userService_1.userService.updateLastSeen(userId);
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
        const targetInfo = userService_1.userService.getUserInfo(targetId);
        if (!targetInfo)
            return false;
        const targetSocket = io.sockets.sockets.get(targetInfo.socketId);
        return !!targetSocket && targetSocket.connected;
    };
    // Check for and clean up inactive connections - مشكلة: هذه مسؤولية userService الآن
    // يمكن إزالة هذا الكود بأمان لأن userService تدير تنظيف المستخدمين غير النشطين
    socket.on('webrtc-signal', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = userService_1.userService.getUserInfo(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for WebRTC signal`);
            socket.emit('signaling-error', {
                type: data.type,
                message: 'Target user not found',
                to: data.to
            });
            return;
        }
        if (!isTargetConnected(data.to)) {
            console.log(`Target user ${data.to} is no longer connected for WebRTC signal`);
            socket.emit('signaling-error', {
                type: data.type,
                message: 'Target user disconnected',
                to: data.to
            });
            return;
        }
        // Forward the signal to the target user
        io.to(targetUserInfo.socketId).emit('webrtc-signal', {
            type: data.type,
            offer: data.offer,
            answer: data.answer,
            from: userId
        });
        console.log(`WebRTC ${data.type} forwarded from ${userId} to ${data.to}`);
    });
    // ICE candidate exchange
    socket.on('webrtc-ice', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = userService_1.userService.getUserInfo(data.to);
        if (!targetUserInfo) {
            console.log(`Target user ${data.to} not found for ICE candidate`);
            return;
        }
        if (!isTargetConnected(data.to)) {
            console.log(`Target user ${data.to} is no longer connected for ICE candidate`);
            return;
        }
        io.to(targetUserInfo.socketId).emit('webrtc-ice', {
            candidate: data.candidate,
            from: userId
        });
        console.log(`ICE candidate forwarded from ${userId} to ${data.to}`);
    });
    // Connection state change
    socket.on('webrtc-connection-state', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = userService_1.userService.getUserInfo(data.to);
        if (!targetUserInfo) {
            return; // Target user not found, silently ignore
        }
        io.to(targetUserInfo.socketId).emit('webrtc-connection-state', {
            state: data.state,
            from: userId
        });
        console.log(`WebRTC connection state "${data.state}" from ${userId} to ${data.to}`);
    });
    // User is ready to start a call
    socket.on('ready-for-call', (data) => {
        updateUserActivity(userId);
        const targetUserInfo = userService_1.userService.getUserInfo(data.to);
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
    // Socket reconnect
    socket.on('socket-reconnect', (data) => {
        updateUserActivity(userId);
        console.log(`Socket reconnect: ${userId} (previous socket: ${data.prevSocketId})`);
    });
};
exports.setupSignalingEvents = setupSignalingEvents;
