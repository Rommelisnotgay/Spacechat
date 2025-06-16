"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupOldPendingMessages = exports.retryPendingMessages = exports.setupChatEvents = void 0;
const userService_1 = require("../services/userService");
const crypto_1 = __importDefault(require("crypto"));
// تخزين مؤقت للرسائل المرسلة لضمان التسليم
const pendingMessages = new Map();
// فترة إعادة المحاولة بالمللي ثانية
const RETRY_INTERVAL = 10000; // 10 ثواني
// الحد الأقصى لحجم الرسالة بالأحرف
const MAX_MESSAGE_LENGTH = 2000;
// عدد الرسائل المسموح بها في الدقيقة
const MAX_MESSAGES_PER_MINUTE = 30;
// تخزين عدد الرسائل لكل مستخدم
const messageRateLimits = new Map();
// مفتاح سري للتحقق من صحة الرسائل (في بيئة الإنتاج، يجب تخزينه بشكل آمن)
const MESSAGE_SECRET = 'spacetalk-server-verification-key';
// تمكين وضع التصحيح
const DEBUG = true;
/**
 * التحقق من عدد الرسائل المرسلة في الدقيقة
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = messageRateLimits.get(userId);
    if (!userLimit) {
        // أول رسالة للمستخدم
        messageRateLimits.set(userId, {
            count: 1,
            resetTime: now + 60000 // إعادة ضبط بعد دقيقة
        });
        return true;
    }
    // إذا انتهت فترة التقييد، إعادة الضبط
    if (now > userLimit.resetTime) {
        messageRateLimits.set(userId, {
            count: 1,
            resetTime: now + 60000
        });
        return true;
    }
    // زيادة العداد وفحص الحد
    userLimit.count++;
    // إذا تجاوز الحد، رفض الرسالة
    if (userLimit.count > MAX_MESSAGES_PER_MINUTE) {
        console.log(`Rate limit exceeded for user ${userId}: ${userLimit.count} messages in the last minute`);
        return false;
    }
    return true;
}
/**
 * التحقق من صحة الرسالة
 */
function validateMessage(message) {
    // التحقق من وجود الحقول المطلوبة
    if (!message || !message.id) {
        if (DEBUG)
            console.log(`Invalid message: Missing ID`, message);
        return false;
    }
    // Handle both 'text' and 'message' fields for compatibility
    const messageContent = message.text || message.message;
    if (!messageContent) {
        if (DEBUG)
            console.log(`Invalid message: Missing content`, message);
        return false;
    }
    if (!message.to) {
        if (DEBUG)
            console.log(`Invalid message: Missing recipient`, message);
        return false;
    }
    // التحقق من طول الرسالة
    if (messageContent.length > MAX_MESSAGE_LENGTH) {
        if (DEBUG)
            console.log(`Invalid message: Text too long (${messageContent.length} chars)`);
        return false;
    }
    // التحقق من تنسيق المعرف
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(message.id)) {
        if (DEBUG)
            console.log(`Invalid message: Invalid UUID format: ${message.id}`);
        return false;
    }
    // يمكن إضافة المزيد من التحققات هنا
    return true;
}
/**
 * إنشاء توقيع للرسالة للتحقق من صحتها
 */
function createMessageSignature(message) {
    const data = `${message.id}:${message.text}:${message.from}:${message.timestamp}`;
    return crypto_1.default.createHmac('sha256', MESSAGE_SECRET).update(data).digest('hex');
}
/**
 * التحقق من توقيع الرسالة
 */
