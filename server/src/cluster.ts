import cluster from 'cluster';
import os from 'os';
import { createServer } from './index';

/**
 * وحدة المجموعة - تسمح بتشغيل السيرفر على عدة مثيلات في نفس الماكينة
 * لاستغلال جميع أنوية المعالج
 */

// عدد العمليات الفرعية للإنشاء (1 لكل نواة)
const WORKERS_COUNT = os.cpus().length;

/**
 * تشغيل السيرفر في وضع المجموعة
 * هذه الوظيفة تقوم بإنشاء سيرفر عند استدعائها
 * في وضع المجموعة: تقوم العملية الرئيسية بإنشاء عمليات فرعية
 * في وضع العامل: تقوم بتشغيل السيرفر
 */
export function startClusterMode() {
  // إذا كان العملية الحالية هي العملية الرئيسية
  if (cluster.isPrimary) {
    console.log(`🚀 Master ${process.pid} is running`);
    console.log(`Creating ${WORKERS_COUNT} workers...`);
    
    // تتبع إعادة تشغيل العمال
    let restartCount = 0;
    const maxRestarts = 20;
    const restartInterval = 60000; // 1 دقيقة
    let lastRestartTime = Date.now();
    
    // إنشاء عمليات فرعية
    for (let i = 0; i < WORKERS_COUNT; i++) {
      cluster.fork();
    }
    
    // سجل عندما يبدأ عامل جديد
    cluster.on('online', (worker) => {
      console.log(`Worker ${worker.process.pid} is online`);
    });
    
    // إعادة تشغيل العمال عند الخروج
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
      
      // إعادة ضبط عداد إعادة التشغيل إذا مرت فترة كافية
      if (Date.now() - lastRestartTime > restartInterval) {
        restartCount = 0;
        lastRestartTime = Date.now();
      }
      
      // إعادة تشغيل إذا لم نتجاوز الحد الأقصى
      if (restartCount < maxRestarts) {
        console.log(`Restarting worker... (restart ${restartCount + 1}/${maxRestarts})`);
        cluster.fork();
        restartCount++;
      } else {
        console.error(`Too many worker restarts (${restartCount}), not restarting.`);
      }
    });
    
    // تنظيف دوري
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      console.log(`Master memory usage: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`);
    }, 300000); // كل 5 دقائق
  } else {
    // الكود يتم تنفيذه في العمليات الفرعية
    startWorker();
  }
}

// تشغيل السيرفر في العملية الفرعية
function startWorker() {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  
  // إنشاء سيرفر مع الخيارات المناسبة لوضع المجموعة
  const { server } = createServer();
  
  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} started server on port ${PORT}`);
  });
  
  // التعامل مع الأخطاء غير المعالجة
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception in worker ${process.pid}:`, err);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`Unhandled rejection in worker ${process.pid}:`, reason);
  });
} 