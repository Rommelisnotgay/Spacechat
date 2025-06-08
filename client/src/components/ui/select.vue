<template>
  <div class="relative w-full">
    <button 
      type="button" 
      ref="triggerRef" 
      @click="toggleOpen"
      class="w-full flex items-center justify-between bg-purple-500/20 border-purple-500/30 rounded-full h-8 px-3 text-xs shadow-lg shadow-purple-500/20 text-white"
    >
      <span>{{ displayValue || placeholder }}</span>
      <span class="ml-1">▼</span>
    </button>
    
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div 
        v-if="isOpen"
        ref="contentRef"
        class="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
      >
        <div class="py-1">
          <slot>
            <slot name="placeholder">
              <div class="px-3 py-2 text-xs text-gray-400">No items</div>
            </slot>
          </slot>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  placeholder: {
    type: String,
    default: 'Select an option'
  },
  options: {
    type: Array as () => Array<{value: string | number, label: string}>,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const displayValue = computed(() => {
  if (props.options && props.options.length) {
    const option = props.options.find(opt => opt.value === props.modelValue);
    return option ? option.label : '';
  }
  return props.modelValue;
});

const toggleOpen = () => {
  isOpen.value = !isOpen.value;
};

const handleClickOutside = (event: MouseEvent) => {
  if (
    isOpen.value &&
    triggerRef.value &&
    contentRef.value &&
    !triggerRef.value.contains(event.target as Node) && 
    !contentRef.value.contains(event.target as Node)
  ) {
    isOpen.value = false;
  }
};

const selectOption = (value: string | number) => {
  emit('update:modelValue', value);
  emit('change', value);
  isOpen.value = false;
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.select-enter-active,
.select-leave-active {
  transition: all 0.3s ease;
}
.select-enter-from,
.select-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style> 