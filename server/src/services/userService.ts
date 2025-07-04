import { Server } from 'socket.io';
import { UserInfo, QueueUser, RateLimitInfo, GeoLocation } from '../models/types';
import type { RedisClientType } from 'redis';

/**
 * خدمة إدارة المستخدمين - مسؤولة عن إدارة المستخدمين النشطين وقائمة الانتظار
 */
class UserService {
  private activeUsers: Map<string, UserInfo>;
  private userLastSeen: Map<string, number>;
  private userQueue: QueueUser[];
  private queueRateLimits: Map<string, RateLimitInfo>;
  private io: Server | null;
  private matchingAttempts: Map<string, number>;
  
  // Redis client للتخزين المؤقت وتمكين التوزيع الأفقي
  private redisClient: RedisClientType | null = null;
  private redisEnabled: boolean = false;
  
  // ثوابت التكوين - تم تحسينها للتعامل مع 200 مستخدم، 2000 طلب/ثانية، 200 رسالة/ثانية
  private readonly USER_TIMEOUT = 600000; // 600 ثانية (10 دقائق) - زيادة مهلة عدم النشاط
  private readonly RATE_LIMIT_WINDOW = 30000; // 30 ثانية - تقليل نافذة الحد لتحسين الأداء
  private readonly MAX_JOINS_PER_WINDOW = 20; // زيادة الحد الأقصى للانضمامات للسماح بمزيد من المحاولات
  private readonly MAX_QUEUE_WAIT_TIME = 60000; // تقليل من 90 إلى 60 ثانية كحد أقصى لوقت الانتظار
  private readonly MAX_MATCHING_ATTEMPTS = 20; // زيادة من 15 إلى 20 لزيادة فرص المطابقة
  private readonly WAIT_TIME_WEIGHT = 10000; // تقليل من 15000 إلى 10000 لتسريع المطابقة
  private readonly DEBUG = false; // تعطيل التصحيح في الإنتاج
  
  // مفاتيح Redis المستخدمة للتخزين المؤقت
  private readonly REDIS_KEY_USERS = 'spacechat:users';
  private readonly REDIS_KEY_QUEUE = 'spacechat:queue';
  private readonly REDIS_KEY_STATS = 'spacechat:stats';
  private readonly REDIS_CACHE_TTL = 3600; // 1 ساعة كمدة حياة افتراضية للتخزين المؤقت

  constructor() {
    this.activeUsers = new Map<string, UserInfo>();
    this.userLastSeen = new Map<string, number>();
    this.userQueue = [];
    this.queueRateLimits = new Map<string, RateLimitInfo>();
    this.matchingAttempts = new Map<string, number>();
    this.io = null;

    // إعداد فحص دوري للمستخدمين غير النشطين - زيادة تردد التنظيف لتحسين الأداء
    setInterval(() => this.cleanupInactiveUsers(), 20000); // فحص كل 20 ثانية
  }
  
  /**
   * تمكين التخزين المؤقت بـ Redis (اختياري)
   */
  enableRedisCache(client: RedisClientType): void {
    this.redisClient = client;
    this.redisEnabled = true;
    console.log('Redis cache enabled for UserService');
  }

  /**
   * تعيين مثيل السوكت للإرسال
   */
  setSocketServer(io: Server) {
    this.io = io;
  }

  /**
   * إضافة مستخدم جديد أو تحديث المستخدم الموجود
   * تم تحويل هذه الوظيفة لتكون غير متزامنة لكن لا نزال ندعم التعامل المتزامن
   */
  addOrUpdateUser(userId: string, socketId: string, location?: GeoLocation): UserInfo {
    let user = this.activeUsers.get(userId);
    
    if (user) {
      // تحديث المستخدم الموجود
      user.socketId = socketId;
      if (location) {
        user.location = location;
      }
    } else {
      // إنشاء مستخدم جديد
      user = {
        socketId,
        nickname: `User_${userId.substring(0, 5)}`,
        location
      };
    }
    
    this.activeUsers.set(userId, user);
    this.updateLastSeen(userId);
    
    // تحديث التخزين المؤقت في Redis إذا كان ممكنًا
    if (this.redisEnabled && this.redisClient) {
      try {
        // استخدام وعد غير منتظر - لأغراض التخزين المؤقت فقط
        this.redisClient.hSet(this.REDIS_KEY_USERS, userId, JSON.stringify(user))
          .catch(err => console.error('Redis cache update error:', err));
      } catch (error) {
        console.error('Failed to update user in Redis cache:', error);
      }
    }
    
    // إرسال تحديث عدد المستخدمين المتصلين لجميع المستخدمين
    if (this.io) {
      this.io.emit('online-count', this.activeUsers.size);
    }
    
    return user;
  }

