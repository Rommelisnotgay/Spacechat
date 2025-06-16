"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGameSpecificSchema = exports.validate = void 0;
const zod_1 = require("zod");
/**
 * دالة مساعدة للتحقق من صحة البيانات باستخدام Zod
 * @param schema - مخطط Zod للتحقق
 * @param data - البيانات المراد التحقق منها
 * @returns نتيجة تحتوي على إما البيانات المتحقق منها أو خطأ
 */
const validate = (schema, data) => {
    try {
        // تطبيق التحقق وإرجاع البيانات في حالة النجاح
        const validData = schema.parse(data);
        return {
            success: true,
            data: validData
        };
    }
    catch (error) {
        // معالجة أخطاء Zod
        if (error instanceof zod_1.ZodError) {
            // تحويل أخطاء Zod إلى نص مفهوم
            const errorMessage = error.errors
                .map(err => `${err.path.join('.')}: ${err.message}`)
                .join(', ');
            return {
                success: false,
                error: errorMessage
            };
        }
        // أي أخطاء أخرى
        return {
            success: false,
            error: 'حدث خطأ غير متوقع أثناء التحقق من صحة البيانات'
        };
    }
};
exports.validate = validate;
/**
 * دالة مساعدة للتحقق من نوع اللعبة وإرجاع المخطط المناسب
 * @param gameType - نوع اللعبة
 * @param moveSchemaMap - خريطة المخططات لأنواع الألعاب المختلفة
 * @returns المخطط المناسب أو null إذا كان نوع اللعبة غير معروف
 */
const getGameSpecificSchema = (gameType, moveSchemaMap) => {
    // التحقق من وجود مخطط للعبة المطلوبة
    if (moveSchemaMap[gameType]) {
        return moveSchemaMap[gameType];
    }
    // نوع لعبة غير مدعوم
    return null;
};
exports.getGameSpecificSchema = getGameSpecificSchema;
