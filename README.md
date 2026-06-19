# GreenExtrude — Real-Time Filament Extrusion Monitor

A full-stack IoT ecosystem that monitors and controls a 3D-printer filament extruder machine in real time — converting waste PLA plastic into reusable 3D printing filament. Sensor data flows from an ESP32 device (or the included TypeScript simulator) through an embedded MQTT broker into a Node.js server, and is pushed live to a React dashboard over WebSocket.

Built as a **Capstone Design Project** at **Bahçeşehir University** by a joint **Mechatronics × Software Engineering** team.

> **🏆 Fully implemented and validated — 309 automated tests, all passing.**  
> 11 edge-case bugs discovered and fixed through comprehensive testing.

---

## Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Project Structure](#-project-structure)
3. [Data Flow](#-data-flow)
4. [Packages / Sub-projects](#-packages--sub-projects)
5. [Shared Types](#-shared-types)
6. [Server — Node.js Backend](#-server--nodejs-backend)
7. [Simulator — Mock ESP32 Device](#-simulator--mock-esp32-device)
8. [ESP32 Firmware](#-esp32-firmware)
9. [Client — React Dashboard](#-client--react-dashboard)
10. [API Reference](#-api-reference)
11. [WebSocket Protocol](#-websocket-protocol)
12. [MQTT Topics](#-mqtt-topics)
13. [Sensor Thresholds & Alerts](#-sensor-thresholds--alerts)
14. [Testing & Validation (309 Tests)](#-testing--validation-309-tests)
15. [Prerequisites](#-prerequisites)
16. [Installation](#-installation)
17. [Running the Project](#-running-the-project)
18. [Environment & Ports](#-environment--ports)
19. [Database](#-database)

---

## 🏗 Architecture Overview

```
                      ┌──────────────────────────────────────────────────┐
                      │              Node.js Server (:3001)              │
  ESP32 / Simulator   │  ┌──────────────┐     ┌──────────────────────┐  │
  (MQTT Client)  ────►│  │ Aedes MQTT   │────►│  sql.js (SQLite)     │  │
  port 1883      ◄────│  │ Broker :1883 │     │  greenextrude.db     │  │
                      │  └──────┬───────┘     └──────────────────────┘  │
                      │         │                                         │
                      │  ┌──────▼───────┐     ┌──────────────────────┐  │
  React Dashboard     │  │  WebSocket    │────►│  HTTP REST API       │  │
  (browser)      ◄────│  │  Server :3002 │     │  :3001               │  │
  port 3000      ────►│  └──────────────┘     └──────────────────────┘  │
                      └──────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| **Device / Simulator** | ESP32 (C++) / TypeScript + mqtt.js | Publishes sensor readings (1 Hz), receives & executes control commands |
| **MQTT Broker** | Aedes (embedded in Node.js) | Routes messages between device, server logic, and database |
| **Backend** | Node.js + TypeScript (no Express, no Socket.io) | Persists data, exposes REST + WebSocket endpoints |
| **Database** | sql.js (SQLite in-memory + file) | Store-and-forward telemetry logging with disk flush on every insert |
| **Frontend** | React 18 + TypeScript + SASS | Live dashboard with gauges, charts, alert system, and remote control |

---

## 📁 Project Structure

```
GreenExtrude/
├── README.md                       ← This file
├── codeNotes.MD                    ← Developer architecture reference & bug log
├── run.bat                         ← Windows one-click launcher
├── run.sh                          ← Linux / macOS one-click launcher
├── shared/                         ← Shared TypeScript type definitions
│   ├── package.json
│   └── types.ts                    ← TelemetryData, DeviceCommand, WsMessage,
│                                      MQTT_TOPICS, SENSOR_THRESHOLDS (dual-preset),
│                                      FILAMENT_PRESETS
│
├── server/                         ← Node.js backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                ← Entry: HTTP + WebSocket servers, app bootstrap
│       ├── mqttHandler.ts          ← Aedes broker init, publish/subscribe, device status
│       ├── database.ts             ← sql.js SQLite: init, schema migration, CRUD + disk flush
│       └── __tests__/
│           ├── database.test.ts           ← 34 DB unit tests
│           ├── mqtt-integration.test.ts   ← 22 MQTT pipeline integration tests
│           ├── http-api.test.ts           ← 22 REST endpoint tests
│           ├── websocket.test.ts          ← 11 WS protocol tests
│           └── edge-cases.test.ts         ← 14 stress & edge-case tests
│
├── simulator/                      ← Mock ESP32 device (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts                ← MQTT client, 1 Hz telemetry, anomaly injection
│       ├── simulator-pure.ts       ← Pure functions extracted for testability
│       └── __tests__/
│           ├── simulator.test.ts   ← 31 tests for pure functions
│           └── edge-cases.test.ts  ← 14 boundary & stress tests
│
├── client/                         ← React dashboard (CRA + Vite testing)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.tsx               ← React root mount
│       ├── App.tsx                 ← Root: routing (state-based) + providers
│       ├── App.sass
│       │
│       ├── context/
│       │   ├── TelemetryContext.tsx         ← Distributes live telemetry + sendCommand
│       │   └── TelemetryHealthContext.tsx   ← Health monitoring (3-second timeout)
│       │
│       ├── hooks/
│       │   ├── useWebSocket.ts     ← WS connection, auto-reconnect (3s), history ring-buffer (500)
│       │   └── useAlerts.ts        ← Threshold evaluation, cooldown (15s), max 50 alerts
│       │
│       ├── pages/
│       │   ├── Dashboard.tsx       ← Main view: gauges, chart, status, alerts
│       │   └── Settings.tsx        ← Control panel: temperature, motor speeds, filament preset, fans
│       │
│       ├── components/
│       │   ├── NavigationBar.tsx   ← Navigation, E‑STOP button, LIVE/OFFLINE indicator, Report dropdown
│       │   ├── TemperatureGauge.tsx← Grafana-style gauge (react-gauge-component), clamped [0, max]
│       │   ├── DiameterChart.tsx   ← MUI LineChart with pause/resume, stats, warning ref-lines
│       │   ├── MotorRPM.tsx        ← Motor speed display (clamped, placeholder-safe: "—")
│       │   ├── SystemStatus.tsx    ← Network, safety, danger alert status
│       │   ├── Alerts.tsx          ← Color-coded panel (WARN/CRIT/INFO), crash-safe FALLBACK_CONFIG
│       │   └── styles/             ← Component-level SASS files
│       │
│       ├── utils/
│       │   └── reportExport.ts     ← Quality stats computation + HTML→XLS export
│       │
│       └── styles/
│           ├── _variables.sass     ← Design tokens (colours, fonts, spacing, transitions)
│           └── global.sass         ← Global resets, glassmorphism card base, dark theme
│
└── esp32/
    └── GreenExtrudeFake/
        └── GreenExtrudeFake.ino    ← Arduino firmware for ESP32 (simulator mode, store-and-forward buffer)
```

---

## 🔄 Data Flow

### Telemetry — Device → Dashboard

```
ESP32 / Simulator (MQTT client)
  │  publishes JSON to "greenextrude/telemetry" (MQTT :1883) — every 1 second
  ▼
Aedes MQTT Broker  (server/src/mqttHandler.ts)
  │  on("publish") → parses TelemetryData
  │  → insertTelemetry() → SQLite (persisted to disk immediately)
  │  → wsBroadcast() → all WebSocket clients receive telemetry
  ▼
WebSocket Server  (:3002)
  │  sends  { type: "telemetry", payload: TelemetryData }
  ▼
useWebSocket.ts  (client)
  │  case "telemetry" → setTelemetry(data) + appends to ring-buffer (max 500)
  ▼
TelemetryContext → Dashboard components re-render
```

### Commands — Dashboard → Device

```
Settings page button click (client)
  │  sendCommand({ type, value, zone, timestamp })
  ▼
WebSocket  →  server receives { type: "command", payload: DeviceCommand }
  ▼
mqttHandler.sendCommand()
  │  aedes.publish() → topic "greenextrude/command" (QoS 1)
  ▼
Simulator / ESP32  →  executes command, adjusts internal state
  │  Next telemetry publish reflects the change
  ▼
Dashboard updates automatically
```

### Initial History on Connect

When a browser opens the dashboard, the server immediately sends the last 100 telemetry rows from SQLite, plus the last known device status:

```
ws.on("connection")
  → getRecentTelemetry(100)
  → { type: "history", payload: TelemetryData[] }
  → getLastDeviceStatus()
  → { type: "device_status", payload: DeviceStatusMessage }
```

---

## 📦 Packages / Sub-projects

### `shared/`

| File | Contents |
|---|---|
| `types.ts` | All shared TypeScript interfaces used by every sub-project (TelemetryData, DeviceCommand, WsMessage, MQTT_TOPICS, SENSOR_THRESHOLDS, FILAMENT_PRESETS) |

### `server/`

| Dependency | Role |
|---|---|
| `aedes` (^0.51.3) | Lightweight embedded MQTT broker — no external Mosquitto needed |
| `ws` (^8.18.0) | WebSocket server for the React client |
| `sql.js` (^1.11.0) | SQLite compiled to WebAssembly — runs in Node with no native binaries |
| `tsx` (^4.19.0) | Dev-only: runs TypeScript directly without a compile step |
| `vitest` + `@vitest/coverage-v8` | Test framework with V8 coverage |
| `supertest` | HTTP integration testing |

### `simulator/`

| Dependency | Role |
|---|---|
| `mqtt` (^5.10.0) | MQTT client library — same API an ESP32 firmware would use |

### `client/`

| Dependency | Role |
|---|---|
| `react` / `react-dom` 18 | UI framework |
| `@mui/material` (^7.3.9) | Material UI component library (Slider, Snackbar, Alert) |
| `@mui/x-charts` (^8.28.2) | MUI charting library (LineChart for DiameterChart) |
| `react-gauge-component` (^2.0.28) | Grafana-style gauge visualization (TemperatureGauge) |
| `sass` (^1.83.0) | SASS/SCSS stylesheet compilation |
| `typescript` | Static typing |
| `xlsx` (^0.18.5) | Excel file generation for report export |
| `vitest` + `jsdom` + `@testing-library/react` | Component testing |

---

## 🔗 Shared Types

All defined in `shared/types.ts` and imported by all three runtimes:

```typescript
TelemetryData          // sensor snapshot: 2 temperatures, screw/spool motor RPM,
                       //   filament ⌀, preset, fans_on, set_point, timestamp
DeviceCommand          // command to device: type + optional zone/value/timestamp
CommandType            // "SET_TEMPERATURE" | "SET_SCREW_MOTOR_SPEED" | "SET_SPOOL_MOTOR_SPEED"
                       // | "SET_FILAMENT_DIAMETER" | "SET_FANS" | "EMERGENCY_STOP"
                       // | "START" | "STOP"
FilamentDiameterPreset // 2.85 | 1.75
DeviceStatus           // "connected" | "disconnected" | "error"
DeviceStatusMessage    // clientId + status + optional message string
WsMessage<T>           // WebSocket envelope: { type: WsMessageType, payload: T }
WsMessageType          // "telemetry" | "device_status" | "history" | "command_ack"
MQTT_TOPICS            // const: TELEMETRY | COMMAND | STATUS topic strings
SENSOR_THRESHOLDS      // dual-preset thresholds: TEMPERATURE { WARNING: 215, DANGER: 230 },
                       //   FILAMENT_DIAMETER { 2.85: {...}, 1.75: {...}, legacy fallback }
FILAMENT_PRESETS       // const: default set_point, screw_motor_speed, spool_motor_speed per preset
```
---

## 🖥 Server — Node.js Backend

**Entry point:** `server/src/index.ts`

Built with **pure Node.js + TypeScript** — no Express, no NestJS, no Socket.io. Three core modules:

| Module | File | Responsibility |
|---|---|---|
| **HTTP + WebSocket Server** | `src/index.ts` | REST API, CORS, WebSocket server (:3002), broadcasts telemetry, replays history on connect |
| **MQTT Handler** | `src/mqttHandler.ts` | Embedded Aedes broker (:1883), subscribes to telemetry/status, publishes commands, tracks device connection state |
| **Database** | `src/database.ts` | sql.js SQLite, auto-creates table with schema migration, INSERT + SELECT, disk-flush on every insert |


### HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — `{ status: "running", timestamp }` |
| `GET` | `/api/telemetry?limit=N` | Last N telemetry rows (default 100), newest first |
| `POST` | `/api/command` | Send a `DeviceCommand` JSON body via MQTT to the device |

### npm scripts

```bash
npm run dev          # tsx watch — runs TypeScript directly, hot-reloads on save
npm run build        # tsc — compiles to dist/
npm start            # node dist/server/src/index.js — runs compiled output
npm test             # vitest run --coverage — 103 tests with coverage
npm run test:watch   # vitest --coverage — runs tests on file changes
```

### Test suite — 103 tests (✅ ALL PASS)

| Test File | Tests | Coverage |
|---|---|---|
| `database.test.ts` | 34 | DB init, inserts, queries, schema migration (heater_3 → new schema), edge cases, persistence |
| `mqtt-integration.test.ts` | 22 | Telemetry pipeline, JSON parsing, client lifecycle, command relay, end-to-end |
| `http-api.test.ts` | 22 | REST endpoints: health, telemetry query, command POST, CORS, error handling, 404 |
| `websocket.test.ts` | 11 | Connection, broadcast, reconnect, history replay, multi-client |
| `edge-cases.test.ts` | 14 | Concurrent access, malformed data, rapid connect/disconnect, large limits |

---

## 🤖 Simulator — Mock ESP32 Device

**Entry point:** `simulator/src/index.ts`

Mimics an ESP32 running MicroPython/Arduino firmware, designed for testing without physical hardware:

- Connects to `mqtt://localhost:1883` with client ID `esp32-simulator-01`.
- Publishes `TelemetryData` JSON to `greenextrude/telemetry` **every 1 second**.
- Adds realistic Gaussian-like noise to each sensor value.
- **Anomaly injection:** 8% chance per tick of injecting an extreme spike (high or low) for any sensor — useful for testing alert thresholds.
- Publishes `{ status: "online", device_id }` to `greenextrude/status` on connect.
- Subscribes to `greenextrude/command` and executes all command types.

### Command Handling

| Command | Effect in Simulator |
|---|---|
| `START` | `running = true`, restores default screw (30 RPM) / spool (25 RPM) speeds |
| `STOP` | `running = false`, motors → 0 RPM, fans → OFF |
| `EMERGENCY_STOP` | `running = false`, motors → 0 RPM, fans → OFF |
| `SET_TEMPERATURE` | Updates `heater_1` and `set_point` for zone 1/2 |
| `SET_SCREW_MOTOR_SPEED` | Updates screw (extruder) motor target RPM (clamped ≥ 0) |
| `SET_SPOOL_MOTOR_SPEED` | Updates spool (winder) motor target RPM (clamped ≥ 0) |
| `SET_FILAMENT_DIAMETER` | Switches preset between 1.75mm and 2.85mm |
| `SET_FANS` | Toggles cooling fans on/off |

### Default Simulated Values

| Sensor | Default | Noise Range (±) | Anomaly High | Anomaly Low |
|---|---|---|---|---|
| Zone 1 — Feed | 180 °C | 1.5 | 245 °C | 50 °C |
| Zone 2 — Melt | 200 °C | 1.0 | 250 °C | 40 °C |
| Screw Motor Speed | 30 RPM | 0.5 | 80 RPM | 0 RPM |
| Filament Diameter | 2.85 mm | 0.04 | 3.25 mm | 2.50 mm |
| Spool Motor Speed | 25 RPM | 0.5 | 70 RPM | 0 RPM |

### npm scripts

```bash
npm run dev          # tsx watch — hot-reloads on save
npm run build && npm start
npm test             # vitest run — 45 tests (standard + edge cases)
```

### Pure Functions & Testability

The simulator's logic is extracted into **pure functions** in `simulator-pure.ts`:
- `addNoise(value, range)` — adds Gaussian-like noise
- `maybeInjectAnomaly(value, normal, spikeHigh, spikeLow, random)` — 8% chance spike
- `generateTelemetry(state, randomProvider?)` — builds TelemetryData with injectable RNG
- `applyCommand(state, cmd)` — applies command → new state (immutable)

These power **31 unit tests** in `simulator.test.ts` plus **14 edge-case tests** covering boundary conditions, negative values, NaN handling, and command sequences. Key safety measures: `Math.max(0, ...)` clamping for all sensor values and motors forced to 0 on STOP/EMERGENCY_STOP.

---

## ⚡ ESP32 Firmware

**File:** `esp32/GreenExtrudeFake/GreenExtrudeFake.ino`

A complete Arduino sketch for the ESP32 microcontroller that:
- Generates realistic sensor telemetry (simulation mode — no physical sensors required)
- Publishes to MQTT topic `greenextrude/telemetry` every 1 second
- Subscribes to `greenextrude/command` and executes all command types
- Implements a **store-and-forward buffer** (300-entry ring buffer) — queues telemetry locally when MQTT is disconnected and flushes on reconnect
- Uses PubSubClient + ArduinoJson libraries

**Required Libraries (Arduino Library Manager):**
- `PubSubClient` (Nick O'Leary)
- `ArduinoJson` (Benoit Blanchon)

---

## ⚛️ Client — React Dashboard

**Entry point:** `client/src/index.tsx` → `App.tsx`

Built with Create React App (react-scripts). State-based routing (no react-router-dom).

### Component Tree

```
<TelemetryHealthProvider>         — monitors telemetry freshness (3-second timeout)
  <TelemetryProvider>             — distributes live data + sendCommand via Context
    <div.app>
      <NavigationBar />           — nav + E‑STOP button + LIVE/OFFLINE indicator
                                  — Quality Report dropdown with stats + XLS export
      <Dashboard />               — DEFAULT PAGE
        <TemperatureGauge /> ×2   — Zone 1 & 2 (react-gauge-component, Grafana style)
        <MotorRPM /> ×2           — Screw motor + Spool motor RPM
        <DiameterChart />         — MUI LineChart (pause/resume, stats, ref lines)
        <SystemStatus />          — Network, safety, danger alert status
        <Alerts />                — Color-coded panel (WARN/CRIT/INFO)
      <Settings />                — accessible via nav
        Temperature inputs        — Set points for Zone 1 & 2
        Screw motor slider        — MUI Slider (sends SET_SCREW_MOTOR_SPEED)
        Spool motor slider        — MUI Slider (sends SET_SPOOL_MOTOR_SPEED)
        Fans toggle               — SET_FANS on/off
        Filament preset select    — 1.75mm / 2.85mm (replaces all preset values)
        Apply & Start button      — Sends all parameters + START command
        Emergency Stop button     — Sends EMERGENCY_STOP
    </div>
  </TelemetryProvider>
</TelemetryHealthProvider>
```

### Pages

| Page | Features |
|---|---|
| **Dashboard** | 2 temperature gauges, diameter chart (last 20 readings) with pause/resume + stats row, screw & spool motor RPM, system status panel, alerts panel |
| **Settings** | Temperature set point, screw motor speed slider, spool motor speed slider, fans toggle, filament diameter preset (auto-fills all values), Apply & Start button, Emergency Stop button |

### State — TelemetryContext Values

| Value | Type | Description |
|---|---|---|
| `telemetry` | `TelemetryData \| null` | Latest single reading from device |
| `history` | `TelemetryData[]` | Ring buffer, max **500** entries |
| `deviceStatus` | `DeviceStatusMessage \| null` | Last MQTT connect/disconnect event |
| `isConnected` | `boolean` | WebSocket to server is open |
| `sendCommand` | `(cmd: DeviceCommand) => void` | Sends a command over WebSocket |
| `deviceStatus` | `DeviceStatusMessage \| null` | Last MQTT connect/disconnect event |
| `isConnected` | `boolean` | WebSocket to server is open |
| `sendCommand` | `(cmd: DeviceCommand) => void` | Sends a command over WebSocket |

### State — TelemetryHealthContext Values

| Value | Type | Description |
|---|---|---|
| `isHealthy` | `boolean` | Telemetry received within last **3 seconds** |
| `timeoutMs` | `number` | Configurable timeout (default 3000ms) |

### Alert System — `useAlerts` Hook

Generates `AlertItem[]` with `id`, `type` (`warning` / `danger` / `info`), `message`, and `timestamp`. Capped at **50 alerts** with a **15-second cooldown** per alert key (prevents alert storms).

| Condition | Alert Type | Message |
|---|---|---|
| Temperature ≥ 230°C | 🔴 **danger** | "Zone N temperature critical: X°C (≥ 230°C)" |
| Temperature ≥ 215°C | 🟡 **warning** | "Zone N temperature high: X°C (≥ 215°C)" |
| Temperature < 60°C | 🔴 **danger** | "Zone N temperature abnormally low: X°C — possible sensor failure" |
| Diameter ≤ DANGER_MIN or ≥ DANGER_MAX | 🔴 **danger** | "Filament diameter out of spec: X mm (danger range)" |
| Diameter ≤ WARNING_MIN or ≥ WARNING_MAX | 🟡 **warning** | "Filament diameter drifting: X mm (target Y mm)" |
| Screw motor = 0 RPM | 🔴 **danger** | "Screw motor speed at 0 RPM — possible stall detected" |
| Screw motor > 60 RPM | 🟡 **warning** | "Screw motor speed abnormally high: X RPM" |
| Spool motor = 0 RPM | 🟡 **warning** | "Spool motor speed at 0 RPM — production halted" |
| Spool motor > 55 RPM | 🟡 **warning** | "Spool motor speed abnormally high: X RPM" |

### WebSocket Reconnect Behaviour

`useWebSocket.ts` retries the connection every **3 seconds** if the server is unreachable. The hook also:
- Calls `recordTelemetryUpdate()` from the health context on each telemetry message to keep the LIVE indicator alive
- **Auto E‑STOP:** if a telemetry reading shows `heater_1 > 350°C` or `heater_2 > 350°C`, it automatically sends `EMERGENCY_STOP` to prevent thermal runaway
- Maintains a ring-buffer of the last **500** telemetry entries

### DiameterChart Features

- **Pause / Resume:** click the chart area to toggle a "⏸ PAUSED" badge and freeze the data snapshot.
- **Stats row:** real-time Min, Max, Avg, and standard deviation (σ) displayed below the chart.
- **Warning reference lines:** yellow dashed lines at WARNING_MIN and WARNING_MAX with labels.
- **Color-coded current value:** green (within warning band), yellow (between warning and danger), red (outside danger), grey ("⚠ Sensor Error" for ≤ 0 values).
- **Invalid reading detection:** counts and reports data points where diameter ≤ 0 as sensor errors.
- **Dual-preset support:** automatically selects thresholds for the active filament diameter preset (1.75mm or 2.85mm).
- **Dynamic Y-axis:** auto-scales with padding based on current data range.

### NavigationBar Features

- **LIVE / OFFLINE indicator:** pulsing green dot when telemetry is fresh (within 3s)
- **Emergency Stop button:** sends `EMERGENCY_STOP` with toast confirmation
- **Filament Quality Report dropdown:** shows real-time stats (n, mean Ø, std dev, min, max, warning count, out-of-tolerance) with a **Download Full Report (XLS)** button that exports up to 500 records as an HTML table with `.xls` extension
- **Report export utility** (`reportExport.ts`): computes quality statistics and generates an Excel-compatible HTML table with BOM header for Turkish locale support

### Routing

No external router (react-router-dom is not used). Navigation is handled by `useState<Page>("dashboard")` in `App.tsx`, where `Page` is `"dashboard" | "settings"`.

### npm scripts

```bash
npm start            # CRA dev server → http://localhost:3000 (auto-opens browser)
npm run build        # production bundle → client/build/
npm test             # vitest run — 161 tests across 19 suites
npm run test:watch   # vitest watch mode
```

### Testing Overview — 161 tests (✅ ALL PASS)

| Category | Tests | What's Covered |
|---|---|---|
| **Hooks** (`useWebSocket`, `useAlerts`) | 39 | Connection/reconnect, message parsing, threshold evaluation + cooldown |
| **Context** (Telemetry, Health) | 14 | State distribution, 3-second health timeout |
| **Components** (×6) | 94 | TemperatureGauge, MotorRPM, DiameterChart, SystemStatus, Alerts, NavigationBar |
| **Pages** (Dashboard, Settings) | 9 | Layout, controls, preset switching |
| **Edge Cases** (×6 component suites) | 64 | Empty data, extreme values, rapid updates, crash resistance, NaN handling |

**11 bugs** discovered and fixed via edge-case testing (see `codeNotes.MD` for full log).

---

## 📡 API Reference

### `GET /api/health`

```json
{ "success": true, "status": "running", "timestamp": "2026-06-14T10:00:00.000Z" }
```

### `GET /api/telemetry?limit=50`

```json
{
  "success": true,
  "data": [
    {
      "device_id": "esp32-simulator-01",
      "heater_1": 181.2,
      "heater_2": 199.8,
      "screw_motor_speed": 30.3,
      "filament_diameter": 2.86,
      "filament_diameter_setting": 2.85,
      "fans_on": true,
      "spool_motor_speed": 25.1,
      "set_point": 220,
      "timestamp": "2026-06-14T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/command`

Request body:

```json
{ "type": "SET_SCREW_MOTOR_SPEED", "value": 50, "timestamp": "2026-06-14T10:00:00.000Z" }
```

Response:

```json
{ "success": true, "message": "Command sent" }
```

### `GET /api/health` (404)

```json
{ "success": false, "error": "Not found" }
```

CORS is enabled globally: `Access-Control-Allow-Origin: *`.

---

## 🔌 WebSocket Protocol

**URL:** `ws://localhost:3002`

### Server → Client

```typescript
// Real-time telemetry — every ~1 second
{ type: "telemetry",     payload: TelemetryData }

// On connect — last 100 records from SQLite
{ type: "history",       payload: TelemetryData[] }

// On MQTT connect/disconnect
{ type: "device_status", payload: DeviceStatusMessage }
```

### Client → Server

```typescript
// Commands are relayed to the MQTT broker → device
{ type: "command", payload: DeviceCommand }
```

### Client-Side Safety Feature

The `useWebSocket` hook includes an **auto emergency stop**: if a telemetry reading contains `heater_1 > 350°C` or `heater_2 > 350°C`, it automatically sends an `EMERGENCY_STOP` command over the WebSocket.

---

## 📻 MQTT Topics

| Topic | Direction | Payload | QoS |
|---|---|---|---|
| `greenextrude/telemetry` | Device → Server | JSON `TelemetryData` | 0 |
| `greenextrude/command` | Server → Device | JSON `DeviceCommand` | 1 |
| `greenextrude/status` | Device → Server | Status string (`"online"`, etc.) | 0 |

---

## 🚦 Sensor Thresholds & Alerts

Thresholds are defined in `shared/types.ts` as `SENSOR_THRESHOLDS` (dual-preset for filament diameter) and used by both the `useAlerts` hook and the `DiameterChart` component.

### Temperature Thresholds

| Condition | Alert | Description |
|-----------|-------|-------------|
| ≥ 230 °C | 🔴 **DANGER** | Temperature critical |
| 215 – 229 °C | 🟡 WARNING | Temperature high |
| < 60 °C | 🔴 **DANGER** | Possible sensor failure |

### Filament Diameter (2.85 mm Preset)

| Condition | Alert | Description |
|-----------|-------|-------------|
| ≤ 2.70 mm or ≥ 3.00 mm | 🔴 **DANGER** | Diameter out of spec |
| ≤ 2.78 mm or ≥ 2.92 mm | 🟡 WARNING | Diameter drifting |
| Target: **2.85 mm** | ✅ Normal | Within tolerance |

### Filament Diameter (1.75 mm Preset)

| Condition | Alert | Description |
|-----------|-------|-------------|
| ≤ 1.60 mm or ≥ 1.90 mm | 🔴 **DANGER** | Diameter out of spec |
| ≤ 1.68 mm or ≥ 1.82 mm | 🟡 WARNING | Diameter drifting |
| Target: **1.75 mm** | ✅ Normal | Within tolerance |

### Motor Alerts

| Condition | Alert | Description |
|-----------|-------|-------------|
| Screw motor = 0 RPM | 🔴 **DANGER** | Possible stall detected |
| Screw motor > 60 RPM | 🟡 WARNING | Abnormally high speed |
| Spool motor = 0 RPM | 🟡 WARNING | Production halted |
| Spool motor > 55 RPM | 🟡 WARNING | Abnormally high speed |

---

## ✅ Testing & Validation (309 Tests)

**Total: 309 automated tests — ALL PASS** ✅

### Per-Package Breakdown

| Package | Tests | Test Suites |
|---------|-------|-------------|
| **Server** | 103 | database (34), mqtt-integration (22), http-api (22), websocket (11), edge-cases (14) |
| **Simulator** | 45 | simulator-pure (31), edge-cases (14) |
| **Client** | 161 | hooks (39), context (14), components (94), pages (9), edge-cases (64) |

### 11 Bugs Discovered & Fixed

| Bug | File | Fix |
|-----|------|-----|
| Filament threshold strict comparison | `useAlerts.ts` | `<=` / `>=` instead of `<` / `>` |
| TelemetryContext not exported | `TelemetryContext.tsx` | Added `export` |
| MotorRPM negative display | `MotorRPM.tsx` | `Math.max(0, rpm)` |
| MotorRPM undefined → blank | `MotorRPM.tsx` | `"—"` placeholder |
| TempGauge negative display | `TemperatureGauge.tsx` | Clamp to `[0, maxTemp]` |
| TempGauge value > maxValue | `TemperatureGauge.tsx` | Clamp prevents gauge crash |
| Alerts unknown type crash | `Alerts.tsx` | `FALLBACK_CONFIG` + `??` |
| DiameterChart negative filter | `DiameterChart.tsx` | `invalidReadingCount` indicator |
| DiameterChart currentValue=0 | `DiameterChart.tsx` | "⚠ Sensor Error" |
| Simulator negative telemetry | `simulator-pure.ts` | `Math.max(0, ...)` everywhere |
| Simulator STOP motor safety | `simulator-pure.ts` | Motors forced to 0 on STOP |

### Quick Test Commands

```bash
cd server    && npm test    # 103 tests
cd client    && npm test    # 161 tests
cd simulator && npm test    # 45 tests
```

---

## ✅ Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| **Node.js** | 18.x LTS | Tested on v20 |
| **npm** | 9.x | Bundled with Node |

> No Docker, no Mosquitto, no external MQTT broker — Aedes is embedded in the server.  
> No database server — SQLite runs in-process via sql.js (WebAssembly).

---

## 💾 Installation

Install dependencies for every sub-project (only needed once):

```bash
cd server    && npm install && cd ..
cd simulator && npm install && cd ..
cd client    && npm install && cd ..
```

Or simply run the one-click launcher — it installs automatically on first run.

---

## ▶️ Running the Project

Three services must run simultaneously. Open **three separate terminals**:

### Terminal 1 — Server (port 3001 / WS 3002 / MQTT 1883)

```bash
cd server
npm run dev
```

Expected output:
```
[DB]   SQLite database initialized at .../server/greenextrude.db
[WS]   WebSocket server running on ws://localhost:3002
[MQTT] Broker running on tcp://localhost:1883
[HTTP] API server running on http://localhost:3001

=== GreenExtrude Server Ready ===
```

### Terminal 2 — Simulator (MQTT client)

```bash
cd simulator
npm run dev
```

Expected output:
```
[SIM] Connecting to broker at mqtt://localhost:1883...
[SIM] Connected as "esp32-simulator-01"
[SIM] Subscribed to "greenextrude/command"
[SIM] → 180.4/199.7°C | screw: 30.1 RPM | spool: 25.0 RPM | ⌀ 2.85mm
```

### Terminal 3 — React Client

```bash
cd client
npm start
```

The browser opens automatically at **http://localhost:3000**.

---

### One-Click Launcher

From the project root:

**Windows:**
```cmd
run.bat
```

**Linux / macOS:**
```bash
chmod +x run.sh
./run.sh
```

The scripts install missing `node_modules` automatically before starting, then launch all three services with process management.

---

## 🌐 Environment & Ports

| Service | Protocol | Port | URL |
|---|---|---|---|
| React dev server | HTTP | 3000 | http://localhost:3000 |
| Node HTTP REST API | HTTP | 3001 | http://localhost:3001 |
| WebSocket server | WS | 3002 | ws://localhost:3002 |
| MQTT broker (Aedes) | MQTT/TCP | 1883 | mqtt://localhost:1883 |

---

## 🗄 Database

- **Engine:** sql.js (SQLite compiled to WebAssembly)  
- **File:** `server/greenextrude.db` (auto-created on first run)  
- **Auto-migration:** detects old schema (with `heater_3` column) and recreates the database

### Schema

```sql
CREATE TABLE telemetry (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp               TEXT    NOT NULL DEFAULT (datetime('now')),
  heater_1                REAL,
  heater_2                REAL,
  screw_motor_speed       REAL,
  filament_diameter       REAL,
  filament_diameter_setting REAL DEFAULT 2.85,
  fans_on                 INTEGER DEFAULT 1,
  spool_motor_speed       REAL,
  device_id               TEXT
);
```

- Every telemetry insert is **immediately flushed to disk** (store-and-forward pattern) — no data loss on server restart.
- On browser reconnect, the last **100** rows are automatically pushed to the dashboard.
- The `fans_on` column is stored as INTEGER (0/1) and converted to boolean on read.


