# TO DO List
 * Alerts comp should be edit
 * Data time comming from device should be check
 * EXTRUDER MOTOR RPM control should be check. Rn in settings it just for demonstrate the speed
 * TemperatureGauge should check (calculations etc)
 * Sass files should clean (unused and unneccessary things)
 * SystemStatus comp - define ONLINE/OFFLINE conditions (WS connected? device MQTT connected? telemetry actively flowing? safety thresholds?)




 /**
 * useWebSocket.ts
 * ───────────────
 * Custom React hook that manages the WebSocket connection to the Node server.
 *
 * What it does:
 *   1. Opens a WebSocket to WS_URL on mount.
 *   2. Parses every incoming JSON message and updates the appropriate state.
 *   3. Auto-reconnects every 3 seconds if the connection drops.
 *   4. Cleans up the socket and any pending timers on unmount.
 *
 * Message types handled (defined in shared/types.ts → WsMessageType):
 *   "telemetry"     → latest sensor snapshot from the device
 *   "history"       → array of recent readings sent on first connect
 *   "device_status" → MQTT client connected / disconnected event
 *
 * This hook is consumed only by TelemetryContext — you shouldn't need to
 * call it directly from components.
 */
 


