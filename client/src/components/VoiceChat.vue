<template>
  <div class="voice-chat-container">
    <!-- إضافة مؤشر حالة الاتصال -->
    <div class="connection-status" :class="webrtcState">
      <span>{{ connectionStatusText }}</span>
      <div v-if="webrtcState === 'connecting'" class="reconnecting-info">
        <div class="spinner"></div>
        <span>{{ connectionDiagnosticInfo }}</span>
      </div>
    </div>
    
    <!-- ... existing UI components ... -->
  </div>
</template>

<script setup lang="ts">
// ... existing imports ...
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useWebRTC } from '@/services/webrtc';
// ... existing code ...

// استخدام خدمة WebRTC
const webrtc = useWebRTC();
const webrtcState = computed(() => webrtc.connectionState.value);

// إضافة متغيرات حالة الاتصال
const connectionDiagnosticInfo = ref('جاري إنشاء الاتصال...');
const connectionTryCount = ref(0);

// Calculate connection status text
const connectionStatusText = computed(() => {
  switch (webrtcState.value) {
    case 'connected':
      return 'متصل';
    case 'connecting':
      return `جاري الاتصال... (محاولة ${connectionTryCount.value})`;
    case 'disconnected':
      return 'غير متصل';
    case 'failed':
      return 'فشل الاتصال';
    default:
      return 'غير معروف';
  }
});

// مراقبة تغييرات حالة الاتصال
watch(webrtcState, (newState, oldState) => {
  if (newState === 'connecting' && oldState === 'connecting') {
    connectionTryCount.value++;
  } else if (newState === 'connecting' && oldState !== 'connecting') {
    connectionTryCount.value = 1;
  }
  
  // تحديث معلومات التشخيص
  if (newState === 'connecting') {
    updateDiagnosticInfo();
  }
});

// تحديث معلومات التشخيص
const updateDiagnosticInfo = async () => {
  try {
    const stats = webrtc.diagnosticReport;
    if (stats) {
      connectionDiagnosticInfo.value = `
        حالة الاتصال: ${stats.connectionState || 'غير معروف'}
        مسارات محلية: ${stats.localTracks || 0}
        مسارات بعيدة: ${stats.remoteTracks || 0}
        محاولات إعادة الاتصال: ${stats.connectionRetries || 0}
        آخر خطأ: ${stats.lastError || 'لا يوجد'}
        `;
    }
  } catch (error) {
    console.error('Error getting diagnostic info:', error);
    connectionDiagnosticInfo.value = 'غير قادر على الحصول على معلومات التشخيص';
  }
  
  // تحديث المعلومات كل 5 ثوانٍ إذا كان لا يزال في حالة الاتصال
  if (webrtcState.value === 'connecting') {
    setTimeout(updateDiagnosticInfo, 5000);
  }
};
// ... existing code ...
</script>

<style scoped>
/* ... existing styles ... */
.connection-status {
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 10px;
  text-align: center;
  font-weight: bold;
}

.connection-status.connected {
  background-color: rgba(0, 128, 0, 0.2);
  color: #00c853;
}

.connection-status.connecting {
  background-color: rgba(255, 152, 0, 0.2);
  color: #ffa000;
}

.connection-status.disconnected,
.connection-status.failed {
  background-color: rgba(244, 67, 54, 0.2);
  color: #f44336;
}

.reconnecting-info {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 5px;
  font-size: 0.8em;
  opacity: 0.8;
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 152, 0, 0.2);
  border-top: 2px solid #ffa000;
  border-radius: 50%;
  margin-right: 5px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
/* ... existing styles ... */
</style>
// ... existing code ... 