  /**
   * إزالة مستخدم
   * تمت إعادتها إلى نسخة متزامنة مع دعم التحديث غير المتزامن لـ Redis
   */
  removeUser(userId: string): boolean {
    const userRemoved = this.activeUsers.delete(userId);
    this.userLastSeen.delete(userId);
    this.removeUserFromQueue(userId);
    
    // تحديث التخزين المؤقت في Redis إذا كان ممكنًا
    if (userRemoved && this.redisEnabled && this.redisClient) {
      try {
        // استخدام وعد غير منتظر - لأغراض التخزين المؤقت فقط
        this.redisClient.hDel(this.REDIS_KEY_USERS, userId)
          .catch(err => console.error('Redis cache removal error:', err));
      } catch (error) {
        console.error('Failed to remove user from Redis cache:', error);
      }
    }
    
    // إرسال تحديث عدد المستخدمين المتصلين بعد إزالة المستخدم
    if (userRemoved && this.io) {
      this.io.emit('online-count', this.activeUsers.size);
    }
    
    return userRemoved;
  }

  /**
   * الحصول على معلومات المستخدم - يتم الاحتفاظ بها كوظيفة متزامنة مع دعم Redis
   */
  getUserInfo(userId: string): UserInfo | undefined {
    // جرب الذاكرة المحلية أولاً
    let user = this.activeUsers.get(userId);
    
    // إذا لم يكن موجودًا ولدينا Redis، قم بتحديث الذاكرة المحلية لاحقًا
    if (!user && this.redisEnabled && this.redisClient) {
      // جلب البيانات من Redis بشكل غير متزامن وتحديث الذاكرة المحلية
      this.redisClient.hGet(this.REDIS_KEY_USERS, userId)
        .then(cachedUser => {
          if (cachedUser) {
            const userData = JSON.parse(cachedUser) as UserInfo;
            this.activeUsers.set(userId, userData);
          }
        })
        .catch(err => console.error('Redis cache get error:', err));
    }
    
    return user;
  }

  /**
   * تحديث وقت آخر نشاط للمستخدم
   */
  updateLastSeen(userId: string): void {
    const now = Date.now();
    const lastSeen = this.userLastSeen.get(userId) || 0;
    
    // تحديث وقت آخر نشاط
    this.userLastSeen.set(userId, now);
    
    // إذا كان المستخدم كان غير نشط لفترة طويلة ثم عاد للنشاط
    if (now - lastSeen > 60000) { // أكثر من دقيقة
      console.log(`User ${userId} became active after ${Math.floor((now - lastSeen) / 1000)} seconds of inactivity`);
    }
  }

  /**
   * التحقق من قيود معدل الانضمام للقائمة
   */
  checkQueueRateLimit(userId: string): boolean {
    const now = Date.now();
    const userRateLimit = this.queueRateLimits.get(userId);
    
    if (!userRateLimit) {
      // أول انضمام للمستخدم
      this.queueRateLimits.set(userId, {
        lastJoinTime: now,
        joinCount: 1
      });
      return true;
    }
    
    // إذا مرت فترة كافية، أعد ضبط العداد
    if (now - userRateLimit.lastJoinTime > this.RATE_LIMIT_WINDOW) {
      userRateLimit.lastJoinTime = now;
      userRateLimit.joinCount = 1;
      return true;
    }
    
    // زيادة عدد مرات الانضمام وفحص الحد
    userRateLimit.joinCount++;
    userRateLimit.lastJoinTime = now;
    
    return userRateLimit.joinCount <= this.MAX_JOINS_PER_WINDOW;
  }

