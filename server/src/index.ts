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
import axios from 'axios';

// Suppress console logs in production mode
if (process.env.NODE_ENV === 'production') {
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleDebug = console.debug;
  
  // Only log critical errors in production
  console.log = (...args: any[]) => {
    // Allow logging server start message
    if (typeof args[0] === 'string' && 
        (args[0].includes('Server running') || 
         args[0].includes('Environment: production'))) {
      originalConsoleLog(...args);
    }
  };
  
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
  
  // Keep error logging for critical issues
  // console.error stays as is
}

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
    pingInterval: 20000,
    pingTimeout: 30000,
    connectTimeout: 30000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
    perMessageDeflate: {
      threshold: 1024,
    },
    upgradeTimeout: 15000,
    cleanupEmptyChildNamespaces: true,
    httpCompression: true,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2000,
      skipMiddlewares: true,
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
    // بيانات EXPRESS TURN/STUN موثوقة
    res.json({
      success: true,
      rtcConfig: {
        iceServers: [
          // EXPRESS TURN server (primary)
          {
            urls: [
              'turn:relay1.expressturn.com:3480'
            ],
            username: '000000002066212417',
            credential: 'j597+kGrhV4Tk8NjtWS1Rwwth00='
          },
          // STUN servers (fallback)
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun.cloudflare.com:3478'
            ]
          },
          // Metered TURN servers (fallback)
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turns:openrelay.metered.ca:443'
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

  // نقطة نهاية API آمنة لبيانات اعتماد Metered TURN
  app.get('/api/turn-credentials/metered', async (req, res) => {
    try {
      // استخدام API Key من متغير البيئة بدلاً من إرساله من العميل
      const apiKey = process.env.METERED_API_KEY;
      
      // التحقق من وجود مفتاح API
      if (!apiKey) {
        // عدم كشف السبب الحقيقي للخطأ (عدم وجود المفتاح)
        return res.status(403).json({ 
          success: false, 
          message: 'Service unavailable' 
        });
      }
      
      // جلب البيانات من خدمة Metered
      const response = await axios.get(
        `https://spacetalk.metered.live/api/v1/turn/credentials`, 
        { params: { apiKey } }
      );
      
      // إرسال البيانات للعميل
      if (response.data && Array.isArray(response.data)) {
        return res.json({
          success: true,
          iceServers: response.data
        });
      } else {
        // استخدام خوادم TURN الافتراضية إذا فشلت عملية الجلب
        return res.json({
          success: true,
          iceServers: [
            {
              urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
              ]
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error fetching Metered TURN credentials');
      
      // إرجاع رد خطأ آمن (لا يكشف تفاصيل الخطأ)
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch TURN credentials'
      });
    }
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
      
      // Handle partner disconnection requests (skip, manual disconnect)
      socket.on('disconnect-partner', (data: { reason: string }) => {
        const partnerId = socket.data.partnerId;
        
        if (!partnerId) {
          // No partner to disconnect from
          socket.emit('disconnect-confirmed', { success: true });
          return;
        }
        
        // Get partner's socket info
        const partnerInfo = userService.getUserInfo(partnerId);
        if (partnerInfo) {
          // Send specific event based on reason
          if (data.reason === 'skip') {
            // Notify partner they've been skipped
            io.to(partnerInfo.socketId).emit('user-skipped', {
              from: userId,
              reason: 'skipped'
            });
          } else {
            // Generic disconnect notification
            io.to(partnerInfo.socketId).emit('user-disconnected', {
              from: userId,
              reason: data.reason || 'disconnected'
            });
          }
        }
        
        // Clear the partner relationship on both sides
        socket.data.partnerId = null;
        
        // If partner socket exists, clear their partner reference too
        if (partnerInfo) {
          const partnerSocket = io.sockets.sockets.get(partnerInfo.socketId);
          if (partnerSocket) {
            partnerSocket.data.partnerId = null;
          }
        }
        
        // Confirm disconnect to the requester
        socket.emit('disconnect-confirmed', { success: true });
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
    // These critical logs will still be shown in production due to our console.log override
    console.log(`SpaceChat.live Server running on port ${PORT} (${process.env.NODE_ENV || 'production'})`);
    console.log(`Environment: production`);
    console.log(`CPU cores: ${os.cpus().length}`);
  });
}
