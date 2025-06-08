<template>
  <div class="audio-meter">
    <div v-if="label" class="meter-label">{{ label }}</div>
    <div class="meter-container">
      <div class="meter-bar" :style="{ width: `${audioLevel}%` }"></div>
      <div class="meter-tick" v-for="n in 10" :key="n"></div>
    </div>
    <div class="meter-value" v-if="showValue">{{ audioLevel.toFixed(0) }}%</div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, watch } from 'vue';
import type { PropType } from 'vue';

export default defineComponent({
  name: 'AudioMeter',
  
  props: {
    stream: {
      type: Object as PropType<MediaStream | null>,
      default: null
    },
    label: {
      type: String,
      default: ''
    },
    showValue: {
      type: Boolean,
      default: false
    }
  },
  
  setup(props) {
    const audioLevel = ref(0);
    const audioContext = ref<AudioContext | null>(null);
    const analyser = ref<AnalyserNode | null>(null);
    const dataArray = ref<Uint8Array | null>(null);
    const animationFrame = ref<number | null>(null);
    
    // إيقاف مراقبة الصوت
    const stopAnalyser = () => {
      if (animationFrame.value) {
        cancelAnimationFrame(animationFrame.value);
        animationFrame.value = null;
      }
      
      if (audioContext.value) {
        audioContext.value.close().catch(error => {
          console.error('Error closing AudioContext:', error);
        });
        audioContext.value = null;
        analyser.value = null;
        dataArray.value = null;
      }
    };
    
    // بدء مراقبة الصوت
    const startAnalyser = (stream: MediaStream) => {
      // إيقاف أي مراقبة سابقة
      stopAnalyser();
      
      try {
        // إنشاء سياق الصوت
        audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // إنشاء محلل للصوت
        analyser.value = audioContext.value.createAnalyser();
        analyser.value.fftSize = 256;
        analyser.value.smoothingTimeConstant = 0.8;
        
        // إنشاء مصدر الصوت من الستريم
        const source = audioContext.value.createMediaStreamSource(stream);
        source.connect(analyser.value);
        
        // إنشاء مصفوفة للبيانات
        const bufferLength = analyser.value.frequencyBinCount;
        dataArray.value = new Uint8Array(bufferLength);
        
        // بدء تحديث المستوى بشكل مستمر
        updateLevel();
      } catch (error) {
        console.error('Error initializing audio analyser:', error);
        audioLevel.value = 0;
      }
    };
    
    // تحديث مستوى الصوت
    const updateLevel = () => {
      if (!analyser.value || !dataArray.value) return;
      
      // قراءة البيانات من المحلل
      analyser.value.getByteFrequencyData(dataArray.value);
      
      // حساب متوسط القيم
      let sum = 0;
      for (let i = 0; i < dataArray.value.length; i++) {
        sum += dataArray.value[i];
      }
      const average = sum / dataArray.value.length;
      
      // تحويل إلى نسبة مئوية (0-100)
      audioLevel.value = (average / 255) * 100;
      
      // جدولة التحديث التالي
      animationFrame.value = requestAnimationFrame(updateLevel);
    };
    
    // مراقبة تغيرات الستريم
    watch(() => props.stream, (newStream) => {
      if (newStream && newStream.getAudioTracks().length > 0) {
        startAnalyser(newStream);
      } else {
        stopAnalyser();
        audioLevel.value = 0;
      }
    }, { immediate: true });
    
    // تنظيف عند إزالة المكون
    onUnmounted(() => {
      stopAnalyser();
    });
    
    return {
      audioLevel
    };
  }
});
</script>

<style scoped>
.audio-meter {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 5px 0;
}

.meter-label {
  font-size: 0.8rem;
  margin-bottom: 2px;
  color: #666;
}

.meter-container {
  position: relative;
  height: 10px;
  background-color: #e9ecef;
  border-radius: 5px;
  overflow: hidden;
}

.meter-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(to right, #28a745, #ffc107, #dc3545);
  border-radius: 5px;
  transition: width 0.1s ease;
}

.meter-tick {
  position: absolute;
  width: 1px;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.1);
}

.meter-tick:nth-child(2) { left: 10%; }
.meter-tick:nth-child(3) { left: 20%; }
.meter-tick:nth-child(4) { left: 30%; }
.meter-tick:nth-child(5) { left: 40%; }
.meter-tick:nth-child(6) { left: 50%; }
.meter-tick:nth-child(7) { left: 60%; }
.meter-tick:nth-child(8) { left: 70%; }
.meter-tick:nth-child(9) { left: 80%; }
.meter-tick:nth-child(10) { left: 90%; }

.meter-value {
  font-size: 0.75rem;
  color: #666;
  margin-top: 2px;
  text-align: right;
}
</style> 