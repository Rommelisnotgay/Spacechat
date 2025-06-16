"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
// تكوين نظام تسجيل الأخطاء
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};
// تحديد مستوى التسجيل بناءً على بيئة التشغيل
const CURRENT_LOG_LEVEL = process.env.NODE_ENV === 'production'
    ? LOG_LEVELS.INFO
    : LOG_LEVELS.DEBUG;
// تهيئة مجلد السجلات إذا لم يكن موجوداً
const LOG_DIR = path_1.default.join(__dirname, '../../../logs');
try {
    if (!fs_1.default.existsSync(LOG_DIR)) {
        fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
    }
}
catch (error) {
    console.error('Failed to create log directory:', error);
}
// إنشاء اسم ملف سجل جديد لكل يوم
function getLogFilePath() {
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return path_1.default.join(LOG_DIR, `spacechat-${dateString}.log`);
}
// تنسيق رسائل السجل
function formatLogMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;
    // إضافة البيانات الوصفية إذا وجدت
    if (meta) {
        try {
            if (typeof meta === 'object') {
                formattedMessage += '\n' + JSON.stringify(meta, null, 2);
            }
            else {
                formattedMessage += '\n' + (0, util_1.format)(meta);
            }
        }
        catch (error) {
            formattedMessage += '\n[Error formatting metadata]';
        }
    }
    return formattedMessage;
}
// كتابة رسالة في السجل
function writeLog(level, levelValue, message, meta) {
    if (levelValue > CURRENT_LOG_LEVEL)
        return;
    const formattedMessage = formatLogMessage(level, message, meta);
    // طباعة في وحدة التحكم
    console.log(formattedMessage);
    // كتابة في ملف (فقط في الإنتاج)
    if (process.env.NODE_ENV === 'production') {
        try {
            fs_1.default.appendFileSync(getLogFilePath(), formattedMessage + '\n');
        }
        catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
}
// واجهة المسجل
exports.default = {
    error: (message, meta) => writeLog('ERROR', LOG_LEVELS.ERROR, message, meta),
    warn: (message, meta) => writeLog('WARN', LOG_LEVELS.WARN, message, meta),
    info: (message, meta) => writeLog('INFO', LOG_LEVELS.INFO, message, meta),
    debug: (message, meta) => writeLog('DEBUG', LOG_LEVELS.DEBUG, message, meta),
    // سجل خاص بتتبع طلبات معينة
    request: (req, message) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];
        writeLog('INFO', LOG_LEVELS.INFO, `${message} [IP: ${ip}]`, {
            method: req.method,
            url: req.url,
            userAgent,
            timestamp: new Date().toISOString()
        });
    },
    // سجل خاص بأحداث WebRTC
    webrtc: (userId, event, details) => {
        writeLog('INFO', LOG_LEVELS.INFO, `WebRTC [${userId}] ${event}`, details);
    }
};
