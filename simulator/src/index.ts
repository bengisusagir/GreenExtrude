import fs from "node:fs";
import path from "node:path";
import mqtt, { MqttClient } from "mqtt";
import {
  TelemetryData,
  DeviceCommand,
  MQTT_TOPICS,
} from "../../shared/types";

const BROKER_URL = process.env.MQTT_BROKER_URL ?? "mqtt://localhost:1883";
const DEVICE_ID = process.env.DEVICE_ID ?? "esp32-fake-01";
const PUBLISH_INTERVAL_MS = Number(process.env.TELEMETRY_INTERVAL_MS ?? 1000);
const RECONNECT_PERIOD_MS = Number(process.env.RECONNECT_PERIOD_MS ?? 5000);
const BUFFER_SIZE = Number(process.env.TELEMETRY_BUFFER_SIZE ?? 300);
const ANOMALY_CHANCE = Number(process.env.ANOMALY_CHANCE ?? 0.08);
const SETTINGS_PATH = path.resolve(
  process.env.SIM_SETTINGS_PATH ?? path.join(process.cwd(), "simulator-settings.json")
);

type SimState = {
  heater_1: number;
  heater_2: number;
  screw_motor_speed: number;
  filament_diameter: number;
  filament_diameter_setting: number;
  spool_motor_speed: number;
  set_point: number;
  running: boolean;
  fans_on: boolean;
};

type BufferedTelemetry = Omit<TelemetryData, "device_id">;

const defaults: SimState = {
  heater_1: 220,
  heater_2: 220,
  screw_motor_speed: 30,
  filament_diameter: 2.85,
  filament_diameter_setting: 2.85,
  spool_motor_speed: 25,
  set_point: 220,
  running: true,
  fans_on: true,
};

let state: SimState = loadSettings();
const telemetryBuffer: BufferedTelemetry[] = [];
let lastPublishAt = 0;
let publishTimer: NodeJS.Timeout | undefined;
let reconnectLogTimer: NodeJS.Timeout | undefined;

function loadSettings(): SimState {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<SimState>;
    const restored = { ...defaults, ...saved };
    restored.heater_1 = restored.set_point;
    restored.heater_2 = restored.set_point;
    restored.filament_diameter =
      restored.screw_motor_speed > 0 ? restored.filament_diameter_setting : 0;
    console.log(
      `[SETTINGS] Loaded sp=${restored.set_point} screw=${restored.screw_motor_speed} spool=${restored.spool_motor_speed} dia=${restored.filament_diameter_setting} fans=${restored.fans_on ? "ON" : "OFF"}`
    );
    return restored;
  } catch {
    console.log("[SETTINGS] No saved simulator settings found; using defaults");
    return { ...defaults };
  }
}

