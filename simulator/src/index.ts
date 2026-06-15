import mqtt, { MqttClient } from "mqtt";
import {
  TelemetryData,
  DeviceCommand,
  MQTT_TOPICS,
} from "../../shared/types";

// ─── Configuration ───
const BROKER_URL = "mqtt://localhost:1883";
const DEVICE_ID = "esp32-simulator-01";
const PUBLISH_INTERVAL_MS = 1000; // send data every 1 second

// ─── Simulated State ───
let state = {
  heater_1: 180, // °C — feed zone
  heater_2: 200, // °C — melt zone
  screw_motor_speed: 30,   // RPM
  filament_diameter: 2.85,  // mm
  filament_diameter_setting: 2.85, // mm — target/preset filament diameter
  spool_motor_speed: 25,    // RPM
  set_point: 220,
  running: true,
  fans_on: true,
};

// ─── Realistic noise/drift ───
function addNoise(value: number, range: number): number {
  return +(value + (Math.random() - 0.5) * range).toFixed(2);
}
// ─── Random anomaly injection (fake bad values) ───
const ANOMALY_CHANCE = 0.08; // 8% chance per tick

function maybeInjectAnomaly(value: number, normal: number, spikeHigh: number, spikeLow: number): number {
  if (Math.random() < ANOMALY_CHANCE) {
    const spike = Math.random() > 0.5 ? spikeHigh : spikeLow;
    console.log(`[SIM] ⚠ ANOMALY injected: ${normal} → ${spike}`);
    return spike;
  }
  return value;
}

function generateTelemetry(): TelemetryData {
  const temp1 = addNoise(state.heater_1, 3);
  const temp2 = addNoise(state.heater_2, 2);
  const screwMotor = addNoise(state.screw_motor_speed, 1);
  const diameter = addNoise(state.filament_diameter, 0.08);
  const spoolMotor = addNoise(state.spool_motor_speed, 0.5);

  return {
    device_id: DEVICE_ID,
    heater_1: maybeInjectAnomaly(temp1, state.heater_1, 245, 50),
    heater_2: maybeInjectAnomaly(temp2, state.heater_2, 250, 40),
    screw_motor_speed: maybeInjectAnomaly(screwMotor, state.screw_motor_speed, 80, 0),
    filament_diameter: maybeInjectAnomaly(diameter, state.filament_diameter, 3.25, 2.50),
    filament_diameter_setting: state.filament_diameter_setting,
    spool_motor_speed: maybeInjectAnomaly(spoolMotor, state.spool_motor_speed, 70, 0),
    set_point: state.set_point,
    fans_on: state.fans_on,
    timestamp: new Date().toISOString(),
  };
}

// ─── Connect to MQTT Broker ───
console.log(`[SIM] Connecting to broker at ${BROKER_URL}...`);
const client: MqttClient = mqtt.connect(BROKER_URL, {
  clientId: DEVICE_ID,
  clean: true,
});

client.on("connect", () => {
  console.log(`[SIM] Connected as "${DEVICE_ID}"`);

  // Subscribe to commands from the server
  client.subscribe(MQTT_TOPICS.COMMAND, (err) => {
    if (err) {
      console.error("[SIM] Failed to subscribe to commands:", err.message);
    } else {
      console.log(`[SIM] Subscribed to "${MQTT_TOPICS.COMMAND}"`);
    }
  });

  // Publish status
  client.publish(MQTT_TOPICS.STATUS, JSON.stringify({ status: "online", device_id: DEVICE_ID }));

  // Start publishing telemetry
  setInterval(() => {
    if (!state.running) return;

    const data = generateTelemetry();
    const payload = JSON.stringify(data);
    client.publish(MQTT_TOPICS.TELEMETRY, payload);
    console.log(
      `[SIM] → ${data.heater_1}/${data.heater_2}°C | screw: ${data.screw_motor_speed} RPM | spool: ${data.spool_motor_speed} RPM | ⌀ ${data.filament_diameter}mm`
    );
  }, PUBLISH_INTERVAL_MS);
});

// ─── Handle commands from the server ───
client.on("message", (_topic: string, message: Buffer) => {
  try {
    const cmd: DeviceCommand = JSON.parse(message.toString());
    console.log(`[SIM] ← Command received:`, cmd);

    switch (cmd.type) {
      case "SET_TEMPERATURE":
        state.heater_1 = cmd.value ?? state.heater_1; state.set_point = cmd.value ?? state.set_point;
        console.log(`[SIM] Heater ${cmd.zone} set to ${cmd.value}°C`);
        break;

      case "SET_SCREW_MOTOR_SPEED":
        state.screw_motor_speed = cmd.value ?? state.screw_motor_speed;
        console.log(`[SIM] Screw motor speed set to ${cmd.value} RPM`);
        break;

      case "SET_SPOOL_MOTOR_SPEED":
        state.spool_motor_speed = cmd.value ?? state.spool_motor_speed;
        console.log(`[SIM] Spool motor speed set to ${cmd.value} RPM`);
        break;

      case "SET_FILAMENT_DIAMETER":
        state.filament_diameter_setting = cmd.value ?? 2.85;
        console.log(`[SIM] Filament diameter setting set to ${state.filament_diameter_setting}mm`);
        break;

      case "SET_FANS":
        state.fans_on = !!cmd.value;
        console.log(`[SIM] Fans ${state.fans_on ? "ON" : "OFF"}`);
        break;

      case "EMERGENCY_STOP":
        state.running = false;
        state.screw_motor_speed = 0;
        state.spool_motor_speed = 0;
        state.fans_on = false;
        console.log("[SIM] ⚠ EMERGENCY STOP — all motors halted, fans off");
        break;

      case "START":
        state.running = true;
        state.screw_motor_speed = 30;
        state.spool_motor_speed = 25;
        console.log("[SIM] System started");
        break;

      case "STOP":
        state.running = false;
        state.fans_on = false;
        console.log("[SIM] System stopped gracefully");
        break;

      default:
        console.log("[SIM] Unknown command type:", cmd.type);
    }
  } catch (err) {
    console.error("[SIM] Failed to parse command:", (err as Error).message);
  }
});

client.on("error", (err) => {
  console.error("[SIM] MQTT error:", err.message);
});

client.on("offline", () => {
  console.log("[SIM] Broker connection lost, retrying...");
});

// Graceful exit
process.on("SIGINT", () => {
  console.log("\n[SIM] Shutting down simulator...");
  client.end();
  process.exit(0);
});
