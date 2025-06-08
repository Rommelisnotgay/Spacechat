# أوامر طرفية Glitch لتهيئة مشروع SpaceChat.live

يمكنك استخدام هذه الأوامر في طرفية Glitch لتهيئة المشروع بعد رفعه.

## إعداد المتغيرات البيئية

```bash
echo "NODE_ENV=production" >> .env
echo "PORT=3000" >> .env
```

## حذف الملفات الافتراضية

```bash
rm server.js
rm -rf public
rm -rf views
rm -rf routes
```

## تثبيت التبعيات وبناء المشروع

```bash
npm run install:all
npm run build
```

## تكوين Glitch للخدمة المستمرة

يمكنك استخدام خدمة UptimeRobot للحفاظ على المشروع نشطًا.
رابط موقعك سيكون: `https://PROJECT_NAME.glitch.me`

أضف هذا الرابط إلى UptimeRobot مع فترة ping كل 5 دقائق.

## للمراقبة المستمرة للسجلات

```bash
# مراقبة سجلات التطبيق
tail -f /app/logs/app.log

# مراقبة سجلات الخادم
tail -f /app/logs/server.log
```

## لإعادة تشغيل الخادم يدويًا

```bash
refresh
```

## لتنظيف الكاش وذاكرة التخزين المؤقت

```bash
npm run clean
refresh
```

## للتحقق من حالة العملية

```bash
ps aux
```

## مثال لهيكل ملف .env

```
NODE_ENV=production
PORT=3000
``` 