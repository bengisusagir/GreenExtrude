/**
 * TelemetryContext.tsx
 * ────────────────────
 * React Context that makes live sensor data available to every component in
 * the tree — without having to pass props through every level.
 *
 * HOW IT WORKS
 * ────────────
 * 1. <TelemetryProvider> opens a WebSocket connection to the Node server
 *    (via the useWebSocket hook) and stores the incoming data in state.
 * 2. Any child component can call useTelemetry() to read that data or
 *    send control commands to the device.
 *
 * USAGE
 * ─────
 *   // Wrap your app once (already done in App.tsx):
 *   <TelemetryProvider>
 *     <YourComponent />
 *   </TelemetryProvider>
 *
 *   // Inside any child component:
 *   const { telemetry, isConnected, sendCommand } = useTelemetry();
 */

/**
 * TelemetryLog.tsx
 * ────────────────
 * Scrollable table showing the last HISTORY_MAX_LENGTH telemetry readings.
 * Newest reading is always at the top (the history array is reversed before rendering).
 *
 * Each row = one MQTT message published by the device (every ~2 seconds from the simulator).
 * The table is read-only; users cannot edit values here.
 *
 * Reads `history` from TelemetryContext — no props required.
 */


/**
 * StatusBar.tsx
 * ─────────────
 * Fixed header shown at the top of every page.
 *
 * Displays two connection indicators:
 *   • Server  — WebSocket connection from the browser to the Node server.
 *   • Device  — MQTT connection from the ESP32 (or simulator) to the server.
 *
 * Reads state from TelemetryContext — no props required.
 */

/**
 * SensorCard.tsx
 * ──────────────
 * Displays a single live sensor reading inside a coloured card.
 *
 * The `status` prop controls the card's visual state:
 *   "normal"  → default dark card  (value is within the safe range)
 *   "warning" → orange border/bg   (approaching the safe-range limit)
 *   "danger"  → red border/bg      (outside the safe range — take action)
 *
 * Status thresholds are calculated in utils/thresholds.ts and passed in
 * by the parent (Dashboard.tsx), keeping this component purely presentational.
 */

/**
 * ControlPanel.tsx
 * ────────────────
 * Provides three machine control buttons:
 *   ▶ Start          — tells the extruder to begin the filament cycle
 *   ■ Stop           — graceful shutdown
 *   ⚠ Emergency Stop — immediate power-cut to all motors and heaters
 *
 * Clicking a button calls sendCommand(), which sends a JSON message over the
 * WebSocket → Node server → MQTT broker → ESP32 (or simulator).
 *
 * All buttons are disabled while isConnected is false to prevent
 * sending commands into the void when the server is unreachable.
 *
 * Reads state from TelemetryContext — no props required.
 */
