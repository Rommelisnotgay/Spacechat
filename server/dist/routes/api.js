"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rtc_config_1 = require("../config/rtc-config");
const geo_location_1 = require("../services/geo-location");
const router = express_1.default.Router();
// Endpoint to retrieve TURN credentials
router.get('/turn-credentials', async (req, res) => {
    try {
        const { rtcConfig, credentials } = await (0, rtc_config_1.getRtcConfiguration)();
        // Send complete configuration with expiry time
        res.json({
            success: true,
            rtcConfig,
            expires: credentials.timestamp
        });
    }
    catch (error) {
        console.error('Error generating TURN credentials:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate TURN credentials'
        });
    }
});
// User statistics
router.get('/stats', (req, res) => {
    // This will be implemented in the main index.ts file
    // Provided here for future integration
    res.status(404).json({
        message: 'Endpoint moved to main server file'
    });
});
// Get all available countries
router.get('/countries', (req, res) => {
    res.json((0, geo_location_1.getAllCountries)());
});
// Diagnostics endpoint for WebRTC
router.post('/webrtc-diagnostics', (req, res) => {
    const diagnosticData = req.body;
    // Log diagnostic data for analysis
    console.log('WebRTC diagnostics received:', JSON.stringify(diagnosticData));
    // In the future, this could store diagnostics in a database
    res.json({
        success: true,
        message: 'Diagnostic data received',
        recommendedConfig: 'turns' // Recommend the most reliable config
    });
});
exports.default = router;
