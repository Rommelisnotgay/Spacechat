<template>
  <div class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-purple-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="bg-purple-800 p-4 flex justify-between items-center">
        <h2 class="text-xl font-bold text-white">Support</h2>
        <button @click="$emit('close')" class="text-white opacity-70 hover:opacity-100">✕</button>
      </div>
      
      <!-- Content -->
      <div class="p-4">
        <!-- Tabs -->
        <div class="flex border-b border-purple-700 mb-4">
          <button 
            @click="activeTab = 'report'"
            class="px-4 py-2 font-medium text-sm transition-colors"
            :class="activeTab === 'report' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-white opacity-70 hover:opacity-100'"
          >
            Report User
          </button>
          <button 
            @click="activeTab = 'help'"
            class="px-4 py-2 font-medium text-sm transition-colors"
            :class="activeTab === 'help' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-white opacity-70 hover:opacity-100'"
          >
            Help & FAQ
          </button>
          <button 
            @click="activeTab = 'feedback'"
            class="px-4 py-2 font-medium text-sm transition-colors"
            :class="activeTab === 'feedback' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-white opacity-70 hover:opacity-100'"
          >
            Feedback
          </button>
        </div>
        
        <!-- Report Tab -->
        <div v-if="activeTab === 'report'" class="text-white">
          <div v-if="reportSubmitted">
            <div class="text-center py-6">
              <div class="text-yellow-400 text-4xl mb-4">✓</div>
              <h3 class="text-xl font-bold mb-2">Report Submitted</h3>
              <p class="text-gray-300 mb-4">Thank you for your report. We'll review it promptly.</p>
              <button 
                @click="reportSubmitted = false"
                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Submit Another Report
              </button>
            </div>
          </div>
          <div v-else>
            <p class="mb-4">Please provide details about the issue you're reporting:</p>
            
            <form @submit.prevent="submitReport" class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Report Type</label>
                <select 
                  v-model="reportForm.type"
                  class="w-full bg-purple-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  required
                >
                  <option value="">Select a reason</option>
                  <option value="inappropriate">Inappropriate Content/Behavior</option>
                  <option value="harassment">Harassment or Bullying</option>
                  <option value="underage">Underage User</option>
                  <option value="technical">Technical Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Description</label>
                <textarea 
                  v-model="reportForm.description"
                  rows="4"
                  class="w-full bg-purple-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Please describe the issue in detail..."
                  required
                ></textarea>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Your Email (optional)</label>
                <input 
                  v-model="reportForm.email"
                  type="email"
                  class="w-full bg-purple-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="your@email.com"
                />
                <p class="text-xs text-gray-400 mt-1">We'll only contact you if we need more information.</p>
              </div>
              
              <div class="flex justify-end">
                <button 
                  type="submit"
                  class="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- Help Tab -->
        <div v-if="activeTab === 'help'" class="text-white">
          <div class="space-y-4">
            <div v-for="(faq, index) in faqs" :key="index" class="mb-4">
              <button 
                @click="toggleFaq(index)"
                class="flex justify-between items-center w-full text-left font-medium py-2 border-b border-purple-700"
              >
                <span>{{ faq.question }}</span>
                <span class="transform transition-transform" :class="{'rotate-180': openFaq === index}">▼</span>
              </button>
              <div 
                v-if="openFaq === index"
                class="py-2 text-gray-300 text-sm"
              >
                {{ faq.answer }}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Feedback Tab -->
        <div v-if="activeTab === 'feedback'" class="text-white">
          <div v-if="feedbackSubmitted">
            <div class="text-center py-6">
              <div class="text-yellow-400 text-4xl mb-4">✓</div>
              <h3 class="text-xl font-bold mb-2">Feedback Submitted</h3>
              <p class="text-gray-300 mb-4">Thank you for your feedback! We appreciate your input.</p>
              <button 
                @click="feedbackSubmitted = false"
                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Submit More Feedback
              </button>
            </div>
          </div>
          <div v-else>
            <p class="mb-4">Help us improve SpaceTalk.live with your feedback:</p>
            
            <form @submit.prevent="submitFeedback" class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">How would you rate your experience?</label>
                <div class="flex space-x-2 mb-2">
                  <button 
                    v-for="i in 5" 
                    :key="i"
                    type="button"
                    @click="feedbackForm.rating = i"
                    class="text-2xl"
                    :class="i <= feedbackForm.rating ? 'text-yellow-400' : 'text-gray-600'"
                  >
                    ★
                  </button>
                </div>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Your Feedback</label>
                <textarea 
                  v-model="feedbackForm.comment"
                  rows="4"
                  class="w-full bg-purple-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="What did you like? What could be improved?"
                  required
                ></textarea>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1">Feature Request</label>
                <input 
                  v-model="feedbackForm.featureRequest"
                  type="text"
                  class="w-full bg-purple-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Any features you'd like to see?"
                />
              </div>
              
              <div class="flex justify-end">
                <button 
                  type="submit"
                  class="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors"
                >
                  Submit Feedback
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Active tab
const activeTab = ref('report');

// Report form
const reportForm = ref({
  type: '',
  description: '',
  email: '',
});
const reportSubmitted = ref(false);

// Feedback form
const feedbackForm = ref({
  rating: 0,
  comment: '',
  featureRequest: '',
});
const feedbackSubmitted = ref(false);

// FAQ items
const faqs = [
  {
    question: 'How does matching work?',
    answer: 'Our system matches you randomly with other online users. You can use the "Any Vibe" filter to find users with similar interests.'
  },
  {
    question: 'Is my conversation data saved?',
    answer: 'No. Your audio is transmitted directly between you and your partner (peer-to-peer) and is never stored on our servers. Text chat is only stored temporarily during your session.'
  },
  {
    question: 'How do I report inappropriate behavior?',
    answer: 'Use the Report tab in this Support panel to submit a report. Please provide as much detail as possible so we can address the issue effectively.'
  },
  {
    question: 'Can I reconnect with someone I talked to before?',
    answer: 'Yes! Go to the History panel to see your past connections. You can attempt to reconnect if that user is currently online.'
  },
  {
    question: 'Why can\'t I hear the other person?',
    answer: 'This could be due to microphone permissions, connection issues, or the other person may have muted their microphone. Try refreshing the page or checking your browser permissions.'
  }
];
const openFaq = ref<number | null>(null);

// Toggle FAQ item
function toggleFaq(index: number) {
  if (openFaq.value === index) {
    openFaq.value = null;
  } else {
    openFaq.value = index;
  }
}

// Submit report
function submitReport() {
  // In a real implementation, this would send the report to a server
  console.log('Report submitted:', reportForm.value);
  
  // Reset form and show success message
  reportSubmitted.value = true;
  reportForm.value = {
    type: '',
    description: '',
    email: '',
  };
}

// Submit feedback
function submitFeedback() {
  // In a real implementation, this would send the feedback to a server
  console.log('Feedback submitted:', feedbackForm.value);
  
  // Reset form and show success message
  feedbackSubmitted.value = true;
  feedbackForm.value = {
    rating: 0,
    comment: '',
    featureRequest: '',
  };
}
</script>

<style scoped>
.fixed {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style> 