function saveSettings(): void {
  const settings = {
    set_point: state.set_point,
    heater_1: state.heater_1,
    heater_2: state.heater_2,
    screw_motor_speed: state.screw_motor_speed,
    spool_motor_speed: state.spool_motor_speed,
    filament_diameter_setting: state.filament_diameter_setting,
    filament_diameter: state.filament_diameter,
    fans_on: state.fans_on,
    running: state.running,
  };

  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampMin(value: number, min = 0): number {
  return Math.max(min, value);
}

function addNoise(value: number, range: number): number {
  return value + (Math.random() - 0.5) * range;
}

function maybeInjectAnomaly(
  value: number,
  normal: number,
  spikeHigh: number,
  spikeLow: number
): number {
  if (Math.random() < ANOMALY_CHANCE) {
    const spike = Math.random() > 0.5 ? spikeHigh : spikeLow;
    console.log(`[ANOMALY] ${round2(normal)} -> ${round2(spike)}`);
    return spike;
  }

  return value;
}

function readHeaterTemperature(zone: 1 | 2): number {
  if (zone === 1) {
    return clampMin(maybeInjectAnomaly(addNoise(state.heater_1, 3), state.heater_1, 245, 50));
  }

  return clampMin(maybeInjectAnomaly(addNoise(state.heater_2, 2), state.heater_2, 250, 40));
}

function readScrewMotorSpeed(): number {
  return clampMin(
    maybeInjectAnomaly(addNoise(state.screw_motor_speed, 1), state.screw_motor_speed, 80, 0)
  );
}

function readFilamentDiameter(): number {
  if (state.screw_motor_speed <= 0 || !state.running) {
    return 0;
  }

  return clampMin(
    maybeInjectAnomaly(
      addNoise(state.filament_diameter, 0.08),
      state.filament_diameter,
      3.25,
      2.5
    )
  );
}

function readSpoolMotorSpeed(): number {
  return clampMin(
    maybeInjectAnomaly(addNoise(state.spool_motor_speed, 0.5), state.spool_motor_speed, 70, 0)
  );
}

function buildTelemetry(): BufferedTelemetry {
  return {
    heater_1: round2(readHeaterTemperature(1)),
    heater_2: round2(readHeaterTemperature(2)),
    screw_motor_speed: round2(readScrewMotorSpeed()),
    filament_diameter: round2(readFilamentDiameter()),
    filament_diameter_setting: round2(state.filament_diameter_setting),
    spool_motor_speed: round2(readSpoolMotorSpeed()),
    set_point: round2(state.set_point),
    fans_on: state.fans_on,
    timestamp: new Date().toISOString(),
  };
}

function pushToBuffer(data: BufferedTelemetry): void {
  if (telemetryBuffer.length >= BUFFER_SIZE) {
    telemetryBuffer.shift();
  }

  telemetryBuffer.push(data);
}

function publishStatus(status: "online" | "disconnected"): void {
  client.publish(
    MQTT_TOPICS.STATUS,
    JSON.stringify({ status, device_id: DEVICE_ID }),
    { qos: 1 },
    (err) => {
      if (err) {
        console.error(`[STATUS] Failed to publish ${status}:`, err.message);
      }
    }
  );
}

function publishTelemetry(data: BufferedTelemetry, historical = false): void {
  const payload: TelemetryData = {
    device_id: DEVICE_ID,
    ...data,
  };

  client.publish(MQTT_TOPICS.TELEMETRY, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.error("[TX] Transmission failed; pushing telemetry back to buffer:", err.message);
      pushToBuffer(data);
      return;
    }

    lastPublishAt = Date.now();
    console.log(
      `[TX${historical ? "-OFFLINE" : ""}] t1=${payload.heater_1} t2=${payload.heater_2} | screw=${payload.screw_motor_speed} | dia=${payload.filament_diameter} | spool=${payload.spool_motor_speed} | queue=${telemetryBuffer.length}`
    );
  });
}

function flushBufferedTelemetry(): void {
  if (!client.connected || telemetryBuffer.length === 0) {
    return;
  }

  const unsent = telemetryBuffer.shift();
  if (unsent) {
    publishTelemetry(unsent, Date.now() - Date.parse(unsent.timestamp ?? "") > 2000);
  }
}

function generateAndQueueTelemetry(): void {
  const telemetry = buildTelemetry();
  pushToBuffer(telemetry);
  console.log(`[BUFF] Generated telemetry packet. Queue size: ${telemetryBuffer.length}`);
  flushBufferedTelemetry();
}

function controlHeater(targetValue: number): void {
  state.heater_1 = targetValue;
  state.heater_2 = targetValue;
  state.set_point = targetValue;
}

function controlScrewMotorSpeed(speedValue: number): void {
  state.screw_motor_speed = clampMin(speedValue);
  state.filament_diameter =
    state.screw_motor_speed > 0 ? state.filament_diameter_setting : 0;
}

function controlSpoolMotorSpeed(speedValue: number): void {
  state.spool_motor_speed = clampMin(speedValue);
}

function controlFans(on: boolean): void {
  state.fans_on = on;
}

function executeEmergencyStop(): void {
  state.running = false;
  controlScrewMotorSpeed(0);
  controlSpoolMotorSpeed(0);
  controlFans(false);
}

