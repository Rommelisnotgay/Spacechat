/**
 * Enhanced WebRTC Configurations
 * 
 * This file contains different configurations for WebRTC optimized
 * to work in different network conditions.
 * The server provides dynamic TURN credentials.
 */
import axios from 'axios';

// بيانات خادم TURN - استيراد من متغيرات البيئة أو استخدام قيم احتياطية
// SECURITY: These are intentionally obfuscated/empty as they are loaded dynamically
// from the server or .env files in production
const METERED_TURN_USERNAME = ""; // Will be fetched from server
const METERED_TURN_CREDENTIAL = ""; // Will be fetched from server
const METERED_API_KEY = ""; // Will be fetched from server

// Track if we've fetched credentials from server
let hasFetchedCredentials = false;

// Function to get dynamic credentials from API directly
export async function fetchTurnCredentialsFromAPI(): Promise<RTCConfiguration | null> {
  try {
    // ENHANCED SECURITY: Avoid direct API calls with keys from front end
    // Instead, proxy through backend server which manages keys securely
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/turn-credentials/metered`);
    
    if (!response.ok) {
      console.error('Failed to fetch TURN credentials from API');
      return null;
    }
    
    const data = await response.json();
    if (data && data.iceServers && Array.isArray(data.iceServers)) {
      hasFetchedCredentials = true;
      return {
        iceServers: data.iceServers,
        iceCandidatePoolSize: 15,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch TURN credentials from API');
    return null;
  }
}

// Helper function to get base URL based on environment
function getBaseUrl(): string {
  // استخدام متغير البيئة إذا كان متوفرًا
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // في بيئة الإنتاج، استخدم نفس المصدر
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  
  // في بيئة التطوير، استخدم المضيف مع المنفذ المخصص للخادم
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  const serverPort = import.meta.env.VITE_SERVER_PORT || '8080';
  return `${protocol}//${host}:${serverPort}`;
}

// Function to get dynamic credentials from server
export async function fetchTurnCredentials(): Promise<RTCConfiguration | null> {
  try {
    // تحديد عنوان API بطريقة مرنة تعمل في أي بيئة
    const baseUrl = getBaseUrl();
    
    // Add a timeout to the request to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await axios.get(`${baseUrl}/api/turn-credentials`, {
      signal: controller.signal,
      timeout: 8000
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    if (response.data && response.data.success && response.data.rtcConfig) {
      hasFetchedCredentials = true;
      return response.data.rtcConfig;
    }
    
    console.warn('Server returned invalid TURN credentials format, using fallback');
    return null;
  } catch (error) {
    // More detailed error logging
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('TURN credentials request timed out');
      } else if (error.response) {
        console.error(`TURN credentials request failed with status ${error.response.status}`);
      } else if (error.request) {
        console.error('TURN credentials request made but no response received');
      } else {
        console.error('Failed to fetch TURN credentials');
      }
    } else {
      console.error('Failed to fetch TURN credentials, using fallback');
    }
    
    return null;
  }
}

// تحديث الإعداد القياسي باستخدام بيانات اعتماد من الخادم
export const standardRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // STUN servers (public & free)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 15,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// SECURITY: Placeholders only - actual credentials loaded dynamically
const TWILIO_TURN_USERNAME = "";
const TWILIO_TURN_CREDENTIAL = "";
const XIRSYS_TURN_USERNAME = "";
const XIRSYS_TURN_CREDENTIAL = "";

// تكوين موسع يشمل عدة خوادم TURN
export const enhancedTurnConfiguration: RTCConfiguration = {
  iceServers: [
    // Google STUN (free)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 15,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// TURN-only configuration for difficult networks and restrictive firewalls
export const turnOnlyRtcConfiguration: RTCConfiguration = enhancedTurnConfiguration;

// Fast connection configuration
export const fastRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 8,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Optimized configuration for local connections
export const localRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" }
  ],
  iceCandidatePoolSize: 3,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// جلب التكوين الأمثل بناءً على ظروف الشبكة
export async function getOptimalRtcConfiguration(): Promise<RTCConfiguration> {
  try {
    // أولاً محاولة الحصول على البيانات من الخادم
    if (!hasFetchedCredentials) {
      const serverConfig = await fetchTurnCredentials();
      if (serverConfig) {
        return serverConfig;
      }
      
      // إذا فشل ذلك، جرب الحصول على البيانات مباشرة من API
      const apiConfig = await fetchTurnCredentialsFromAPI();
      if (apiConfig) {
        return apiConfig;
      }
    }
    
    // استخدام التكوين القياسي كخيار أخير
    return standardRtcConfiguration;
  } catch (error) {
    console.error('Error in getOptimalRtcConfiguration, using standard config');
    return standardRtcConfiguration;
  }
}