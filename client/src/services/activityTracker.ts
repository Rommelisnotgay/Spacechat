import { ref, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import { useSocket } from './socket';

/**
 * خدمة تتبع نشاط المستخدم
 * تقوم بتتبع تفاعلات المستخدم مع الواجهة وإرسال تحديثات النشاط للخادم
 */
export function useActivityTracker() {
  const { socket } = useSocket();
  
  // Check if we're in a component setup context
  const isInSetupContext = !!getCurrentInstance();
  
  // الحالة
  const isActive = ref(true);
  const lastActivity = ref(Date.now());
  
  // ثوابت
  const ACTIVITY_THROTTLE = 30000; // 30 ثانية بين تحديثات النشاط
  const INACTIVITY_THRESHOLD = 300000; // 5 دقائق قبل اعتبار المستخدم غير نشط
  
  // متغيرات للتتبع
  let lastActivityUpdate = 0;
  let inactivityTimer: number | null = null;
  
  /**
   * تحديث نشاط المستخدم وإرسال إشعار للخادم إذا لزم الأمر
   */
  const updateActivity = () => {
    const now = Date.now();
    lastActivity.value = now;
    isActive.value = true;
    
    // إرسال تحديث للخادم مع تقييد المعدل
    if (now - lastActivityUpdate > ACTIVITY_THROTTLE) {
      lastActivityUpdate = now;
      if (socket.value && socket.value.connected) {
        socket.value.emit('user-activity');
        console.log('[ActivityTracker] تم إرسال تحديث النشاط للخادم');
      }
    }
    
    // إعادة ضبط مؤقت عدم النشاط
    resetInactivityTimer();
  };
  
  /**
   * إعادة ضبط مؤقت عدم النشاط
   */
  const resetInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    
    // تعيين مؤقت جديد لتحديد عدم النشاط
    inactivityTimer = window.setTimeout(() => {
      isActive.value = false;
      console.log('[ActivityTracker] المستخدم غير نشط الآن');
    }, INACTIVITY_THRESHOLD);
  };
  
  /**
   * إعداد مستمعات الأحداث لتتبع نشاط المستخدم
   */
  const setupEventListeners = () => {
    // قائمة بأحداث المستخدم التي تعتبر نشاطاً
    const userEvents = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'click', 'touchmove'
    ];
    
    // إضافة مستمعات الأحداث
    userEvents.forEach(eventName => {
      document.addEventListener(eventName, updateActivity, { passive: true });
    });
    
    // تتبع حالة رؤية الصفحة
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      }
    });
    
    // تحديث النشاط عند التحميل الأولي
    updateActivity();
  };
  
  /**
   * إزالة مستمعات الأحداث
   */
  const cleanupEventListeners = () => {
    const userEvents = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'click', 'touchmove'
    ];
    
    userEvents.forEach(eventName => {
      document.removeEventListener(eventName, updateActivity);
    });
    
    document.removeEventListener('visibilitychange', updateActivity);
    
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  };
  
  // Only register lifecycle hooks if we're in a component setup context
  if (isInSetupContext) {
    onMounted(() => {
      setupEventListeners();
    });
    
    onUnmounted(() => {
      cleanupEventListeners();
    });
  } else {
    // If not in setup context, we can still set up listeners manually
    setupEventListeners();
  }
  
  return {
    isActive,
    lastActivity,
    updateActivity,
    setupEventListeners,
    cleanupEventListeners
  };
} 