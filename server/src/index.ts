import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSignalingEvents } from './socket/signaling';
import { setupChatEvents } from './socket/chat';
import { setupGameEvents } from './socket/games';
import { getLocationFromIp, getAllCountries } from './services/geo-location';
import { userService } from './services/userService';
import { gameService } from './services/gameService';
import path from 'path';
import os from 'os';

// تكوين السيرفر
interface ServerConfig {
  socketOpts?: any;
}

// الحصول على أصول CORS المسموح بها
const getAllowedOrigins = () => {
  return '*'; // السماح لأي origin بالوصول
};

// دالة إنشاء وإرجاع السيرفر لاستخدامه في وضع العنقود
export function createServer(config: ServerConfig = {}) {
  // تهيئة تطبيق Express مع إعدادات محسنة
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // إنشاء خادم HTTP مع زيادة المهلة
  const server = http.createServer({
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
  const io = new Server(server, socketOptions);

  // تعيين مثيل Socket.IO في الخدمات
  userService.setSocketServer(io);
  gameService.setSocketServer(io);

  // الوسائط
  app.use(cors({
    origin: '*', // السماح لأي origin بالوصول
    credentials: true
  }));

  // زيادة حد محلل الجسم
  app.use(express.json({ limit: '1mb' }));

  // تحديد معدل بسيط في الذاكرة للواجهات البرمجية
  const apiLimiter = {
    windowMs: 60000,
    maxRequests: 120,
    clients: new Map<string, { count: number, resetTime: number }>()
  };

  // وسيط تحديد المعدل
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (apiLimiter.clients.has(ip)) {
      const client = apiLimiter.clients.get(ip)!;
      if (client.resetTime < now) {
        client.count = 0;
        client.resetTime = now + apiLimiter.windowMs;
      }
      
      if (client.count >= apiLimiter.maxRequests) {
        return res.status(429).json({ error: "Too many requests" });
      }
      
      client.count++;
    } else {
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
      online: userService.getActiveUsersCount(),
      inQueue: userService.getQueueLength(),
      // معلومات النظام الإضافية لمراقبة الأداء
      system: {
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: (1 - os.freemem() / os.totalmem()) * 100
        },
        uptime: os.uptime(),
        loadAvg: os.loadavg(),
        processId: process.pid
      }
    });
  });

  // نقطة نهاية API للحصول على جميع البلدان المتاحة
  app.get('/api/countries', (req, res) => {
    res.json(getAllCountries());
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
              // STUN servers - for NAT traversal
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun.cloudflare.com:3478'
            ]
          },
          // OpenRelay TURN servers (specific credentials for each service)
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp',
              'turns:openrelay.metered.ca:443',
              'turns:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: [
              'turn:global.relay.metered.ca:80',
              'turn:global.relay.metered.ca:80?transport=tcp',
              'turn:global.relay.metered.ca:443',
              'turn:global.relay.metered.ca:443?transport=tcp',
              'turns:global.relay.metered.ca:443',
              'turns:global.relay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          // Google's public STUN server as fallback
          {
            urls: 'stun:stun.l.google.com:19302'
          }
        ],
        iceCandidatePoolSize: 15,
        iceTransportPolicy: 'all', // يمكن للعميل تغييرها إلى 'relay' للشبكات الصعبة
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan' // استخدام الخطة الموحدة
      }
    });
  });

  // تقديم الملفات الثابتة من مجلد dist للعميل في الإنتاج
  if (true) { // دائماً وضع الإنتاج
    // إضافة تحكم في التخزين المؤقت للأصول الثابتة
    app.use(express.static(path.join(__dirname, '../../client/dist'), {
      maxAge: '1d',
      etag: true,
      lastModified: true
    }));
    
    // مسارات API التي يجب أن تعمل في الإنتاج
    app.get('/api/status', (req: Request, res: Response) => {
      res.send('SpaceChat.live Server is running');
    });
    
    // التعامل مع توجيه SPA - يجب أن يكون بعد مسارات API
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
    });
  } else {
    // مسارات للتطوير فقط
    app.get('/', (req: Request, res: Response) => {
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
    
    const queryUserId = socket.handshake.query.userId as string | undefined;
    const userId = queryUserId || socket.id;
    const clientIp = socket.handshake.headers['x-forwarded-for'] as string || socket.handshake.address;
    
    try {
      const location = await getLocationFromIp(clientIp);
      const userInfo = userService.addOrUpdateUser(userId, socket.id, location || undefined);
      setupSocketEvents();
    } catch (error) {
      setupSocketEvents();
    }
    
    function setupSocketEvents() {
      socket.data.userId = userId;
      
      socket.on('disconnect', () => {
        const userInfo = userService.getUserInfo(userId);
        if (userInfo && socket.data.partnerId) {
          const partnerInfo = userService.getUserInfo(socket.data.partnerId);
          if (partnerInfo && io) {
            io.to(partnerInfo.socketId).emit('partner-disconnected');
          }
        }
        
        userService.removeUser(userId);
      });
      
      socket.on('heartbeat', () => {
        userService.updateLastSeen(userId);
      });
      
      socket.on('user-activity', () => {
        userService.updateLastSeen(userId);
      });
      
      socket.on('set-nickname', (nickname: string) => {
        if (typeof nickname === 'string' && nickname.trim().length > 0) {
          const userInfo = userService.getUserInfo(userId);
          if (userInfo) {
            userInfo.nickname = nickname.trim().substring(0, 20);
          }
        }
      });
      
      socket.on('join-queue', (data: { vibe?: string, preferences?: Record<string, any> }) => {
        let vibe = 'general';
        if (typeof data.vibe === 'string' && data.vibe.trim().length > 0) {
          vibe = data.vibe.trim();
        }
        
        const success = userService.addUserToQueue(userId, vibe, data.preferences);
        
        if (success) {
          socket.emit('queue-joined');
        } else {
          socket.emit('queue-join-failed', { reason: 'rate-limited' });
        }
        
        userService.processQueue(io);
      });
      
      socket.on('leave-queue', () => {
        const removed = userService.removeUserFromQueue(userId);
        if (removed) {
          socket.emit('queue-left');
        }
      });
      
      setupSignalingEvents(io, socket);
      setupChatEvents(io, socket);
      setupGameEvents(io, socket);
      
      socket.emit('user-info', { userId });
      socket.emit('online-count', userService.getActiveUsersCount());
    }
  });

  // تنظيف دوري أكثر كفاءة - معدل معالجة مخفض للتعامل مع 200 رسالة/ثانية
  setInterval(() => {
    userService.processQueue(io);
  }, 2000);

  // تنظيف GC كل 30 دقيقة لمنع تسريبات الذاكرة
  setInterval(() => {
    if (global.gc) {
      try {
        global.gc();
        console.log(`[${process.pid}] Garbage collection completed`);
      } catch (e) {
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
    console.log(`Process ID: ${os.cpus().length}`);
  });
}
