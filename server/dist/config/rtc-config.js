"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTurnCredentials = generateTurnCredentials;
exports.fetchMeteredTurnServers = fetchMeteredTurnServers;
exports.getRtcConfiguration = getRtcConfiguration;
const axios_1 = __importDefault(require("axios"));
// Dynamic TURN server credentials generation
function generateTurnCredentials() {
    // استخدام بيانات اعتماد من متغيرات البيئة، أو استخدام قيم افتراضية للنموذج المفتوح
    const username = process.env.METERED_TURN_USERNAME || 'openrelayproject';
    const credential = process.env.METERED_TURN_CREDENTIAL || 'openrelayproject';
    return {
        username,
        credential,
        ttl: 86400,
        timestamp: Math.floor(Date.now() / 1000) + 86400
    };
}
/**
 * Fetch external TURN servers from a third-party service if configured.
 * Uses secure environment variables instead of hardcoded credentials.
 */
async function fetchExternalTurnServers() {
    try {
        // Only attempt to fetch if environment variable is set
        if (process.env.TURN_SERVICE_URL) {
            const apiKey = process.env.TURN_SERVICE_API_KEY || '';
            // Log attempt to fetch but don't log sensitive details
            console.log(`Attempting to fetch TURN servers from external service`);
            const response = await axios_1.default.get(process.env.TURN_SERVICE_URL, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (response.data && response.data.iceServers) {
                console.log('Successfully fetched external TURN servers');
                return response.data.iceServers;
            }
        }
        return [];
    }
    catch (error) {
        console.error('Failed to fetch external TURN servers');
        return [];
    }
}
/**
 * Fetch TURN credentials from Metered API if configured
 * Uses environment variables for authentication
 */
async function fetchMeteredTurnServers() {
    try {
        // Only attempt to fetch if API key is configured
        const apiKey = process.env.METERED_API_KEY;
        if (!apiKey) {
            return [];
        }
        console.log(`Attempting to fetch TURN servers from Metered API`);
        const response = await axios_1.default.get(`https://spacetalk.metered.live/api/v1/turn/credentials`, {
            params: {
                apiKey
            }
        });
        if (response.data && Array.isArray(response.data)) {
            console.log('Successfully fetched Metered TURN servers');
            return response.data;
        }
        return [];
    }
    catch (error) {
        console.error('Failed to fetch Metered TURN servers');
        return [];
    }
}
// Get RTC configuration based on environment
async function getRtcConfiguration() {
    const credentials = generateTurnCredentials();
    // Try to fetch external TURN servers first
    let externalServers = await fetchExternalTurnServers();
    // If no external servers, try Metered API
    if (externalServers.length === 0) {
        externalServers = await fetchMeteredTurnServers();
    }
    // Base configuration - تكوين معزز للعمل عبر أي شبكات
    const standardConfig = {
        iceServers: [
            // STUN servers - خوادم متنوعة من مصادر مختلفة لزيادة احتمالية الاتصال
            {
                urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302',
                    'stun:stun.cloudflare.com:3478'
                ]
            },
            // TURN servers - اضافة نقاط نهاية متعددة لتفادي القيود الشبكية
            {
                urls: [
                    'turn:openrelay.metered.ca:80',
                    'turn:openrelay.metered.ca:80?transport=tcp',
                    'turn:openrelay.metered.ca:443',
                    'turn:openrelay.metered.ca:443?transport=tcp',
                    'turns:openrelay.metered.ca:443',
                    'turns:openrelay.metered.ca:443?transport=tcp',
                    'turn:global.relay.metered.ca:80',
                    'turn:global.relay.metered.ca:80?transport=tcp',
                    'turn:global.relay.metered.ca:443',
                    'turns:global.relay.metered.ca:443',
                    'turns:global.relay.metered.ca:443?transport=tcp'
                ],
                username: credentials.username,
                credential: credentials.credential
            }
        ],
        iceCandidatePoolSize: 15,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };
    // Add any external servers if available
    if (externalServers.length > 0) {
        // Make sure we're working with an array
        const existingIceServers = Array.isArray(standardConfig.iceServers)
            ? standardConfig.iceServers
            : [];
        standardConfig.iceServers = [...existingIceServers, ...externalServers];
    }
    return {
        rtcConfig: standardConfig,
        credentials
    };
}
