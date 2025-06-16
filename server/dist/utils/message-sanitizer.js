"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMessage = sanitizeMessage;
exports.isMessageSafe = isMessageSafe;
const bad_words_1 = __importDefault(require("bad-words"));
const logger_1 = __importDefault(require("./logger"));
// إنشاء مرشح الكلمات السيئة مع كلمات إضافية خاصة بالعربية
const filter = new bad_words_1.default();
// إضافة كلمات غير لائقة بالعربية والإنجليزية
const arabicBadWords = [
// قائمة كلمات غير لائقة بالعربية لم يتم تضمينها هنا للحفاظ على الأدب
// يمكن للمطورين إضافة الكلمات المناسبة هنا
];
// إضافة الكلمات للمرشح
if (arabicBadWords.length > 0) {
    filter.addWords(...arabicBadWords);
}
/**
 * تنظيف رسالة من المحتوى غير المرغوب فيه
 * @param message الرسالة المراد تنظيفها
 * @returns الرسالة بعد التنظيف
 */
function sanitizeMessage(message) {
    if (!message)
        return '';
    try {
        // إزالة أكواد HTML محتملة
        let sanitized = message
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/script/gi, 'scrμpt')
            .replace(/on\w+\s*=/gi, 'data-blocked='); // منع معالجات الأحداث
        // تنقية الكلمات السيئة
        sanitized = filter.clean(sanitized);
        // الحد من طول الرسالة
        const MAX_MESSAGE_LENGTH = 500;
        if (sanitized.length > MAX_MESSAGE_LENGTH) {
            sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH) + '...';
        }
        return sanitized;
    }
    catch (error) {
        logger_1.default.error('Error sanitizing message', { error, message });
        return '[Message removed due to content policy]';
    }
}
/**
 * تحقق من أمان محتوى الرسالة
 * @param message الرسالة المراد التحقق منها
 * @returns true إذا كانت الرسالة آمنة، false إذا كانت غير آمنة
 */
function isMessageSafe(message) {
    if (!message || message.trim() === '')
        return false;
    try {
        // فحص طول الرسالة
        if (message.length > 2000)
            return false;
        // فحص الكلمات السيئة
        if (filter.isProfane(message))
            return false;
        // فحص روابط محتملة خطرة
        const suspiciousLinkPatterns = [
            /phish/i,
            /hack/i,
            /malware/i,
            /exploit/i,
            /download\s+now/i,
            /click\s+here/i
        ];
        // فحص إذا كان هناك أي نمط مشبوه
        for (const pattern of suspiciousLinkPatterns) {
            if (pattern.test(message))
                return false;
        }
        // فحص تكرار الحروف (مثل الرسائل المزعجة)
        const repeatedCharsRegex = /(.)\1{9,}/;
        if (repeatedCharsRegex.test(message))
            return false;
        // فحص رسائل ALL CAPS
        const uppercaseRatio = message.split('').filter(c => c >= 'A' && c <= 'Z').length / message.length;
        if (message.length > 10 && uppercaseRatio > 0.8)
            return false;
        return true;
    }
    catch (error) {
        logger_1.default.error('Error checking message safety', { error, message });
        return false;
    }
}
exports.default = {
    sanitizeMessage,
    isMessageSafe
};
