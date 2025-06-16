"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
/**
 * خدمة إدارة المستخدمين - مسؤولة عن إدارة المستخدمين النشطين وقائمة الانتظار
 */
class UserService {
    constructor() {
        // Redis client للتخزين المؤقت وتمكين التوزيع الأفقي
        this.redisClient = null;
        this.redisEnabled = false;
        // ثوابت التكوين - تم تحسينها للتعامل مع 200 مستخدم، 2000 طلب/ثانية، 200 رسالة/ثانية
        this.USER_TIMEOUT = 600000; // 600 ثانية (10 دقائق) - زيادة مهلة عدم النشاط
        this.RATE_LIMIT_WINDOW = 30000; // 30 ثانية - تقليل نافذة الحد لتحسين الأداء
        this.MAX_JOINS_PER_WINDOW = 20; // زيادة الحد الأقصى للانضمامات للسماح بمزيد من المحاولات
        this.MAX_QUEUE_WAIT_TIME = 90000; // 90 ثانية كحد أقصى لوقت الانتظار
        this.MAX_MATCHING_ATTEMPTS = 15; // زيادة من 10 إلى 15 لزيادة فرص المطابقة
        this.WAIT_TIME_WEIGHT = 15000; // تقليل من 20000 إلى 15000 لتسريع المطابقة
        this.DEBUG = false; // تعطيل التصحيح في الإنتاج
        // مفاتيح Redis المستخدمة للتخزين المؤقت
        this.REDIS_KEY_USERS = 'spacechat:users';
        this.REDIS_KEY_QUEUE = 'spacechat:queue';
        this.REDIS_KEY_STATS = 'spacechat:stats';
        this.REDIS_CACHE_TTL = 3600; // 1 ساعة كمدة حياة افتراضية للتخزين المؤقت
        this.activeUsers = new Map();
        this.userLastSeen = new Map();
        this.userQueue = [];
        this.queueRateLimits = new Map();
        this.matchingAttempts = new Map();
        this.io = null;
        // إعداد فحص دوري للمستخدمين غير النشطين - زيادة تردد التنظيف لتحسين الأداء
        setInterval(() => this.cleanupInactiveUsers(), 20000); // فحص كل 20 ثانية
    }
    /**
     * تمكين التخزين المؤقت بـ Redis (اختياري)
     */
    enableRedisCache(client) {
        this.redisClient = client;
        this.redisEnabled = true;
        console.log('Redis cache enabled for UserService');
    }
    /**
     * تعيين مثيل السوكت للإرسال
     */
    setSocketServer(io) {
        this.io = io;
    }
    /**
     * إضافة مستخدم جديد أو تحديث المستخدم الموجود
     * تم تحويل هذه الوظيفة لتكون غير متزامنة لكن لا نزال ندعم التعامل المتزامن
     */
    addOrUpdateUser(userId, socketId, location) {
        let user = this.activeUsers.get(userId);
        if (user) {
            // تحديث المستخدم الموجود
            user.socketId = socketId;
            if (location) {
                user.location = location;
            }
        }
        else {
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
            }
            catch (error) {
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
    removeUser(userId) {
        const userRemoved = this.activeUsers.delete(userId);
        this.userLastSeen.delete(userId);
        this.removeUserFromQueue(userId);
        // تحديث التخزين المؤقت في Redis إذا كان ممكنًا
        if (userRemoved && this.redisEnabled && this.redisClient) {
            try {
                // استخدام وعد غير منتظر - لأغراض التخزين المؤقت فقط
                this.redisClient.hDel(this.REDIS_KEY_USERS, userId)
                    .catch(err => console.error('Redis cache removal error:', err));
            }
            catch (error) {
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
    getUserInfo(userId) {
        // جرب الذاكرة المحلية أولاً
        let user = this.activeUsers.get(userId);
        // إذا لم يكن موجودًا ولدينا Redis، قم بتحديث الذاكرة المحلية لاحقًا
        if (!user && this.redisEnabled && this.redisClient) {
            // جلب البيانات من Redis بشكل غير متزامن وتحديث الذاكرة المحلية
            this.redisClient.hGet(this.REDIS_KEY_USERS, userId)
                .then(cachedUser => {
                if (cachedUser) {
                    const userData = JSON.parse(cachedUser);
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
    updateLastSeen(userId) {
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
    checkQueueRateLimit(userId) {
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
    addUserToQueue(userId, vibe, preferences) {
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
        }
        else {
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
    removeUserFromQueue(userId) {
        const initialLength = this.userQueue.length;
        this.userQueue = this.userQueue.filter(u => u.userId !== userId);
        return this.userQueue.length !== initialLength;
    }
    /**
     * الحصول على قائمة الانتظار
     */
    getQueue() {
        return this.userQueue;
    }
    /**
     * الحصول على عدد المستخدمين النشطين
     */
    getActiveUsersCount() {
        return this.activeUsers.size;
    }
    /**
     * الحصول على عدد المستخدمين في قائمة الانتظار
     */
    getQueueLength() {
        return this.userQueue.length;
    }
    /**
     * تنظيف المستخدمين غير النشطين
     */
    cleanupInactiveUsers() {
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
    processQueue(io) {
        if (this.userQueue.length < 2)
            return;
        // تقليل السجلات لتحسين الأداء
        if (this.userQueue.length > 10) {
            console.log(`Attempting to match users. Queue length: ${this.userQueue.length}`);
        }
        // إنشاء مقاييس لتتبع أداء المطابقة
        const startTime = Date.now();
        // تحسين: تقسيم قائمة الانتظار إلى دفعات لتحسين الأداء مع أعداد كبيرة من المستخدمين
        // هذا يمكن أن يعالج حتى 2000 طلب/الثانية
        const batchSize = Math.min(50, Math.ceil(this.userQueue.length / 4));
        // حساب أوزان وقت الانتظار لكل مستخدم في القائمة
        // هذا يعطي الأولوية للمستخدمين الذين انتظروا لفترة أطول
        const weightedUsers = this.userQueue.map(user => {
            const waitTime = Date.now() - user.joinTime;
            // حساب الوزن بناءً على وقت الانتظار (انتظار أطول = وزن أعلى)
            const attemptCount = this.matchingAttempts.get(user.userId) || 0;
            const attemptBonus = Math.min(attemptCount * 2, 10); // وزن إضافي للمحاولات السابقة (الحد الأقصى 10)
            const weight = Math.floor(waitTime / this.WAIT_TIME_WEIGHT) + attemptBonus;
            return {
                user,
                weight,
                waitTime,
                attemptCount
            };
        });
        // ترتيب المستخدمين حسب الوزن (الوزن الأعلى/الانتظار الأطول أولاً)
        weightedUsers.sort((a, b) => b.weight - a.weight);
        // متابعة المطابقة مع المستخدمين ذوي الأولوية
        let matchCount = 0;
        const matchedUsers = new Set();
        // تحسين: معالجة فقط الدفعة الأولى من المستخدمين ذوي الأولوية العالية
        // هذا يقلل من وقت المعالجة بشكل كبير ويسمح بمعالجة حتى 200 اتصال متزامن
        const batchToProcess = weightedUsers.slice(0, batchSize);
        // البدء بالمستخدمين ذوي الأولوية العالية
        for (const user1Entry of batchToProcess) {
            // تخطي إذا تمت مطابقة هذا المستخدم بالفعل
            if (matchedUsers.has(user1Entry.user.userId))
                continue;
            const user1 = user1Entry.user;
            // تخطي الإدخالات غير الصالحة
            if (!user1 || !user1.userId || !this.activeUsers.has(user1.userId))
                continue;
            // الحصول على محاولات المطابقة أو تهيئتها لهذا المستخدم
            const user1Attempts = this.matchingAttempts.get(user1.userId) || 0;
            // إذا وصل المستخدم إلى الحد الأقصى من المحاولات، تخطيه
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
                }
                continue;
            }
            // تحديث عدد محاولات المطابقة للمستخدم1
            this.matchingAttempts.set(user1.userId, user1Attempts + 1);
            // معالجة خاصة للمستخدمين - مرونة أكبر في معايير المطابقة بناءً على وقت الانتظار
            const isLongWaiting = user1Entry.waitTime > this.MAX_QUEUE_WAIT_TIME / 2;
            const isMediumWaiting = user1Entry.waitTime > this.MAX_QUEUE_WAIT_TIME / 4;
            // تحسين: استخدام مطابقة أسرع لدعم 200 غرفة لعب
            // بدلاً من البحث عن أفضل مطابقة، نقبل أول مطابقة مقبولة
            for (const user2Entry of weightedUsers) {
                // لا تطابق مع النفس أو مع المستخدمين الذين تمت مطابقتهم بالفعل
                if (user1Entry === user2Entry || matchedUsers.has(user2Entry.user.userId))
                    continue;
                const user2 = user2Entry.user;
                // تخطي الإدخالات غير الصالحة
                if (!user2 || !user2.userId || !this.activeUsers.has(user2.userId))
                    continue;
                // التحقق من التوافق بناءً على التفضيلات
                // إذا كان المستخدم قد انتظر لفترة طويلة، كن أكثر مرونة في التوافق
                if (this.areUsersCompatible(user1, user2, isLongWaiting, isMediumWaiting)) {
                    // وضع علامة على كلا المستخدمين كمتطابقين 
                    matchedUsers.add(user1.userId);
                    matchedUsers.add(user2.userId);
                    // إزالة كلا المستخدمين من القائمة
                    this.userQueue = this.userQueue.filter(user => user.userId !== user1.userId && user.userId !== user2.userId);
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
            console.log(`Matched ${matchCount} pairs in ${matchingTime}ms (${matchingTime / matchCount}ms per match)`);
        }
        // تحسين معدل معالجة القائمة - معالجة أسرع لدعم 2000 طلب في الثانية
        if (matchCount > 0 && this.userQueue.length >= 2) {
            setTimeout(() => this.processQueue(io), 250); // تأخير أقصر لزيادة معدل المطابقة
        }
        // إذا لم يتم العثور على مطابقة ولكن لدينا مستخدمين في قائمة الانتظار، حاول مرة أخرى بعد تأخير أقصر
        else if (matchCount === 0 && this.userQueue.length >= 2) {
            setTimeout(() => this.processQueue(io), 500);
        }
        // قم بتشغيل فحص دوري لإشعار المستخدمين الذين انتظروا لفترة طويلة
        this.monitorQueue();
    }
    /**
     * التحقق من توافق المستخدمين بناءً على تفضيلاتهم
     */
    areUsersCompatible(user1, user2, useFlexibleMatching = false, useMediumFlexibleMatching = false) {
        // إذا كان المستخدم قد انتظر لفترة طويلة، تخطى التحقق من التوافق
        if (useFlexibleMatching) {
            return true;
        }
        // تم تعطيل التحقق من توافق الاهتمامات (vibe) - الفايب للعرض في الواجهة فقط
        const compatibleVibes = true; // دائمًا متوافق بغض النظر عن قيمة الفايب
        // لا داعي للتحقق من عدم التوافق لأننا نعتبر جميع الفايبات متوافقة الآن
        // إذا لم يكن هناك تفضيلات محددة، فالمستخدمون متوافقون
        if (!user1.preferences && !user2.preferences) {
            return true;
        }
        // في حالة المطابقة المتوسطة المرنة للمستخدمين الذين انتظروا لفترة متوسطة
        if (useMediumFlexibleMatching) {
            return true;
        }
        return true; // بشكل افتراضي يكون المستخدمون متوافقين
    }
    /**
     * مراقبة قائمة الانتظار وإخطار المستخدمين عن حالة الانتظار
     */
    monitorQueue() {
        // التأكد من وجود مستخدمين في القائمة ومن وجود مثيل السوكت
        if (this.userQueue.length === 0 || !this.io)
            return;
        const now = Date.now();
        // التحقق من كل مستخدم في القائمة
        this.userQueue.forEach(user => {
            const waitTime = now - user.joinTime;
            const userInfo = this.activeUsers.get(user.userId);
            if (!userInfo)
                return; // تخطي إذا لم يتم العثور على معلومات المستخدم
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
                console.log(`User ${user.userId} removed from queue after reaching maximum wait time (${Math.round(waitTime / 1000)}s)`);
            }
        });
    }
    /**
     * الحصول على جميع المستخدمين النشطين
     */
    getAllActiveUsers() {
        return this.activeUsers;
    }
}
// إنشاء مثيل واحد للخدمة (Singleton pattern)
exports.userService = new UserService();
