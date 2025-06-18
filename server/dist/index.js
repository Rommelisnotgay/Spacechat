"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const signaling_1 = require("./socket/signaling");
const chat_1 = require("./socket/chat");
const games_1 = require("./socket/games");
const geo_location_1 = require("./services/geo-location");
const userService_1 = require("./services/userService");
const gameService_1 = require("./services/gameService");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
// الحصول على أصول CORS المسموح بها
const getAllowedOrigins = () => {
    return '*'; // السماح لأي origin بالوصول
};
// دالة إنشاء وإرجاع السيرفر لاستخدامه في وضع العنقود
function createServer(config = {}) {
    // تهيئة تطبيق Express مع إعدادات محسنة
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');
    app.use(express_1.default.json({ limit: '1mb' }));
    // إنشاء خادم HTTP مع زيادة المهلة
    const server = http_1.default.createServer({
        keepAlive: true,
        keepAliveTimeout: 65000,
        headersTimeout: 66000,
    }, app);
    // خيارات Socket.IO الأساسية
    const socketOptions = {
        cors: {
            origin: '*', // السماح لأي origin بالوصول
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 60000,
        connectTimeout: 45000,
        maxHttpBufferSize: 1e6,
        allowEIO3: true,
        perMessageDeflate: {
            threshold: 1024,
        },
        ...(config.socketOpts || {})
    };
    // إنشاء خادم Socket.IO
    const io = new socket_io_1.Server(server, socketOptions);
    // تعيين مثيل Socket.IO في الخدمات
    userService_1.userService.setSocketServer(io);
    gameService_1.gameService.setSocketServer(io);
    // الوسائط
    app.use((0, cors_1.default)({
        origin: '*', // السماح لأي origin بالوصول
        credentials: true
    }));
    // زيادة حد محلل الجسم
    app.use(express_1.default.json({ limit: '1mb' }));
    // تحديد معدل بسيط في الذاكرة للواجهات البرمجية
    const apiLimiter = {
        windowMs: 60000,
        maxRequests: 120,
        clients: new Map()
    };
    // وسيط تحديد المعدل
    app.use((req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        if (apiLimiter.clients.has(ip)) {
            const client = apiLimiter.clients.get(ip);
            if (client.resetTime < now) {
                client.count = 0;
                client.resetTime = now + apiLimiter.windowMs;
            }
            if (client.count >= apiLimiter.maxRequests) {
                return res.status(429).json({ error: "Too many requests" });
            }
            client.count++;
        }
        else {
            apiLimiter.clients.set(ip, {
                count: 1,
                resetTime: now + apiLimiter.windowMs
            });
        }
        next();
    });
    // تعريف مسارات API
    app.get('/api/stats', (req, res) => {
        res.json({
            online: userService_1.userService.getActiveUsersCount(),
            inQueue: userService_1.userService.getQueueLength(),
            // معلومات النظام الإضافية لمراقبة الأداء
            system: {
                cpus: os_1.default.cpus().length,
                memory: {
                    total: os_1.default.totalmem(),
                    free: os_1.default.freemem(),
                    usage: (1 - os_1.default.freemem() / os_1.default.totalmem()) * 100
                },
                uptime: os_1.default.uptime(),
                loadAvg: os_1.default.loadavg(),
                processId: process.pid
            }
        });
    });
    // نقطة نهاية API للحصول على جميع البلدان المتاحة
    app.get('/api/countries', (req, res) => {
        res.json((0, geo_location_1.getAllCountries)());
    });
    // نقطة نهاية API لبيانات اعتماد خادم TURN
    app.get('/api/turn-credentials', (req, res) => {
        // بيانات TURN/STUN مجانية وموثوقة
        res.json({
            success: true,
            rtcConfig: {
                iceServers: [
                    {
                        urls: [
                            'stun:stun.l.google.com:19302',
                            'stun:stun1.l.google.com:19302',
                            'stun:stun2.l.google.com:19302',
                            'stun:stun3.l.google.com:19302',
                            'stun:stun4.l.google.com:19302',
                            'stun:stun.cloudflare.com:3478',
                            'turn:openrelay.metered.ca:80',
                            'turn:openrelay.metered.ca:443',
                            'turns:openrelay.metered.ca:443',
                            'turn:global.relay.metered.ca:80',
                            'turn:global.relay.metered.ca:443',
                            'turns:global.relay.metered.ca:443'
                        ],
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ],
                iceCandidatePoolSize: 15,
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            }
        });
    });
    // تقديم الملفات الثابتة من مجلد dist للعميل في الإنتاج
    if (true) { // دائماً وضع الإنتاج
        // إضافة تحكم في التخزين المؤقت للأصول الثابتة
        app.use(express_1.default.static(path_1.default.join(__dirname, '../../client/dist'), {
            maxAge: '1d',
            etag: true,
            lastModified: true
        }));
        // مسارات API التي يجب أن تعمل في الإنتاج
        app.get('/api/status', (req, res) => {
            res.send('SpaceChat.live Server is running');
        });
        // التعامل مع توجيه SPA - يجب أن يكون بعد مسارات API
        app.get('*', (req, res) => {
            res.sendFile(path_1.default.join(__dirname, '../../client/dist/index.html'));
        });
    }
    else {
        // مسارات للتطوير فقط
        app.get('/', (req, res) => {
            res.send('SpaceChat.live Server is running');
        });
    }
    // عداد الاتصال
    let connectionCount = 0;
    const connectionCounterReset = setInterval(() => {
        connectionCount = 0;
    }, 60000);
    // معالج اتصال Socket.io
    io.on('connection', async (socket) => {
        connectionCount++;
        if (connectionCount > 180) {
            console.log(`High connection rate: ${connectionCount} connections in the last minute`);
        }
        const queryUserId = socket.handshake.query.userId;
        const userId = queryUserId || socket.id;
        const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
        try {
            const location = await (0, geo_location_1.getLocationFromIp)(clientIp);
            const userInfo = userService_1.userService.addOrUpdateUser(userId, socket.id, location || undefined);
            setupSocketEvents();
        }
        catch (error) {
            setupSocketEvents();
        }
        function setupSocketEvents() {
            socket.data.userId = userId;
            socket.on('disconnect', () => {
                const userInfo = userService_1.userService.getUserInfo(userId);
                if (userInfo && socket.data.partnerId) {
                    const partnerInfo = userService_1.userService.getUserInfo(socket.data.partnerId);
                    if (partnerInfo && io) {
                        io.to(partnerInfo.socketId).emit('partner-disconnected');
                    }
                }
                userService_1.userService.removeUser(userId);
            });
            socket.on('heartbeat', () => {
                userService_1.userService.updateLastSeen(userId);
            });
            socket.on('user-activity', () => {
                userService_1.userService.updateLastSeen(userId);
            });
            socket.on('set-nickname', (nickname) => {
                if (typeof nickname === 'string' && nickname.trim().length > 0) {
                    const userInfo = userService_1.userService.getUserInfo(userId);
                    if (userInfo) {
                        userInfo.nickname = nickname.trim().substring(0, 20);
                    }
                }
            });
            socket.on('join-queue', (data) => {
                let vibe = 'general';
                if (typeof data.vibe === 'string' && data.vibe.trim().length > 0) {
                    vibe = data.vibe.trim();
                }
                const success = userService_1.userService.addUserToQueue(userId, vibe, data.preferences);
                if (success) {
                    socket.emit('queue-joined');
                }
                else {
                    socket.emit('queue-join-failed', { reason: 'rate-limited' });
                }
                userService_1.userService.processQueue(io);
            });
            socket.on('leave-queue', () => {
                const removed = userService_1.userService.removeUserFromQueue(userId);
                if (removed) {
                    socket.emit('queue-left');
                }
            });
            (0, signaling_1.setupSignalingEvents)(io, socket);
            (0, chat_1.setupChatEvents)(io, socket);
            (0, games_1.setupGameEvents)(io, socket);
            socket.emit('user-info', { userId });
            socket.emit('online-count', userService_1.userService.getActiveUsersCount());
        }
    });
    // تنظيف دوري أكثر كفاءة - معدل معالجة مخفض للتعامل مع 200 رسالة/ثانية
    setInterval(() => {
        userService_1.userService.processQueue(io);
    }, 2000);
    // تنظيف GC كل 30 دقيقة لمنع تسريبات الذاكرة
    setInterval(() => {
        if (global.gc) {
            try {
                global.gc();
                console.log(`[${process.pid}] Garbage collection completed`);
            }
            catch (e) {
                console.error('Error during garbage collection:', e);
            }
        }
    }, 30 * 60 * 1000);
    return { io, server, app };
}
// تشغيل السيرفر الرئيسي عندما يتم تشغيل هذا الملف مباشرة
if (require.main === module) {
    const PORT = process.env.PORT || 8080;
    // إنشاء وتشغيل السيرفر
    const { server } = createServer();
    server.listen(PORT, () => {
        console.log(`SpaceChat.live Server optimized for high traffic running on port ${PORT}`);
        console.log(`Environment: production`);
        console.log(`Process ID: ${os_1.default.cpus().length}`);
    });
}
