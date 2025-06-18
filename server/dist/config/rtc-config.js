"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTurnCredentials = generateTurnCredentials;
exports.getRtcConfiguration = getRtcConfiguration;
const axios_1 = __importDefault(require("axios"));
// Dynamic TURN server credentials generation
function generateTurnCredentials() {
    // بيانات ثابتة لمشروع مفتوح (بدون HMAC)
    return {
        username: 'openrelayproject',
        credential: 'openrelayproject',
        ttl: 86400,
        timestamp: Math.floor(Date.now() / 1000) + 86400
    };
}
// Function to fetch TURN servers from a third-party service (if using one)
async function fetchExternalTurnServers() {
    try {
        // Only attempt to fetch if environment variable is set
        if (process.env.TURN_SERVICE_URL) {
            const response = await axios_1.default.get(process.env.TURN_SERVICE_URL, {
                headers: {
                    'Authorization': `Bearer ${process.env.TURN_SERVICE_API_KEY || ''}`
                }
            });
            if (response.data && response.data.iceServers) {
                return response.data.iceServers;
            }
        }
        return [];
    }
    catch (error) {
        console.error('Failed to fetch external TURN servers:', error);
        return [];
    }
}
// Get RTC configuration based on environment
async function getRtcConfiguration() {
    const credentials = generateTurnCredentials();
    // Base configuration
    const standardConfig = {
        iceServers: [
            // TURN/STUN مجانية وموثوقة
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302',
                    'stun:stun.cloudflare.com:3478',
                    'turn:openrelay.metered.ca:80',
                    'turn:openrelay.metered.ca:443',
                    'turns:openrelay.metered.ca:443',
                    'turn:global.relay.metered.ca:80',
                    'turn:global.relay.metered.ca:443',
                    'turns:global.relay.metered.ca:443'
                ],
                username: credentials.username,
                credential: credentials.credential
            }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
    return {
        rtcConfig: standardConfig,
        credentials
    };
}
