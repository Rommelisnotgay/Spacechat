/**
 * Enhanced WebRTC Configurations
 * 
 * This file contains different configurations for WebRTC optimized
 * to work in different network conditions.
 * The server provides dynamic TURN credentials.
 */
import axios from 'axios';

// بيانات خادم TURN المُحدثة - استخدام البيانات المقدمة من المستخدم
const METERED_TURN_USERNAME = "d2e4870307a7be95c6173111";
const METERED_TURN_CREDENTIAL = "hmmLdoyJSvJe2KV2";
const METERED_API_KEY = "5d6664673bdb0b63f8da4ed1dd055a57a702";

// Track if we've fetched credentials from server
let hasFetchedCredentials = false;

// Function to get dynamic credentials from API directly
export async function fetchTurnCredentialsFromAPI(): Promise<RTCConfiguration | null> {
  try {
    const response = await fetch(`https://spacetalk.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
    
    if (!response.ok) {
      console.error('Failed to fetch TURN credentials from API:', response.status, response.statusText);
      return null;
    }
    
    const iceServers = await response.json();
    if (iceServers && Array.isArray(iceServers)) {
      hasFetchedCredentials = true;
      console.log('Successfully fetched TURN credentials from Metered API');
      return {
        iceServers,
        iceCandidatePoolSize: 15,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      };
    }
    
    console.warn('API returned invalid TURN credentials format, using fallback');
    return null;
  } catch (error) {
    console.error('Failed to fetch TURN credentials from API, using fallback:', error);
    return null;
  }
}

// Function to get dynamic credentials from server
export async function fetchTurnCredentials(): Promise<RTCConfiguration | null> {
  try {
    // Get API URL - use environment variable or default to current origin
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    
    // Log the URL we're trying to fetch from
    console.log(`Fetching TURN credentials from ${baseUrl}/api/turn-credentials`);
    
    // Add a timeout to the request to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // زيادة المهلة من 5000 إلى 8000
    
    const response = await axios.get(`${baseUrl}/api/turn-credentials`, {
      signal: controller.signal,
      timeout: 8000 // زيادة المهلة من 5000 إلى 8000
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    if (response.data && response.data.success && response.data.rtcConfig) {
      hasFetchedCredentials = true;
      console.log('Successfully fetched TURN credentials from server');
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
        console.error('Failed to fetch TURN credentials:', error.message);
      }
    } else {
      console.error('Failed to fetch TURN credentials, using fallback:', error);
    }
    
    return null;
  }
}

// تحديث الإعداد القياسي باستخدام خوادم TURN المقدمة من المستخدم
export const standardRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // STUN server
    {
      urls: "stun:stun.relay.metered.ca:80",
    },
    // TURN servers with the provided credentials
    {
      urls: "turn:global.relay.metered.ca:80",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    // إضافة خوادم STUN أساسية للدعم الإضافي
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 15,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// TURN-only configuration for difficult networks and restrictive firewalls
export const turnOnlyRtcConfiguration: RTCConfiguration = {
  iceServers: [
    // TURN servers with the provided credentials
    {
      urls: "turn:global.relay.metered.ca:80",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    }
  ],
  iceCandidatePoolSize: 15,
  iceTransportPolicy: 'relay', // Force using TURN servers only
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Fast connection configuration
export const fastRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL,
    }
  ],
  iceCandidatePoolSize: 8,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Optimized configuration for local connections
export const localRtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" }
  ],
  iceCandidatePoolSize: 3,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// جلب التكوين الأمثل بناءً على ظروف الشبكة
export async function getOptimalRtcConfiguration(): Promise<RTCConfiguration> {
  try {
    // أولاً محاولة الحصول على البيانات من Metered API مباشرة
    const apiConfig = await fetchTurnCredentialsFromAPI();
    if (apiConfig) {
      return apiConfig;
    }
    
    // ثانياً محاولة الحصول على البيانات من خادم التطبيق
    if (!hasFetchedCredentials) {
      const serverConfig = await fetchTurnCredentials();
      if (serverConfig) {
        return serverConfig;
      }
    }
  } catch (error) {
    console.error('Error fetching optimal configuration:', error);
  }

  // استخدام التكوين القياسي المحدث إذا فشلت المحاولتين
  return standardRtcConfiguration;
} 