  /**
   * إضافة مستخدم إلى قائمة الانتظار
   */
  addUserToQueue(userId: string, vibe: string, preferences?: Record<string, any>): boolean {
    // التحقق من معدل الاستخدام
    if (!this.checkQueueRateLimit(userId)) {
      return false;
    }
    
    // التحقق مما إذا كان المستخدم موجودًا بالفعل في القائمة
    const existingIndex = this.userQueue.findIndex(u => u.userId === userId);
    if (existingIndex !== -1) {
      // إذا كان موجودًا، قم بتحديثه
      this.userQueue[existingIndex] = {
        userId,
        vibe,
        joinTime: Date.now(),
        preferences
      };
    } else {
      // أضف المستخدم إلى القائمة
      this.userQueue.push({
        userId,
        vibe,
        joinTime: Date.now(),
        preferences
      });
    }
    
    return true;
  }

  /**
   * إزالة مستخدم من قائمة الانتظار
   */
  removeUserFromQueue(userId: string): boolean {
    const initialLength = this.userQueue.length;
    this.userQueue = this.userQueue.filter(u => u.userId !== userId);
    
    return this.userQueue.length !== initialLength;
  }

  /**
   * الحصول على قائمة الانتظار
   */
  getQueue(): QueueUser[] {
    return this.userQueue;
  }

  /**
   * الحصول على عدد المستخدمين النشطين
   */
  getActiveUsersCount(): number {
    return this.activeUsers.size;
  }

  /**
   * الحصول على عدد المستخدمين في قائمة الانتظار
   */
  getQueueLength(): number {
    return this.userQueue.length;
  }

  /**
   * تنظيف المستخدمين غير النشطين
   */
  private cleanupInactiveUsers(): void {
    const now = Date.now();
    let removedCount = 0;
    
    // فحص المستخدمين غير النشطين
    for (const [userId, lastSeen] of this.userLastSeen.entries()) {
      if (now - lastSeen > this.USER_TIMEOUT) {
        console.log(`User ${userId} timed out after inactivity (${Math.floor((now - lastSeen) / 1000)} seconds)`);
        
        // الحصول على معلومات المستخدم
        const userInfo = this.activeUsers.get(userId);
        if (userInfo && this.io) {
          // إخطار الشريك إذا كان متصلاً
          const socket = this.io.sockets.sockets.get(userInfo.socketId);
          if (socket && socket.data.partnerId) {
            const partnerInfo = this.activeUsers.get(socket.data.partnerId);
            if (partnerInfo) {
              this.io.to(partnerInfo.socketId).emit('partner-disconnected');
            }
          }
        }
        
        // إزالة من المستخدمين النشطين
        this.activeUsers.delete(userId);
        removedCount++;
        
        // إزالة من قائمة الانتظار إذا كان موجودًا
        this.removeUserFromQueue(userId);
        
        // إزالة من تتبع آخر ظهور
        this.userLastSeen.delete(userId);
      }
    }
    
    // تحديث عدد المتصلين إذا قمنا بإزالة أي مستخدمين
    if (removedCount > 0 && this.io) {
      console.log(`Cleaned up ${removedCount} inactive users. Active users: ${this.activeUsers.size}`);
      this.io.emit('online-count', this.activeUsers.size);
    }
  }

