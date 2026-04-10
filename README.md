# GreenExtrude — Real-Time Filament Extrusion Monitor

A full-stack IoT dashboard for monitoring and controlling a 3D-printer filament extruder machine in real time.
Sensor data flows from an ESP32 device (or the included simulator) through an MQTT broker into a Node.js server, and is then pushed live to a React dashboard over WebSocket.

Built as a Capstone Project at Bahçeşehir University by a joint Mechatronics + Software Engineering team.

---

## Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Project Structure](#-project-structure)
3. [Data Flow](#-data-flow)
4. [Packages / Sub-projects](#-packages--sub-projects)
5. [Shared Types](#-shared-types)
6. [Server — Node.js Backend](#-server--nodejs-backend)
7. [Simulator — Mock ESP32 Device](#-simulator--mock-esp32-device)
8. [Client — React Dashboard](#-client--react-dashboard)
9. [API Reference](#-api-reference)
10. [WebSocket Protocol](#-websocket-protocol)
11. [MQTT Topics](#-mqtt-topics)
12. [Sensor Thresholds & Alerts](#-sensor-thresholds--alerts)
13. [Prerequisites](#-prerequisites)
14. [Installation](#-installation)
15. [Running the Project](#-running-the-project)
16. [Environment & Ports](#-environment--ports)
17. [Database](#-database)
18. [Team](#-team)

---

## 🏗 Architecture Overview

```
                      ┌────────────────────────────────────────────────┐
                      │              Node.js Server                    │
  ESP32 / Simulator   │  ┌──────────────┐     ┌──────────────────────┐ │
  (MQTT client)  ────►│  │ Aedes MQTT   │────►│  sql.js (SQLite)     │ │
  port 1883      ◄────│  │ Broker :1883 │     │  greenextrude.db     │ │
                      │  └──────┬───────┘     └──────────────────────┘ │
                      │         │ broadcast                              │
                      │  ┌──────▼───────┐     ┌──────────────────────┐ │
  React Dashboard     │  │  WebSocket   │────►│  HTTP REST API       │ │
  (browser)      ◄────│  │  Server :3002│     │  :3001               │ │
  port 3000      ────►│  └──────────────┘     └──────────────────────┘ │
                      └────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| Device / Simulator | TypeScript + mqtt.js | Publishes sensor readings, receives commands |
| MQTT Broker | Aedes (embedded in Node) | Routes messages between device and server logic |
| Backend | Node.js + TypeScript (no framework) | Persists data, exposes REST + WebSocket |
| Database | sql.js (SQLite in-memory, saved to file) | Store-and-forward telemetry log |
| Frontend | React 18 + TypeScript + SASS | Live dashboard, settings & control |

---

## 📁 Project Structure

```
GreenExtrude/
├── README.md                   ← this file
├── run.bat                     ← Windows one-click launcher
├── run.sh                      ← Linux / macOS one-click launcher
│
├── shared/                     ← Shared TypeScript type definitions
│   ├── package.json
│   └── types.ts                ← TelemetryData, DeviceCommand, WsMessage, MQTT_TOPICS …
│
├── server/                     ← Node.js backend
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            ← Entry: HTTP + WebSocket servers, app bootstrap
│       ├── mqttHandler.ts      ← Aedes broker init, publish/subscribe logic
│       └── database.ts         ← sql.js SQLite: init, insert, query telemetry
│
├── simulator/                  ← Mock ESP32 device
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts            ← Connects via MQTT, publishes fake sensor data every 1 s
│
└── client/                     ← React dashboard
    ├── package.json
    ├── tsconfig.json
    ├── public/
    │   └── index.html
    └── src/
        ├── index.tsx           ← React root mount
        ├── App.tsx             ← Root component: routing + providers
        ├── App.sass
        ├── react-app-env.d.ts
        │
        ├── context/
        │   ├── TelemetryContext.tsx     ← React Context: distributes live data to all components
        │   └── TelemetryHealthContext.tsx ← Health monitoring for telemetry data stream
        │
        ├── hooks/
        │   └── useWebSocket.ts ← Manages WS connection, reconnect, message parsing
        │
        ├── pages/
        │   ├── Dashboard.tsx   ← Main page: gauges, chart, status, alerts
        │   └── Settings.tsx    ← Settings: PID controls, motor slider, buttons
        │
        ├── components/
        │   ├── NavigationBar.tsx   ← Top navigation, connection status
        │   ├── TemperatureGauge.tsx ← Visual temperature gauge
        │   ├── DiameterChart.tsx   ← Filament diameter chart
        │   ├── MotorRPM.tsx        ← Motor speed gauge/display
        │   ├── SystemStatus.tsx    ← Device status panel
        │   └── Alerts.tsx          ← Alerts panel
        │   └── styles/             ← Component-specific styles
        │       ├── NavigationBar.sass
        │       ├── TemperatureGauge.sass
        │       ├── DiameterChart.sass
        │       ├── MotorRPM.sass
        │       ├── SystemStatus.sass
        │       └── Alerts.sass
        │
        ├── pages/
        │   ├── Dashboard.tsx       ← Main dashboard page
        │   ├── Settings.tsx        ← Settings page
        │   └── styles/             ← Page-specific styles
        │       ├── Dashboard.sass
        │       └── Settings.sass
        │
        └── styles/
            ├── _variables.sass ← Design tokens (colours, fonts, spacing)
            └── global.sass     ← Global resets and base styles
```

---

## 🔄 Data Flow

### Telemetry — Device → Dashboard

```
ESP32 / Simulator
  │  publishes JSON to topic  greenextrude/telemetry  (MQTT :1883)
  ▼
Aedes MQTT Broker  (server/src/mqttHandler.ts)
  │  on("publish") → parses TelemetryData
  │  → insertTelemetry()  →  SQLite (persisted to disk immediately)
  │  → wsBroadcast()
  ▼
WebSocket Server  (server/src/index.ts  :3002)
  │  sends  { type: "telemetry", payload: TelemetryData }  to all browsers
  ▼
useWebSocket.ts  (client hook)
  │  case "telemetry" → setTelemetry(data)  +  appends to history ring-buffer (max 100)
  ▼
TelemetryContext  →  Dashboard components re-render
```

### Commands — Dashboard → Device

```
Settings page button click  (client)
  │  sendCommand({ type: "START" | "STOP" | "EMERGENCY_STOP" | "SET_MOTOR_SPEED" })
  ▼
WebSocket  →  server receives  { type: "command", payload: DeviceCommand }
  ▼
mqttHandler.sendCommand()
  │  aedes.publish()  →  topic  greenextrude/command  (QoS 1)
  ▼
Simulator / ESP32  client.on("message")  →  executes command, adjusts state
```

### Initial History on Connect

When a browser opens the dashboard, the server immediately sends the last 50 telemetry rows from SQLite:

```
ws.on("connection")
  → getRecentTelemetry(50)
  → { type: "history", payload: TelemetryData[] }
```

---

## 📦 Packages / Sub-projects

### `shared/`

| File | Contents |
|---|---|
| `types.ts` | All shared TypeScript interfaces used by every sub-project |

### `server/`

| Dependency | Role |
|---|---|
| `aedes` | Lightweight embedded MQTT broker — no external Mosquitto needed |
| `ws` | WebSocket server for the React client |
| `sql.js` | SQLite compiled to WebAssembly — runs in Node with no native binaries |
| `tsx` | Dev-only: runs TypeScript directly without a compile step |

### `simulator/`

| Dependency | Role |
|---|---|
| `mqtt` | MQTT client library — same API an ESP32 firmware would use |

### `client/`

| Dependency | Role |
|---|---|
| `react` / `react-dom` 18 | UI framework |
| `react-scripts` (CRA) | Webpack + Babel build toolchain, dev server |
| `sass` | SASS/SCSS stylesheet compilation |
| `typescript` | Static typing |
| `react-gauge-component` | Temperature gauge visualization |

---

## 🔗 Shared Types

All defined in `shared/types.ts` and imported by all three runtimes:

```typescript
TelemetryData          // sensor snapshot: 3 temperatures, motor/winder RPM, filament ⌀
DeviceCommand          // command to device: type + optional zone/value
DeviceStatus           // "connected" | "disconnected" | "error"
DeviceStatusMessage    // clientId + status + optional message string
WsMessage<T>           // WebSocket envelope: { type: WsMessageType, payload: T }
WsMessageType          // "telemetry" | "device_status" | "history" | "command_ack"
MQTT_TOPICS            // const: TELEMETRY | COMMAND | STATUS topic strings
```

---

## 🖥 Server — Node.js Backend

**Entry point:** `server/src/index.ts`

### Startup sequence

1. **`initDatabase()`** — loads `greenextrude.db` from disk (or creates it), ensures the `telemetry` table exists.
2. **`WebSocketServer`** on `:3002` — accepts browser connections; sends the last 50 rows on connect; forwards incoming `command` messages to MQTT.
3. **`initMqttBroker(wsBroadcast)`** — starts Aedes on `:1883`; on every telemetry message: persist to DB + broadcast to all WS clients.
4. **`http.createServer`** on `:3001` — serves the REST endpoints.

### HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — `{ status: "running", timestamp }` |
| `GET` | `/api/telemetry?limit=N` | Last N telemetry rows (default 100), ascending |
| `POST` | `/api/command` | Send a `DeviceCommand` JSON body via MQTT to the device |

### npm scripts

```bash
npm run dev          # tsx watch — runs TypeScript directly, hot-reloads on save
npm run build        # tsc — compiles to dist/
npm start            # node dist/server/src/index.js — runs compiled output
```

---

## 🤖 Simulator — Mock ESP32 Device

**Entry point:** `simulator/src/index.ts`

Mimics an ESP32 running MicroPython/Arduino firmware:

- Connects to `mqtt://localhost:1883` with client ID `esp32-simulator-01`.
- Publishes `TelemetryData` JSON to `greenextrude/telemetry` **every 1 second**.
- Adds realistic random noise to each sensor value.
- Subscribes to `greenextrude/command` and executes all command types:

| Command | Effect in simulator |
|---|---|
| `START` | `running = true`, restores default motor/winder speeds |
| `STOP` | `running = false` (graceful — temperatures preserved) |
| `EMERGENCY_STOP` | `running = false`, motor = 0 RPM, winder = 0 RPM |
| `SET_TEMPERATURE` | Updates target for zone 1 / 2 / 3 |
| `SET_MOTOR_SPEED` | Updates motor target RPM |
| `SET_WINDER_SPEED` | Updates winder target RPM |

### Default simulated values

| Sensor | Default | Noise range (±) |
|---|---|---|
| Zone 1 — Feed | 180 °C | 1.5 |
| Zone 2 — Melt | 200 °C | 1.0 |
| Zone 3 — Nozzle | 195 °C | 1.25 |
| Motor Speed | 30 RPM | 0.5 |
| Filament Diameter | 2.85 mm | 0.04 |
| Winder Speed | 25 RPM | 0.25 |

### npm scripts

```bash
npm run dev          # tsx watch — hot-reloads on save
npm run build && npm start
```

---

## ⚛️ Client — React Dashboard

**Entry point:** `client/src/index.tsx` → `App.tsx`

### Component tree

```
<TelemetryHealthProvider>         context/TelemetryHealthContext.tsx
  <TelemetryProvider>              context/TelemetryContext.tsx
    <div.app>
      <NavigationBar />            Navigation + connection status indicator
      <Dashboard />                pages/Dashboard.tsx (default page)
        <TemperatureGauge /> ×2    Zone 1 & Zone 2 temperature displays
        <DiameterChart />          Filament diameter history chart
        <MotorRPM />               Motor RPM gauge
        <SystemStatus />           Device info panel
        <Alerts />                 Alerts panel
      <Settings />                 pages/Settings.tsx (accessible via nav)
        PID inputs                 P-Gain, I-Gain, D-Gain controls
        Motor slider               Speed control
        Buttons                    Apply & Start, Emergency Stop
    </div>
  </TelemetryProvider>
</TelemetryHealthProvider>
```

### Pages

| Page | Features |
|---|---|
| **Dashboard** | Temperature gauges, diameter chart, motor RPM, system status, alerts |
| **Settings** | PID control inputs, motor speed slider, Apply button, Emergency Stop |

### State — TelemetryContext values

| Value | Type | Description |
|---|---|---|
| `telemetry` | `TelemetryData \| null` | Latest single reading |
| `history` | `TelemetryData[]` | Ring buffer, max 100 entries |
| `deviceStatus` | `DeviceStatusMessage \| null` | Last MQTT connect/disconnect event |
| `isConnected` | `boolean` | WebSocket to server is open |
| `sendCommand` | `(cmd: DeviceCommand) => void` | Sends a command over WebSocket |

### WebSocket reconnect behaviour

`useWebSocket.ts` retries the connection every **3 seconds** if the server is unreachable.

### npm scripts

```bash
npm start            # CRA dev server → http://localhost:3000 (auto-opens browser)
npm run build        # production bundle → client/build/
```

---

## 📡 API Reference

### `GET /api/health`

```json
{ "success": true, "status": "running", "timestamp": "2026-04-05T10:00:00.000Z" }
```

### `GET /api/telemetry?limit=50`

```json
{
  "success": true,
  "data": [
    {
      "device_id": "esp32-simulator-01",
      "temperature_zone1": 181.2,
      "temperature_zone2": 199.8,
      "temperature_zone3": 194.5,
      "motor_speed": 30.3,
      "filament_diameter": 2.86,
      "winder_speed": 25.1,
      "timestamp": "2026-04-05T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/command`

Request body:

```json
{ "type": "SET_TEMPERATURE", "zone": 2, "value": 210 }
```

Response:

```json
{ "success": true, "message": "Command sent" }
```

---

## 🔌 WebSocket Protocol

**URL:** `ws://localhost:3002`

### Server → Client

```typescript
{ type: "telemetry",     payload: TelemetryData }          // ~every 1 s
{ type: "history",       payload: TelemetryData[] }        // once, on connect
{ type: "device_status", payload: DeviceStatusMessage }    // on MQTT connect/disconnect
```

### Client → Server

```typescript
{ type: "command", payload: DeviceCommand }    // relayed to MQTT broker
```

---

## 📻 MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `greenextrude/telemetry` | Device → Server | JSON `TelemetryData` |
| `greenextrude/command` | Server → Device | JSON `DeviceCommand` (QoS 1) |
| `greenextrude/status` | Device → Server | Status string |

---

## 🚦 Sensor Thresholds & Alerts

Alert thresholds can be configured in the Dashboard and Alerts components:

| Sensor | Warning | Danger |
|---|---|---|
| Any temperature zone | > 215 °C | > 230 °C |
| Filament diameter (target: 2.85 mm) | < 2.78 mm or > 2.92 mm | < 2.70 mm or > 3.00 mm |

---

## ✅ Prerequisites

| Tool | Minimum Version | Notes |
|---|---|---|
| **Node.js** | 18.x LTS | Tested on v20 |
| **npm** | 9.x | Bundled with Node |

No Docker, no Mosquitto, no external MQTT broker — Aedes is embedded in the server.

---

## 💾 Installation

Install dependencies for every sub-project (only needed once):

```bash
cd server    && npm install && cd ..
cd simulator && npm install && cd ..
cd client    && npm install && cd ..
```

Or simply run the launcher script — it installs automatically on first run.

---

## ▶️ Running the Project

Three services must run simultaneously. Open **three separate terminals**:

### Terminal 1 — Server

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

### Terminal 2 — Simulator

```bash
cd simulator
npm run dev
```

Expected output:
```
[SIM] Connecting to broker at mqtt://localhost:1883...
[SIM] Connected as "esp32-simulator-01"
[SIM] Subscribed to "greenextrude/command"
[SIM] → temp: 180.4/199.7/194.2°C | motor: 30.1 RPM | ⌀ 2.85mm
```

### Terminal 3 — React Client

```bash
cd client
npm start
```

The browser opens automatically at **http://localhost:3000**.

---

### One-click launcher

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

The scripts install missing `node_modules` automatically before starting.

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
- **Table:** `telemetry`

```sql
CREATE TABLE telemetry (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp          TEXT    NOT NULL DEFAULT (datetime('now')),
  temperature_zone1  REAL,
  temperature_zone2  REAL,
  temperature_zone3  REAL,
  motor_speed        REAL,
  filament_diameter  REAL,
  winder_speed       REAL,
  device_id          TEXT
);
```

Every telemetry insert is **immediately flushed to disk** (store-and-forward pattern), so no data is lost on server restart.  
On browser reconnect, the last 50 rows are automatically pushed to the dashboard.

