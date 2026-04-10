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
  temperature_zone1: 180, // °C — feed zone
  temperature_zone2: 200, // °C — melt zone
  temperature_zone3: 195, // °C — nozzle zone
  motor_speed: 30,        // RPM
  filament_diameter: 2.85, // mm
  winder_speed: 25,       // RPM
  running: true,
};

// ─── Realistic noise/drift ───
function addNoise(value: number, range: number): number {
  return +(value + (Math.random() - 0.5) * range).toFixed(2);
}

function generateTelemetry(): TelemetryData {
  return {
    device_id: DEVICE_ID,
    temperature_zone1: addNoise(state.temperature_zone1, 3),
    temperature_zone2: addNoise(state.temperature_zone2, 2),
    temperature_zone3: addNoise(state.temperature_zone3, 2.5),
    motor_speed: addNoise(state.motor_speed, 1),
    filament_diameter: addNoise(state.filament_diameter, 0.08),
    winder_speed: addNoise(state.winder_speed, 0.5),
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
      `[SIM] → temp: ${data.temperature_zone1}/${data.temperature_zone2}/${data.temperature_zone3}°C | motor: ${data.motor_speed} RPM | ⌀ ${data.filament_diameter}mm`
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
        if (cmd.zone === 1) state.temperature_zone1 = cmd.value ?? state.temperature_zone1;
        if (cmd.zone === 2) state.temperature_zone2 = cmd.value ?? state.temperature_zone2;
        if (cmd.zone === 3) state.temperature_zone3 = cmd.value ?? state.temperature_zone3;
        console.log(`[SIM] Temperature zone ${cmd.zone} set to ${cmd.value}°C`);
        break;

      case "SET_MOTOR_SPEED":
        state.motor_speed = cmd.value ?? state.motor_speed;
        console.log(`[SIM] Motor speed set to ${cmd.value} RPM`);
        break;

      case "SET_WINDER_SPEED":
        state.winder_speed = cmd.value ?? state.winder_speed;
        console.log(`[SIM] Winder speed set to ${cmd.value} RPM`);
        break;

      case "EMERGENCY_STOP":
        state.running = false;
        state.motor_speed = 0;
        state.winder_speed = 0;
        console.log("[SIM] ⚠ EMERGENCY STOP — all motors halted");
        break;

      case "START":
        state.running = true;
        state.motor_speed = 30;
        state.winder_speed = 25;
        console.log("[SIM] System started");
        break;

      case "STOP":
        state.running = false;
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