  /**
   * معالجة قائمة الانتظار ومطابقة المستخدمين
   * تم تحسينها للتعامل مع عدد أكبر من المستخدمين المتزامنين (200+ مستخدم)
   */
  processQueue(io: Server): void {
    if (this.userQueue.length < 2) return;

    // تقليل السجلات لتحسين الأداء
    if (this.userQueue.length > 10) {
      console.log(`Attempting to match users. Queue length: ${this.userQueue.length}`);
    }
  
    // إنشاء مقاييس لتتبع أداء المطابقة
    const startTime = Date.now();

    // تحسين: تقسيم قائمة الانتظار إلى دفعات للسماح بمعالجة أسرع مع أعداد كبيرة من المستخدمين
    // زيادة حجم الدفعة لتسريع المطابقة في الشبكات المزدحمة
    const batchSize = Math.min(100, Math.ceil(this.userQueue.length / 2));
    
    // حساب أوزان وقت الانتظار لكل مستخدم في القائمة
    // هذا يعطي الأولوية للمستخدمين الذين انتظروا لفترة أطول
    const weightedUsers = this.userQueue.map(user => {
      const waitTime = Date.now() - user.joinTime;
      // حساب الوزن بناءً على وقت الانتظار (انتظار أطول = وزن أعلى)
      const attemptCount = this.matchingAttempts.get(user.userId) || 0;
      // زيادة الوزن الاضافي للمحاولات السابقة
      const attemptBonus = Math.min(attemptCount * 5, 20); // زيادة وزن المحاولات السابقة 
      // الوزن الإجمالي = وقت الانتظار + بونص المحاولات
      const weight = Math.floor(waitTime / this.WAIT_TIME_WEIGHT) + attemptBonus;
      
      return { 
        user, 
        weight, // الوزن الكلي للمستخدم
        waitTime,
        attemptCount 
      };
    });

    // ترتيب المستخدمين حسب الوزن (الوزن الأعلى/الانتظار الأطول أولاً)
    weightedUsers.sort((a, b) => b.weight - a.weight);
  
    // متابعة المطابقة مع المستخدمين ذوي الأولوية
    let matchCount = 0;
    const matchedUsers = new Set<string>();
  
    // معالجة دفعة أكبر من المستخدمين ذوي الأولوية العالية
    const batchToProcess = weightedUsers.slice(0, batchSize);
    
    // البدء بالمستخدمين ذوي الأولوية العالية
    for (const user1Entry of batchToProcess) {
      // تخطي إذا تمت مطابقة هذا المستخدم بالفعل
      if (matchedUsers.has(user1Entry.user.userId)) continue;
    
      const user1 = user1Entry.user;
    
      // تخطي الإدخالات غير الصالحة
      if (!user1 || !user1.userId || !this.activeUsers.has(user1.userId)) continue;
    
      // الحصول على محاولات المطابقة أو تهيئتها لهذا المستخدم
      const user1Attempts = this.matchingAttempts.get(user1.userId) || 0;
    
      // تسريع المطابقة لمن انتظر طويلاً - زيادة عدد المحاولات للمستخدمين ذوي الانتظار الطويل
      // وإخطار المستخدم بأنه قد انتظر طويلاً
      if (user1Attempts >= this.MAX_MATCHING_ATTEMPTS) {
        // إخطار المستخدم بأنه قد انتظر طويلاً
        const userInfo = this.activeUsers.get(user1.userId);
        if (userInfo && this.io) {
          this.io.to(userInfo.socketId).emit('queue-timeout', {
            message: "We couldn't find a match for you. Please try again with different preferences.",
            waitTime: Math.round((Date.now() - user1Entry.user.joinTime) / 1000)
          });
        
          // إزالة من القائمة
          this.userQueue = this.userQueue.filter(u => u.userId !== user1.userId);
          this.matchingAttempts.delete(user1.userId);
        }
        continue;
      }
    
      // تحديث عدد محاولات المطابقة للمستخدم1
      this.matchingAttempts.set(user1.userId, user1Attempts + 1);
    
      // معالجة خاصة للمستخدمين - مرونة أكبر في معايير المطابقة بناءً على وقت الانتظار
      const isLongWaiting = user1Entry.waitTime > this.MAX_QUEUE_WAIT_TIME / 3; // تغيير من 2 إلى 3
      const isMediumWaiting = user1Entry.waitTime > this.MAX_QUEUE_WAIT_TIME / 5; // تغيير من 4 إلى 5
    
      // تحسين: استخدام مطابقة أسرع
      for (const user2Entry of weightedUsers) {
        // لا تطابق مع النفس أو مع المستخدمين الذين تمت مطابقتهم بالفعل
        if (user1Entry === user2Entry || matchedUsers.has(user2Entry.user.userId)) continue;
      
        const user2 = user2Entry.user;
      
        // تخطي الإدخالات غير الصالحة
        if (!user2 || !user2.userId || !this.activeUsers.has(user2.userId)) continue;
      
        // التحقق من التوافق بناءً على التفضيلات - زيادة المرونة لمن انتظر طويلاً
        if (this.areUsersCompatible(user1, user2, isLongWaiting, isMediumWaiting)) {
          // وضع علامة على كلا المستخدمين كمتطابقين 
          matchedUsers.add(user1.userId);
          matchedUsers.add(user2.userId);
        
          // إزالة كلا المستخدمين من القائمة
          this.userQueue = this.userQueue.filter(user => 
            user.userId !== user1.userId && user.userId !== user2.userId
          );
        
          // إعادة تعيين محاولات المطابقة لكلا المستخدمين
          this.matchingAttempts.delete(user1.userId);
          this.matchingAttempts.delete(user2.userId);
        
          matchCount++;
        
          // معالجة المطابقة
          const user1Info = this.activeUsers.get(user1.userId);
          const user2Info = this.activeUsers.get(user2.userId);
        
          // التأكد من وجود كلا المستخدمين ومن وجود مثيل السوكت
          if (user1Info && user2Info && this.io) {
            // تحديث معرّفات الشريك في بيانات السوكت
            const socket1 = this.io.sockets.sockets.get(user1Info.socketId);
            const socket2 = this.io.sockets.sockets.get(user2Info.socketId);
          
            // التحقق من وجود Socket قبل محاولة الوصول إلى data
            if (socket1) {
              socket1.data.partnerId = user2.userId;
            }
            
            if (socket2) {
              socket2.data.partnerId = user1.userId;
            }
          
            // إخطار كلا المستخدمين بحدث 'matched'
            this.io?.to(user1Info.socketId).emit('matched', { 
              partnerId: user2.userId,
              vibe: user2.vibe || 'general',
              country: user2Info.location?.country || 'Earth',
              countryCode: user2Info.location?.countryCode || 'unknown',
              flag: user2Info.location?.flag || '🌍'
            });
          
            this.io?.to(user2Info.socketId).emit('matched', { 
              partnerId: user1.userId,
              vibe: user1.vibe || 'general',
              country: user1Info.location?.country || 'Earth',
              countryCode: user1Info.location?.countryCode || 'unknown',
              flag: user1Info.location?.flag || '🌍'
            });
          }
          
          break; // نخرج من الحلقة بمجرد العثور على مطابقة
        }
      }
    }
  
    // حساب مقاييس الأداء
    const matchingTime = Date.now() - startTime;
  
    // تسجيل بيانات الأداء - تقليل السجلات لتحسين الأداء
    if (matchCount > 0 && this.userQueue.length > 10) {
      console.log(`Matched ${matchCount} pairs in ${matchingTime}ms (${matchingTime/matchCount}ms per match)`);
    }
  
    // تحسين معدل معالجة القائمة - معالجة أسرع لدعم 2000 طلب في الثانية
    if (matchCount > 0 && this.userQueue.length >= 2) {
      setTimeout(() => this.processQueue(io), 100); // تأخير أقصر لزيادة معدل المطابقة (من 250 إلى 100)
    } 
    // إذا لم يتم العثور على مطابقة ولكن لدينا مستخدمين في قائمة الانتظار، حاول مرة أخرى بعد تأخير أقصر
    else if (matchCount === 0 && this.userQueue.length >= 2) {
      setTimeout(() => this.processQueue(io), 200); // تأخير أقصر (من 500 إلى 200)
    }
  
    // قم بتشغيل فحص دوري لإشعار المستخدمين الذين انتظروا لفترة طويلة
    this.monitorQueue();
  }

