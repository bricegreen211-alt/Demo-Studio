/*
 * Entry for the dashboard's vendored voice SDK bundle (window.CdsVoice).
 * Built with: node assets/build-voice-sdk.js  ->  apps/studio/renderer/vendor/cds-voice-sdk.js
 * Powers the Voice Agent list's INLINE Call / Mute / End controls;
 * the pop-out window keeps using the full click-to-call widget UI.
 */
import { createWebRTCClient, checkWebRTCSupport } from "@cognigy/click-to-call-sdk";

export { createWebRTCClient, checkWebRTCSupport };
