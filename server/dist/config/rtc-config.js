"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTurnCredentials = generateTurnCredentials;
exports.getRtcConfiguration = getRtcConfiguration;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
// Dynamic TURN server credentials generation
function generateTurnCredentials(hmacKey = process.env.TURN_HMAC_KEY || 'default-hmac-key') {
    const ttl = 86400; // 24 hour validity
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:spacechat`;
    // Create HMAC for credential verification
    const hmac = crypto_1.default
        .createHmac('sha1', hmacKey)
        .update(username)
        .digest('base64');
    return {
        username,
        credential: hmac,
        ttl,
        timestamp
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
    let externalServers = [];
    // Try to fetch external TURN servers if available
    try {
        externalServers = await fetchExternalTurnServers();
    }
    catch (error) {
        console.warn('Using default TURN servers due to error fetching external servers');
    }
    // Primary configuration - use environment variables if available
    const turnUsername = process.env.TURN_USERNAME || credentials.username;
    const turnCredential = process.env.TURN_CREDENTIAL || credentials.credential;
    // Get primary TURN server from environment or use default
    const primaryTurnServer = process.env.PRIMARY_TURN_SERVER || 'global.relay.metered.ca';
    // Base configuration
    const standardConfig = {
        iceServers: [
            // Primary TURN servers - reliable commercial service
            {
                urls: [
                    `turns:${primaryTurnServer}:443`,
                    `turn:${primaryTurnServer}:443?transport=tcp`,
                    `turn:${primaryTurnServer}:80?transport=tcp`,
                    `turn:${primaryTurnServer}:80`
                ],
                username: turnUsername,
                credential: turnCredential
            },
            // Add external servers if available
            ...externalServers,
            // Backup TURN servers if primary fails
            {
                urls: [
                    'turns:global.turn.twilio.com:443?transport=tcp',
                    'turn:global.turn.twilio.com:3478?transport=udp'
                ],
                username: process.env.TWILIO_TURN_USERNAME || 'openrelayproject',
                credential: process.env.TWILIO_TURN_CREDENTIAL || 'openrelayproject'
            },
            // Public STUN servers (no auth needed)
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
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