  /**
   * التحقق من توافق مستخدمين بناءً على تفضيلاتهم
   * مع زيادة المرونة لذوي أوقات الانتظار الطويلة
   */
  private areUsersCompatible(user1: QueueUser, user2: QueueUser, useFlexibleMatching = false, useMediumFlexibleMatching = false): boolean {
    try {
      // أي المستخدمين ذوي الحالة "any" يمكن مطابقتهم مع أي مستخدم آخر
      if (user1.vibe === 'any' || user2.vibe === 'any') {
        return true;
      }
      
      // إذا كان المستخدم قد انتظر لفترة طويلة، كن أكثر مرونة في المطابقة
      if (useFlexibleMatching) {
        // نتجاهل التفضيلات تمامًا ونقوم بالمطابقة مع أي مستخدم متاح
        return true;
      }
      
      // لمستخدمي الانتظار المتوسط، يمكننا استخدام معايير أخف
      if (useMediumFlexibleMatching) {
        // فقط تحقق من أن التفضيلات غير متعارضة
        const incompatibleVibes = [
          ['serious', 'fun'], // لا تطابق serious مع fun
          ['romantic', 'friendship'] // لا تطابق romantic مع friendship
        ];
        
        // التحقق من عدم وجود تفضيلات متناقضة
        for (const [vibe1, vibe2] of incompatibleVibes) {
          if ((user1.vibe === vibe1 && user2.vibe === vibe2) || 
              (user1.vibe === vibe2 && user2.vibe === vibe1)) {
            return false;
          }
        }
        
        // مطابقة كل التفضيلات الأخرى
        return true;
      }
      
      // للمستخدمين ذوي الانتظار القصير، استخدام مطابقة دقيقة
      return user1.vibe === user2.vibe;
    } catch (error) {
      console.error('Error in areUsersCompatible:', error);
      // مطابقة آمنة في حالة الخطأ
      return true;
    }
  }

