import { z, ZodError } from 'zod';

/**
 * دالة مساعدة للتحقق من صحة البيانات باستخدام Zod
 * @param schema - مخطط Zod للتحقق
 * @param data - البيانات المراد التحقق منها
 * @returns نتيجة تحتوي على إما البيانات المتحقق منها أو خطأ
 */
export const validate = <T>(schema: z.ZodType<T>, data: unknown): { 
  success: true; 
  data: T; 
} | { 
  success: false; 
  error: string; 
} => {
  try {
    // تطبيق التحقق وإرجاع البيانات في حالة النجاح
    const validData = schema.parse(data);
    return {
      success: true,
      data: validData
    };
  } catch (error) {
    // معالجة أخطاء Zod
    if (error instanceof ZodError) {
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

/**
 * دالة مساعدة للتحقق من نوع اللعبة وإرجاع المخطط المناسب
 * @param gameType - نوع اللعبة
 * @param moveSchemaMap - خريطة المخططات لأنواع الألعاب المختلفة
 * @returns المخطط المناسب أو null إذا كان نوع اللعبة غير معروف
 */
export const getGameSpecificSchema = <T>(
  gameType: string,
  moveSchemaMap: Record<string, z.ZodType<T>>
): z.ZodType<T> | null => {
  // التحقق من وجود مخطط للعبة المطلوبة
  if (moveSchemaMap[gameType]) {
    return moveSchemaMap[gameType];
  }
  
  // نوع لعبة غير مدعوم
  return null;
}; 