function handleCommand(cmd: DeviceCommand): void {
  console.log("[RX] Command:", cmd);

  switch (cmd.type) {
    case "SET_TEMPERATURE":
      controlHeater(cmd.value ?? 0);
      saveSettings();
      console.log(`[CMD] Heaters target temperature -> ${state.set_point} C`);
      break;

    case "SET_SCREW_MOTOR_SPEED":
      controlScrewMotorSpeed(cmd.value ?? 0);
      saveSettings();
      console.log(`[CMD] Screw motor target speed -> ${state.screw_motor_speed} RPM`);
      break;

    case "SET_SPOOL_MOTOR_SPEED":
      controlSpoolMotorSpeed(cmd.value ?? 0);
      saveSettings();
      console.log(`[CMD] Spool motor target speed -> ${state.spool_motor_speed} RPM`);
      break;

    case "SET_FILAMENT_DIAMETER":
      state.filament_diameter_setting = cmd.value ?? 2.85;
      state.filament_diameter =
        state.screw_motor_speed > 0 ? state.filament_diameter_setting : 0;
      saveSettings();
      console.log(`[CMD] Filament diameter setting -> ${state.filament_diameter_setting} mm`);
      break;

    case "SET_FANS":
      controlFans(Boolean(cmd.value ?? 1));
      saveSettings();
      console.log(`[CMD] Fans -> ${state.fans_on ? "ON" : "OFF"}`);
      break;

    case "EMERGENCY_STOP":
      executeEmergencyStop();
      console.log("[CMD] EMERGENCY STOP RECEIVED - halted all actuators");
      break;

    case "START": {
      const saved = loadSettings();
      state.running = true;
      controlScrewMotorSpeed(saved.screw_motor_speed);
      controlSpoolMotorSpeed(saved.spool_motor_speed);
      console.log(
        `[CMD] System started. Resumed screw=${state.screw_motor_speed} RPM, spool=${state.spool_motor_speed} RPM`
      );
      break;
    }

    case "STOP":
      state.running = false;
      controlScrewMotorSpeed(0);
      controlSpoolMotorSpeed(0);
      controlFans(false);
      console.log("[CMD] System stopped");
      break;

    default:
      console.log("[CMD] Unknown command type:", (cmd as { type?: string }).type);
  }
}

console.log(`[SIM] GreenExtrude ESP32 fallback simulator starting as "${DEVICE_ID}"`);
console.log(`[MQTT] Connecting to broker at ${BROKER_URL}...`);

const client: MqttClient = mqtt.connect(BROKER_URL, {
  clientId: DEVICE_ID,
  clean: true,
  keepalive: 30,
  reconnectPeriod: RECONNECT_PERIOD_MS,
  will: {
    topic: MQTT_TOPICS.STATUS,
    payload: JSON.stringify({ status: "disconnected", device_id: DEVICE_ID }),
    qos: 1,
    retain: false,
  },
});

client.on("connect", () => {
  console.log("[MQTT] Connected");
  publishStatus("online");

  client.subscribe(MQTT_TOPICS.COMMAND, { qos: 1 }, (err) => {
    if (err) {
      console.error("[MQTT] Failed to subscribe to commands:", err.message);
      return;
    }

    console.log(`[MQTT] Subscribed to "${MQTT_TOPICS.COMMAND}"`);
  });

  flushBufferedTelemetry();
});

client.on("message", (_topic: string, message: Buffer) => {
  try {
    handleCommand(JSON.parse(message.toString()) as DeviceCommand);
  } catch (err) {
    console.error("[RX] JSON parse error:", (err as Error).message);
  }
});

client.on("error", (err) => {
  console.error("[MQTT] Error:", err.message);
});

client.on("offline", () => {
  console.log("[MQTT] Broker connection lost; buffering telemetry until reconnect");
});

client.on("reconnect", () => {
  console.log("[MQTT] Reconnect attempt...");
});

publishTimer = setInterval(() => {
  generateAndQueueTelemetry();
}, PUBLISH_INTERVAL_MS);

reconnectLogTimer = setInterval(() => {
  if (Date.now() - lastPublishAt > 5000) {
    console.log(`[LED] Fast blink equivalent: no successful publish for >5s, queue=${telemetryBuffer.length}`);
  } else if (Date.now() - lastPublishAt > 1500) {
    console.log("[LED] Blink equivalent: telemetry publish is delayed");
  }
}, 1000);

process.on("SIGINT", () => {
  console.log("\n[SIM] Shutting down simulator...");
  if (publishTimer) clearInterval(publishTimer);
  if (reconnectLogTimer) clearInterval(reconnectLogTimer);
  publishStatus("disconnected");
  client.end(false, {}, () => process.exit(0));
});