function verifyMessageSignature(message, signature) {
    const expectedSignature = createMessageSignature(message);
    return expectedSignature === signature;
}
const setupChatEvents = (io, socket) => {
    // اتصال المستخدم بالدردشة
    socket.on('chat-connect', (data) => {
        try {
            console.log('User connected to chat:', socket.data.userId);
            // معالجة اتصال المستخدم بالدردشة
        }
        catch (error) {
            console.error('Error in chat-connect:', error);
        }
    });
    // إرسال رسالة دردشة
    socket.on('chat-message', (message, callback) => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                callback && callback({ success: false, error: 'User not authenticated' });
                return;
            }
            // Normalize the message to always have a text field
            const normalizedMessage = {
                ...message,
                text: message.text || message.message || ''
            };
            if (DEBUG) {
                const messagePreview = normalizedMessage.text ?
                    `${normalizedMessage.text.substring(0, 30)}${normalizedMessage.text.length > 30 ? '...' : ''}` :
                    '[empty message]';
                console.log(`[ChatServer] Received message from ${userId} to ${normalizedMessage.to}: ${messagePreview}`);
            }
            // التحقق من صحة الرسالة
            if (!validateMessage(normalizedMessage)) {
                console.error(`Invalid message format from ${userId}`);
                callback && callback({ success: false, error: 'Invalid message format' });
                return;
            }
            // التحقق من معدل الإرسال
            if (!checkRateLimit(userId)) {
                console.error(`Rate limit exceeded for ${userId}`);
                callback && callback({ success: false, error: 'Rate limit exceeded' });
                return;
            }
            // التحقق من وجود المستخدم المستقبل
            const recipientInfo = userService_1.userService.getUserInfo(normalizedMessage.to);
            if (DEBUG)
                console.log(`[ChatServer] Recipient info for ${normalizedMessage.to}:`, recipientInfo ? 'Found' : 'Not found');
            // إنشاء توقيع للرسالة
            const signature = createMessageSignature({
                id: normalizedMessage.id,
                text: normalizedMessage.text,
                from: userId,
                timestamp: normalizedMessage.timestamp || Date.now()
            });
            // إنشاء كائن الرسالة
            const chatMessage = {
                id: normalizedMessage.id,
                content: normalizedMessage.text,
                sender: userId,
                timestamp: normalizedMessage.timestamp || Date.now(),
                to: normalizedMessage.to,
                signature
            };
            // إضافة الرسالة إلى التخزين المؤقت
            pendingMessages.set(normalizedMessage.id, {
                message: chatMessage,
                attempts: 1,
                timestamp: Date.now()
            });
            // إرسال تأكيد استلام الخادم للرسالة
            callback && callback({ success: true, messageId: normalizedMessage.id });
            if (!recipientInfo) {
                if (DEBUG)
                    console.log(`[ChatServer] Recipient ${normalizedMessage.to} not found or offline, message queued for later delivery`);
                // سنحاول إعادة الإرسال لاحقاً عندما يتصل المستخدم
                return;
            }
            // توجيه الرسالة إلى المستلم
            if (DEBUG) {
                console.log(`[ChatServer] Sending message ${normalizedMessage.id} to socket ${recipientInfo.socketId}`);
                console.log(`[ChatServer] Full message data:`, {
                    id: normalizedMessage.id,
                    text: normalizedMessage.text,
                    from: userId,
                    to: normalizedMessage.to,
                    timestamp: chatMessage.timestamp
                });
            }
            io.to(recipientInfo.socketId).emit('chat-message', {
                id: normalizedMessage.id,
                text: normalizedMessage.text,
                message: normalizedMessage.text,
                from: userId,
                timestamp: chatMessage.timestamp,
                signature
            });
        }
        catch (error) {
            console.error('Error in chat-message:', error);
            callback && callback({ success: false, error: 'Server error' });
        }
    });
    // استلام تأكيد استلام الرسالة
    socket.on('message-received', (data) => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                return;
            }
            // التحقق من صحة المعرف
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(data.id)) {
                console.error(`Invalid message ID format in receipt: ${data.id}`);
                return;
            }
            if (DEBUG)
                console.log(`[ChatServer] Message receipt confirmation from ${userId} for message ${data.id}`);
            // إزالة الرسالة من التخزين المؤقت لأنها تم استلامها
            pendingMessages.delete(data.id);
            // إرسال تأكيد الاستلام إلى المرسل الأصلي
            const senderInfo = userService_1.userService.getUserInfo(data.to);
            if (senderInfo) {
                if (DEBUG)
                    console.log(`[ChatServer] Forwarding receipt to sender ${data.to} via socket ${senderInfo.socketId}`);
                io.to(senderInfo.socketId).emit('message-received', {
                    id: data.id,
                    from: userId
                });
            }
            else {
                if (DEBUG)
                    console.log(`[ChatServer] Sender ${data.to} not found, cannot forward receipt`);
            }
        }
        catch (error) {
            console.error('Error in message-received:', error);
        }
    });
    // استلام تأكيد قراءة الرسالة
    socket.on('message-read', (data) => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                return;
            }
            // التحقق من صحة المعرف
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(data.id)) {
                console.error(`Invalid message ID format in read receipt: ${data.id}`);
                return;
            }
            if (DEBUG)
                console.log(`[ChatServer] Message read confirmation from ${userId} for message ${data.id}`);
            // إرسال تأكيد القراءة إلى المرسل الأصلي
            const senderInfo = userService_1.userService.getUserInfo(data.to);
            if (senderInfo) {
                if (DEBUG)
                    console.log(`[ChatServer] Forwarding read receipt to sender ${data.to} via socket ${senderInfo.socketId}`);
                io.to(senderInfo.socketId).emit('message-read', {
                    id: data.id,
                    from: userId
                });
            }
            else {
                if (DEBUG)
                    console.log(`[ChatServer] Sender ${data.to} not found, cannot forward read receipt`);
            }
        }
        catch (error) {
            console.error('Error in message-read:', error);
        }
    });
    // إرسال إشعار كتابة
    socket.on('typing', (data) => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                return;
            }
            const recipientInfo = userService_1.userService.getUserInfo(data.to);
            if (!recipientInfo) {
                if (DEBUG)
                    console.log(`[ChatServer] Typing recipient ${data.to} not found`);
                return;
            }
            if (DEBUG && data.isTyping)
                console.log(`[ChatServer] User ${userId} is typing to ${data.to}`);
            io.to(recipientInfo.socketId).emit('typing', {
                from: userId,
                isTyping: data.isTyping
            });
        }
        catch (error) {
            console.error('Error in typing notification:', error);
        }
    });
    // إرسال عدد المستخدمين المتصلين لجميع المستخدمين عند اتصال مستخدم جديد
    const count = userService_1.userService.getActiveUsersCount();
    io.emit('online-count', count);
    // طلب تحديث عدد المستخدمين المتصلين
    socket.on('get-online-count', () => {
        try {
            const count = userService_1.userService.getActiveUsersCount();
            socket.emit('online-count', count);
        }
        catch (error) {
            console.error('Error getting online count:', error);
        }
    });
    // طلب الرسائل غير المستلمة
    socket.on('get-pending-messages', () => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                return;
            }
            // البحث عن الرسائل التي تنتظر التسليم لهذا المستخدم
            const pendingForUser = [];
            pendingMessages.forEach((item, messageId) => {
                if (item.message.to === userId) {
                    pendingForUser.push(item.message);
                }
            });
            if (pendingForUser.length > 0) {
                console.log(`Sending ${pendingForUser.length} pending messages to ${userId}`);
                // إرسال الرسائل غير المستلمة للمستخدم
                pendingForUser.forEach(message => {
                    socket.emit('chat-message', {
                        id: message.id,
                        text: message.content,
                        from: message.sender,
                        timestamp: message.timestamp,
                        signature: message.signature
                    });
                });
            }
        }
        catch (error) {
            console.error('Error getting pending messages:', error);
        }
    });
    // تنظيف الرسائل القديمة
    socket.on('cleanup-old-messages', () => {
        try {
            const userId = socket.data.userId;
            if (!userId) {
                console.error('User ID not found in socket data');
                return;
            }
            // هنا يمكن إضافة منطق لتنظيف الرسائل القديمة
            // هذا سيكون مفيداً في حالة تخزين الرسائل في قاعدة بيانات
            socket.emit('cleanup-complete', { success: true });
        }
        catch (error) {
            console.error('Error cleaning up old messages:', error);
        }
    });
};
exports.setupChatEvents = setupChatEvents;
// وظيفة لإعادة إرسال الرسائل غير المستلمة
const retryPendingMessages = (io) => {
    const now = Date.now();
    pendingMessages.forEach((item, messageId) => {
        // إعادة محاولة الإرسال بعد فترة RETRY_INTERVAL
        if (now - item.timestamp >= RETRY_INTERVAL) {
            // الحد الأقصى لعدد المحاولات هو 5
            if (item.attempts >= 5) {
                console.log(`Message ${messageId} exceeded maximum retry attempts, removing from queue`);
                pendingMessages.delete(messageId);
                return;
            }
            // زيادة عدد المحاولات وتحديث وقت المحاولة
            item.attempts += 1;
            item.timestamp = now;
            // التحقق من وجود المستلم
            const recipientInfo = userService_1.userService.getUserInfo(item.message.to);
            if (!recipientInfo) {
                if (DEBUG)
                    console.log(`Recipient ${item.message.to} still not available, will retry later (attempt ${item.attempts})`);
                return;
            }
            if (DEBUG)
                console.log(`Retrying message ${messageId} delivery to ${item.message.to} via socket ${recipientInfo.socketId}, attempt ${item.attempts}`);
            // إعادة إرسال الرسالة
            io.to(recipientInfo.socketId).emit('chat-message', {
                id: item.message.id,
                text: item.message.content,
                from: item.message.sender,
                timestamp: item.message.timestamp,
                signature: item.message.signature
            });
        }
    });
};
exports.retryPendingMessages = retryPendingMessages;
// تنظيف الرسائل القديمة في التخزين المؤقت
const cleanupOldPendingMessages = () => {
    const now = Date.now();
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 أيام
    let cleanedCount = 0;
    pendingMessages.forEach((item, messageId) => {
        if (now - item.timestamp > MAX_AGE) {
            pendingMessages.delete(messageId);
            cleanedCount++;
        }
    });
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old pending messages`);
    }
};
exports.cleanupOldPendingMessages = cleanupOldPendingMessages;
exports.default = (io) => {
    io.on('connection', (socket) => {
        (0, exports.setupChatEvents)(io, socket);
        // When a user connects, check if there are any pending messages for them
        const userId = socket.data.userId;
        if (userId) {
            if (DEBUG)
                console.log(`[ChatServer] User ${userId} connected, checking for pending messages`);
            // Emit an event to trigger the client to request pending messages
            socket.emit('check-pending-messages');
        }
    });
    // إعداد مؤقت لإعادة إرسال الرسائل غير المستلمة
    setInterval(() => {
        (0, exports.retryPendingMessages)(io);
    }, RETRY_INTERVAL);
    // إعداد مؤقت لتنظيف الرسائل القديمة
    setInterval(() => {
        (0, exports.cleanupOldPendingMessages)();
    }, 24 * 60 * 60 * 1000); // مرة واحدة يومياً
};
