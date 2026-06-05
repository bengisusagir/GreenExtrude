import Aedes from "aedes";
import { createServer as createTcpServer } from "net";
import { insertTelemetry } from "./database";
import {
  TelemetryData,
  DeviceCommand,
  MQTT_TOPICS,
  WsMessage,
  DeviceStatusMessage,
} from "../../shared/types";

const DEFAULT_MQTT_PORT = 1883;

let aedes: Aedes;
let mqttServer: ReturnType<typeof createTcpServer>;
let lastDeviceStatus: DeviceStatusMessage | null = null;

type BroadcastFn = (data: string) => void;

export function getLastDeviceStatus(): DeviceStatusMessage | null {
  return lastDeviceStatus;
}

export function closeMqttBroker(): Promise<void> {
  return new Promise((resolve) => {
    if (!aedes) { resolve(); return; }
    aedes.close(() => {
      if (mqttServer) {
        mqttServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });
}

export function initMqttBroker(wsBroadcast: BroadcastFn, port?: number): Aedes {
  const mqttPort = port ?? DEFAULT_MQTT_PORT;
  aedes = new Aedes();

  mqttServer = createTcpServer(aedes.handle);
  mqttServer.listen(mqttPort, () => {
    console.log(`[MQTT] Broker running on tcp://localhost:${mqttPort}`);
  });

  // Client connected
  aedes.on("client", (client) => {
    console.log(`[MQTT] Client connected: ${client.id}`);

    const msg: WsMessage<DeviceStatusMessage> = {
      type: "device_status",
      payload: { clientId: client.id, status: "connected" },
    };
    lastDeviceStatus = msg.payload;
    wsBroadcast(JSON.stringify(msg));
  });

  // Client disconnected
  aedes.on("clientDisconnect", (client) => {
    console.log(`[MQTT] Client disconnected: ${client.id}`);

    const msg: WsMessage<DeviceStatusMessage> = {
      type: "device_status",
      payload: { clientId: client.id, status: "disconnected" },
    };
    lastDeviceStatus = msg.payload;
    wsBroadcast(JSON.stringify(msg));
  });

  // Message published
  aedes.on("publish", (packet, client) => {
    if (!client) return; // ignore $SYS

    const topic = packet.topic;
    const raw = packet.payload.toString();

    if (topic === MQTT_TOPICS.TELEMETRY) {
      try {
        const data: TelemetryData = JSON.parse(raw);
        insertTelemetry(data);

        const msg: WsMessage<TelemetryData> = {
          type: "telemetry",
          payload: data,
        };
        wsBroadcast(JSON.stringify(msg));
      } catch (err) {
        console.error("[MQTT] Failed to parse telemetry:", (err as Error).message);
      }
    }

    if (topic === MQTT_TOPICS.STATUS) {
      const msg: WsMessage<DeviceStatusMessage> = {
        type: "device_status",
        payload: { clientId: client?.id ?? "unknown", status: "connected", message: raw },
      };
      wsBroadcast(JSON.stringify(msg));
    }
  });

  return aedes;
}

export function sendCommand(command: DeviceCommand): void {
  if (!aedes) return;
  aedes.publish(
    {
      topic: MQTT_TOPICS.COMMAND,
      payload: Buffer.from(JSON.stringify(command)),
      qos: 1,
      retain: false,
      cmd: "publish",
      dup: false,
    },
    () => {}
  );
  console.log("[MQTT] Command sent:", command);
}