  /**
   * مراقبة قائمة الانتظار وإخطار المستخدمين عن حالة الانتظار
   */
  private monitorQueue(): void {
    // التأكد من وجود مستخدمين في القائمة ومن وجود مثيل السوكت
    if (this.userQueue.length === 0 || !this.io) return;
  
    const now = Date.now();
    
    // التحقق من كل مستخدم في القائمة
    this.userQueue.forEach(user => {
      const waitTime = now - user.joinTime;
      const userInfo = this.activeUsers.get(user.userId);
    
      if (!userInfo) return; // تخطي إذا لم يتم العثور على معلومات المستخدم
    
      // للمستخدمين الذين ينتظرون لفترة متوسطة (1/4 من وقت الانتظار الأقصى)
      if (waitTime > this.MAX_QUEUE_WAIT_TIME / 4 && waitTime <= this.MAX_QUEUE_WAIT_TIME / 2) {
        // إخطار المستخدم بأنه انتظر وأننا نحاول العثور على مطابقة بتفضيلات أوسع
        this.io?.to(userInfo.socketId).emit('queue-update', {
          waitTime: Math.round(waitTime / 1000),
          message: "Taking longer than expected. We're trying to find you a match with expanded preferences.",
          status: "medium-wait"
        });
      }
      // للمستخدمين الذين ينتظرون لفترة طويلة (1/2 من وقت الانتظار الأقصى)
      else if (waitTime > this.MAX_QUEUE_WAIT_TIME / 2 && waitTime < this.MAX_QUEUE_WAIT_TIME) {
        // إخطار المستخدم بأنه انتظر لفترة طويلة
        this.io?.to(userInfo.socketId).emit('queue-update', {
          waitTime: Math.round(waitTime / 1000),
          message: "Still searching. We've significantly expanded your matching criteria.",
          status: "long-wait"
        });
      }
      // للمستخدمين الذين وصلوا إلى وقت الانتظار الأقصى
      else if (waitTime >= this.MAX_QUEUE_WAIT_TIME) {
        // إخطار المستخدم بانتهاء المهلة
        this.io?.to(userInfo.socketId).emit('queue-timeout', {
          waitTime: Math.round(waitTime / 1000),
          message: "We couldn't find a match for you after a long wait. Please try again with different preferences.",
          status: "timeout"
        });
      
        // إزالة من القائمة
        this.userQueue = this.userQueue.filter(u => u.userId !== user.userId);
      
        // إعادة تعيين محاولات المطابقة
        this.matchingAttempts.delete(user.userId);
      
        console.log(`User ${user.userId} removed from queue after reaching maximum wait time (${Math.round(waitTime/1000)}s)`);
      }
    });
  }

  /**
   * الحصول على جميع المستخدمين النشطين
   */
  getAllActiveUsers(): Map<string, UserInfo> {
    return this.activeUsers;
  }

  /**
   * الحصول على وقت آخر نشاط للمستخدم
   */
  getLastActivity(userId: string): number | undefined {
    return this.userLastSeen.get(userId);
  }
}

// إنشاء مثيل واحد للخدمة (Singleton pattern)
export const userService = new UserService(); 